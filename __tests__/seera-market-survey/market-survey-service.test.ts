import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Unit tests for the Retailer Market Survey & Recovery service with an in-memory fake database.
// No real database, no Meta call: the messaging provider is never invoked in these tests.

const perms = new Map<string, Set<string>>();
vi.mock("@/lib/foundation/authorization-service", () => ({
  effectivePermissions: async (_db: unknown, userId: string) => perms.get(userId) ?? new Set<string>(),
  authorize: async (_db: unknown, input: { actorId: string; permission: string }) => {
    const p = perms.get(input.actorId) ?? new Set<string>();
    if (!p.has(input.permission) && !p.has("system:super_admin")) throw Object.assign(new Error("Permission denied"), { name: "FoundationError", code: "ACCESS_DENIED", status: 403 });
  },
}));
vi.mock("@/lib/foundation/audit-service", () => ({ recordAudit: vi.fn(async () => undefined) }));
const sendWhatsApp = vi.fn();
vi.mock("@/lib/messaging", () => ({ getMessagingProvider: () => ({ sendWhatsApp }) }));

// Template approval is controlled per test (the real registry keeps survey templates unapproved).
const approved = { value: false };
vi.mock("@/lib/messaging/whatsapp-templates", async (orig) => {
  const real = await orig<typeof import("@/lib/messaging/whatsapp-templates")>();
  return {
    ...real,
    templateFor: (key: Parameters<typeof real.templateFor>[0]) => {
      const t = real.templateFor(key);
      return approved.value && key.startsWith("MARKET_SURVEY") ? { ...t, approvalStatus: "APPROVED" as const, languageCode: "hi", category: "UTILITY" } : t;
    },
  };
});

const svc = await import("@/lib/sales-distribution/market-survey-service");
const realTemplates = await vi.importActual<typeof import("@/lib/messaging/whatsapp-templates")>("@/lib/messaging/whatsapp-templates");

type Row = Record<string, any>;
function fakeDb() {
  const surveys: Row[] = [];
  const outbox: Row[] = [];
  const activities: Row[] = [];
  const links: Row[] = [];
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "AND") return (v as Row[]).every((w) => matches(row, w));
      if (k === "NOT") return !matches(row, v as Row);
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if ("in" in v) return (v.in as unknown[]).includes(row[k]);
        if ("not" in v) return row[k] !== v.not;
        return false;
      }
      return row[k] === v;
    });
  const db: any = {
    surveys, outbox, activities, links,
    user: { findUnique: async () => ({ name: "Test Rep", status: "ACTIVE" }) },
    seeraRetailer: { findUnique: async () => null, findMany: async () => [] },
    seeraMarketSurvey: {
      // Like Prisma: a fresh copy (never the stored object), with the links relation attached.
      findUnique: async ({ where }: { where: Row }) => {
        const row = surveys.find((s) => matches(s, where));
        return row ? { ...row, links: links.filter((l) => l.surveyId === row.id).map((l) => ({ ...l })) } : null;
      },
      findFirst: async ({ where }: { where: Row }) => [...surveys].reverse().find((s) => matches(s, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        if (surveys.some((s) => s.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: id("sv"), followUpOutboxEventId: null, createdAt: new Date(), ...data };
        surveys.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = surveys.filter((s) => matches(s, where));
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(surveys.find((s) => s.id === where.id)!, data),
    },
    seeraMarketSurveyActivity: { create: async ({ data }: { data: Row }) => activities.push(data), createMany: async ({ data }: { data: Row[] }) => activities.push(...data) },
    seeraMarketSurveyLink: { updateMany: async () => ({ count: 0 }), create: async ({ data }: { data: Row }) => { const r = { id: id("ln"), ...data }; links.push(r); return r; }, update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(links.find((l) => l.id === where.id)!, data) },
    outboxEvent: {
      create: async ({ data }: { data: Row }) => { const r = { id: id("ob"), attempts: 0, providerMessageId: null, lastErrorCode: null, ...data }; outbox.push(r); return r; },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = outbox.filter((o) => matches(o, where));
        hit.forEach((o) => Object.assign(o, data));
        return { count: hit.length };
      },
      findMany: async () => [],
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return db;
}

const STAFF = "staff-1";
const MANAGER = "manager-1";
const base = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: "key-0123456789abcdef",
  shopName: "Sharma General Store",
  market: "Sadar Bazaar",
  relationship: "STOPPED",
  issues: ["QUALITY", "SUPPLY"],
  willingToReconsider: "MAYBE",
  shelfSpace: "YES",
  trialQuantityOk: "UNKNOWN",
  consentStatus: "NOT_ASKED",
  ...over,
});
const consented = (over: Record<string, unknown> = {}) => base({ mobile: "98765 43210", consentStatus: "GRANTED", consentScopes: ["SURVEY_FOLLOW_UP"], ...over });
const ON = { SEERA_MARKET_SURVEY_WHATSAPP_ENABLED: "true" };

beforeEach(() => {
  perms.clear();
  perms.set(STAFF, new Set(["market_survey:create"]));
  perms.set(MANAGER, new Set(["market_survey:create", "market_survey:view_all", "market_survey:manage"]));
  approved.value = false;
  sendWhatsApp.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("survey validation", () => {
  it("requires shop name, market, relationship and readiness answers", () => {
    const r = svc.marketSurveyInput.safeParse({ idempotencyKey: "key-0123456789abcdef", consentStatus: "NOT_ASKED" });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    for (const f of ["shopName", "market", "relationship", "willingToReconsider", "shelfSpace", "trialQuantityOk"]) expect(fields).toContain(f);
  });
  it("validates Indian mobile numbers and normalizes them", async () => {
    expect(svc.marketSurveyInput.safeParse(base({ mobile: "12345" })).success).toBe(false);
    expect(svc.marketSurveyInput.safeParse(base({ mobile: "5876543210" })).success).toBe(false);
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base({ mobile: "+91 98765-43210" }));
    expect(survey.mobile).toBe("919876543210");
  });
  it("requires a mobile only when follow-up contact is being collected", () => {
    expect(svc.marketSurveyInput.safeParse(base()).success).toBe(true);
    expect(svc.marketSurveyInput.safeParse(base({ wantsFollowUp: true })).success).toBe(false);
    expect(svc.marketSurveyInput.safeParse(base({ consentStatus: "GRANTED", consentScopes: ["SURVEY_FOLLOW_UP"] })).success).toBe(false);
  });
  it("consent scopes are required when granted and rejected otherwise; 'other' needs a description", () => {
    expect(svc.marketSurveyInput.safeParse(base({ mobile: "9876543210", consentStatus: "GRANTED" })).success).toBe(false);
    expect(svc.marketSurveyInput.safeParse(base({ consentStatus: "REFUSED", consentScopes: ["SURVEY_FOLLOW_UP"] })).success).toBe(false);
    expect(svc.marketSurveyInput.safeParse(consented({ consentScopes: ["OTHER"] })).success).toBe(false);
    expect(svc.marketSurveyInput.safeParse(base({ issues: ["OTHER"] })).success).toBe(false);
  });
  it("rejects unknown issue codes", () => {
    expect(svc.marketSurveyInput.safeParse(base({ issues: ["MADE_UP"] })).success).toBe(false);
  });
});

describe("submitMarketSurvey", () => {
  it("persists a valid survey with multiple issues and the authenticated staff id (not a client value)", async () => {
    const db = fakeDb();
    const { survey, replayed } = await svc.submitMarketSurvey(db, STAFF, { ...base({ issues: ["QUALITY", "SUPPLY", "QUALITY"] }), staffUserId: "someone-else" });
    expect(replayed).toBe(false);
    expect(db.surveys).toHaveLength(1);
    expect(survey.staffUserId).toBe(STAFF);
    expect(survey.issues).toEqual(["QUALITY", "SUPPLY"]);
    expect(survey.reference).toMatch(/^MS-\d{8}-[0-9A-F]{8}$/);
    expect(db.activities[0]).toMatchObject({ type: "SUBMITTED", actorId: STAFF });
  });
  it("rejects users without market_survey:create and stores nothing", async () => {
    const db = fakeDb();
    await expect(svc.submitMarketSurvey(db, "nobody", base())).rejects.toThrow();
    expect(db.surveys).toHaveLength(0);
  });
  it("a duplicate submit with the same key returns the original record and creates no second survey or message", async () => {
    approved.value = true;
    const db = fakeDb();
    const first = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    const second = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    expect(second.replayed).toBe(true);
    expect(second.survey.id).toBe(first.survey.id);
    expect(db.surveys).toHaveLength(1);
    expect(db.outbox).toHaveLength(1);
  });
  it("another user cannot replay someone else's idempotency key", async () => {
    const db = fakeDb();
    await svc.submitMarketSurvey(db, STAFF, base());
    perms.set("staff-2", new Set(["market_survey:create"]));
    await expect(svc.submitMarketSurvey(db, "staff-2", base())).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("no consent: survey saved, no WhatsApp event, state SKIPPED_NO_CONSENT", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base({ mobile: "9876543210", consentStatus: "REFUSED" }), ON);
    expect(survey.whatsappState).toBe("SKIPPED_NO_CONSENT");
    expect(db.outbox).toHaveLength(0);
  });
  it("consent for catalogue only does not allow the survey follow-up message", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented({ consentScopes: ["CATALOGUE_ORDER_INFO"] }), ON);
    expect(survey.whatsappState).toBe("SKIPPED_NO_CONSENT");
    expect(db.outbox).toHaveLength(0);
  });
  it("template not approved: survey saved, visible AWAITING_TEMPLATE_CONFIGURATION, no event", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    expect(survey.whatsappState).toBe("AWAITING_TEMPLATE_CONFIGURATION");
    expect(db.outbox).toHaveLength(0);
  });
  it("switch off: nothing queued even with consent and an approved template", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), {});
    expect(survey.whatsappState).toBe("DISPATCH_DISABLED");
    expect(db.outbox).toHaveLength(0);
  });
  it("all gates pass: exactly one PENDING event with the governed template and ordered parameters", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented({ contactName: "Ramesh" }), ON);
    expect(db.outbox).toHaveLength(1);
    const ev = db.outbox[0];
    expect(ev).toMatchObject({ status: "PENDING", aggregateType: "SeeraMarketSurvey", aggregateId: survey.id, eventType: "MARKET_SURVEY_FOLLOW_UP", templateKey: "MARKET_SURVEY_FOLLOW_UP" });
    expect(ev.payload).toMatchObject({ mobile: "919876543210", templateName: "seera_market_survey_follow_up", languageCode: "hi" });
    expect(ev.payload.templateParams).toEqual(["Ramesh", "Test Rep", "Sharma General Store", expect.any(String)]);
    expect(db.surveys[0].followUpOutboxEventId).toBe(ev.id);
    expect(sendWhatsApp).not.toHaveBeenCalled(); // queuing never calls the provider inline
  });
  it("a later opt-out recorded for the same number blocks new follow-ups", async () => {
    approved.value = true;
    const db = fakeDb();
    await svc.submitMarketSurvey(db, STAFF, base({ idempotencyKey: "key-aaaaaaaaaaaaaaaa", mobile: "9876543210", consentStatus: "REFUSED", consentAt: new Date() }), ON);
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented({ idempotencyKey: "key-bbbbbbbbbbbbbbbb" }), ON);
    expect(survey.whatsappState).toBe("SKIPPED_OPTED_OUT");
  });
  it("the survey is still saved when the messaging provider is unavailable", async () => {
    approved.value = true;
    sendWhatsApp.mockRejectedValue(new Error("Meta down"));
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    expect(db.surveys).toHaveLength(1);
    expect(survey.id).toBeTruthy();
  });
});

describe("decideWhatsApp", () => {
  const db = { seeraMarketSurvey: { findFirst: async () => null } } as never;
  const input = { consentStatus: "GRANTED", consentScopes: ["SURVEY_FOLLOW_UP"], mobile: "919876543210", requiredScope: "SURVEY_FOLLOW_UP" as const, templateKey: "MARKET_SURVEY_FOLLOW_UP" as const };
  it("reports each blocking reason", async () => {
    approved.value = true;
    expect((await svc.decideWhatsApp(db, { ...input, mobile: null }, ON)).state).toBe("NO_MOBILE");
    expect((await svc.decideWhatsApp(db, { ...input, mobile: "12345" }, ON)).state).toBe("INVALID_MOBILE");
    expect((await svc.decideWhatsApp(db, { ...input, consentStatus: "NOT_ASKED" }, ON)).state).toBe("SKIPPED_NO_CONSENT");
    expect((await svc.decideWhatsApp(db, input, {})).state).toBe("DISPATCH_DISABLED");
    expect((await svc.decideWhatsApp(db, input, ON)).state).toBe("QUEUED");
    approved.value = false;
    expect((await svc.decideWhatsApp(db, input, ON)).state).toBe("AWAITING_TEMPLATE_CONFIGURATION");
  });
});

describe("follow-up management", () => {
  it("staff without manage permission cannot update, retry, opt out or create links", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base());
    await expect(svc.updateMarketSurveyFollowUp(db, STAFF, survey.id, { status: "RESOLVED" })).rejects.toThrow();
    await expect(svc.retryMarketSurveyWhatsApp(db, STAFF, survey.id)).rejects.toThrow();
    await expect(svc.recordMarketSurveyOptOut(db, STAFF, survey.id, { basis: "said no" })).rejects.toThrow();
    await expect(svc.createMarketSurveyCatalogueLink(db, STAFF, survey.id, {})).rejects.toThrow();
  });
  it("status change persists and is recorded in history", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base());
    await svc.updateMarketSurveyFollowUp(db, MANAGER, survey.id, { status: "INTERESTED_IN_TRIAL", trialAgreed: true, note: "Called back" });
    expect(db.surveys[0]).toMatchObject({ followUpStatus: "INTERESTED_IN_TRIAL", trialAgreed: true });
    expect(db.activities.map((a: Row) => a.type)).toEqual(expect.arrayContaining(["STATUS_CHANGED", "TRIAL_RECORDED", "NOTE"]));
  });
  it("re-queue after the template is approved creates exactly one event, and a second retry does not duplicate", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    expect(db.outbox).toHaveLength(0);
    approved.value = true;
    expect((await svc.retryMarketSurveyWhatsApp(db, MANAGER, survey.id, ON)).state).toBe("QUEUED");
    expect(db.outbox).toHaveLength(1);
    await expect(svc.retryMarketSurveyWhatsApp(db, MANAGER, survey.id, ON)).rejects.toMatchObject({ code: "RETRY_NOT_ALLOWED" });
    expect(db.outbox).toHaveLength(1);
  });
  it("retry never resends a message the provider already accepted", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    Object.assign(db.outbox[0], { status: "DEAD_LETTER", providerMessageId: "wamid.X" });
    await expect(svc.retryMarketSurveyWhatsApp(db, MANAGER, survey.id, ON)).rejects.toMatchObject({ code: "RETRY_NOT_ALLOWED" });
    Object.assign(db.outbox[0], { providerMessageId: null, lastErrorCode: "SEND_FAILED" });
    expect((await svc.retryMarketSurveyWhatsApp(db, MANAGER, survey.id, ON)).state).toBe("QUEUED");
    expect(db.outbox[0]).toMatchObject({ status: "PENDING", attempts: 0 });
  });
  it("opt-out cancels an unsent message and cannot be retried afterwards", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    await svc.recordMarketSurveyOptOut(db, MANAGER, survey.id, { basis: "Asked on phone not to message" });
    expect(db.outbox[0]).toMatchObject({ status: "DEAD_LETTER", lastErrorCode: "CONSENT_WITHDRAWN" });
    expect(db.surveys[0]).toMatchObject({ consentStatus: "REFUSED", consentScopes: [] });
    await expect(svc.retryMarketSurveyWhatsApp(db, MANAGER, survey.id, ON)).rejects.toMatchObject({ code: "RETRY_NOT_ALLOWED" });
  });
  it("opt-out requires a recorded basis", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base());
    await expect(svc.recordMarketSurveyOptOut(db, MANAGER, survey.id, { basis: "" })).rejects.toThrow();
  });
});

describe("catalogue links", () => {
  it("creates an unguessable HTTPS link on the canonical domain and stores only its hash", async () => {
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, base());
    const link = await svc.createMarketSurveyCatalogueLink(db, MANAGER, survey.id, { send: false });
    expect(link.url).toMatch(/^https:\/\/www\.seeradetergent\.in\/c\/[A-Za-z0-9_-]{32}$/);
    const token = link.url.split("/").pop()!;
    expect(db.links[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.links)).not.toContain(token);
    expect(link.url).not.toContain(survey.id);
  });
  it("sending the link needs catalogue consent", async () => {
    approved.value = true;
    const db = fakeDb();
    const { survey } = await svc.submitMarketSurvey(db, STAFF, consented(), ON);
    const before = db.outbox.length;
    const link = await svc.createMarketSurveyCatalogueLink(db, MANAGER, survey.id, { send: true }, ON);
    expect(link.whatsappState).toBe("SKIPPED_NO_CONSENT");
    expect(db.outbox.length).toBe(before);
  });
});

describe("display, export and gating helpers", () => {
  it("maps outbox status honestly (never marks unsent as sent)", () => {
    expect(svc.whatsappDisplayState({ whatsappState: "AWAITING_TEMPLATE_CONFIGURATION" }, null)).toBe("AWAITING_TEMPLATE_CONFIGURATION");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "PENDING", lastErrorCode: null })).toBe("QUEUED");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "PUBLISHED", lastErrorCode: null })).toBe("SENT");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "DELIVERED", lastErrorCode: null })).toBe("DELIVERED");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "FAILED", lastErrorCode: "X" })).toBe("RETRYING");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "DEAD_LETTER", lastErrorCode: "X" })).toBe("FAILED");
    expect(svc.whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "DEAD_LETTER", lastErrorCode: "CONSENT_WITHDRAWN" })).toBe("CANCELLED_OPT_OUT");
  });
  it("CSV cells are quoted and spreadsheet-formula safe", () => {
    expect(svc.csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(svc.csvCell("-5")).toBe(`"'-5"`);
    expect(svc.csvCell(["A", "B"])).toBe(`"A|B"`);
    expect(svc.csvCell(null)).toBe(`""`);
  });
  it("the survey batch worker does nothing unless the survey switch is on", async () => {
    const db = { outboxEvent: { updateMany: vi.fn(), findMany: vi.fn() } } as never;
    expect(await svc.dispatchMarketSurveyCommunications(db, () => ({ sendWhatsApp }), {}, {})).toEqual([]);
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });
  it("the real registry keeps both survey templates unsendable until the Founder supplies approved values", () => {
    for (const key of ["MARKET_SURVEY_FOLLOW_UP", "MARKET_SURVEY_CATALOGUE_LINK"] as const) {
      const t = realTemplates.templateFor(key);
      expect(t.approvalStatus).toBe("PENDING_META_APPROVAL");
      expect(t.languageCode).toBeNull();
      expect(realTemplates.isTemplateSendable(t)).toBe(false);
    }
  });
  it("masks mobiles for viewers without view-all access", () => {
    expect(svc.maskMobile("919876543210")).toBe("9198••••10");
  });
});
