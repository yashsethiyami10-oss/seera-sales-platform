import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { fetchTemplates, MetaApiError, sendInteractive, sendMedia, sendTemplate, sendText } from "./meta";
import { cleanCity, groupAreas, normalizeState, resolveArea, stateKeyOf } from "./areas";
import {
  decide,
  inboundKeyword,
  pickAutoReply,
  parseContactLines,
  isQuietTime,
  nextRunAfter,
  parseTemplateComponents,
  PARTY_TYPES,
  type PartyType,
  type Recipient,
  renderPreview,
  VARIABLE_SOURCES,
  variableValue,
  type VariableMapping,
  type VariableSource,
  withinServiceWindow,
} from "./rules";

// Seera WhatsApp Hub engine. Founder/Admin only (notifications:manage). Every send passes the
// global switch, quiet hours, opt-out and the marketing frequency cap at the moment it is sent,
// so a setting changed now applies to messages already queued.

const SETTINGS_ID = "global";
const EXCLUDED_LIFECYCLES = ["SUSPENDED", "DEACTIVATED", "CLOSED", "INACTIVE", "REJECTED"] as const;
const MAX_ATTEMPTS = 5;

export async function requireHub(db: PrismaClient, actorId: string) {
  const p = await effectivePermissions(db, actorId);
  if (!p.has("system:super_admin") && !p.has("notifications:manage"))
    throw new FoundationError("ACCESS_DENIED", "WhatsApp Hub is for the Founder / Admin only", 403);
}

// ---------------- Settings ----------------
export async function getSettings(db: PrismaClient) {
  const row = await db.seeraWaSettings.findUnique({ where: { id: SETTINGS_ID } }).catch(() => null);
  return {
    sendEnabled: row?.sendEnabled ?? false,
    quietHoursEnabled: row?.quietHoursEnabled ?? true,
    quietStartMinute: row?.quietStartMinute ?? 1260,
    quietEndMinute: row?.quietEndMinute ?? 540,
    marketingGapDays: row?.marketingGapDays ?? 2,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function updateSettings(
  db: PrismaClient,
  actorId: string,
  patch: Partial<{ sendEnabled: boolean; quietHoursEnabled: boolean; quietStartMinute: number; quietEndMinute: number; marketingGapDays: number }>,
) {
  await requireHub(db, actorId);
  const clampMin = (v: number | undefined) => (v === undefined ? undefined : Math.max(0, Math.min(1439, Math.round(v))));
  const data = {
    ...(patch.sendEnabled !== undefined ? { sendEnabled: patch.sendEnabled } : {}),
    ...(patch.quietHoursEnabled !== undefined ? { quietHoursEnabled: patch.quietHoursEnabled } : {}),
    ...(patch.quietStartMinute !== undefined ? { quietStartMinute: clampMin(patch.quietStartMinute) } : {}),
    ...(patch.quietEndMinute !== undefined ? { quietEndMinute: clampMin(patch.quietEndMinute) } : {}),
    ...(patch.marketingGapDays !== undefined ? { marketingGapDays: Math.max(0, Math.min(30, Math.round(patch.marketingGapDays))) } : {}),
    updatedById: actorId,
  };
  await db.seeraWaSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  await recordAudit(db, { actorId, action: "whatsapp_hub.settings_updated", entityType: "SeeraWaSettings", entityId: SETTINGS_ID, afterState: data });
  return getSettings(db);
}

// ---------------- Templates ----------------
export async function syncTemplates(db: PrismaClient, actorId: string) {
  await requireHub(db, actorId);
  const list = await fetchTemplates();
  const now = new Date();
  for (const t of list) {
    const parsed = parseTemplateComponents(t.components);
    const data = {
      metaId: t.id,
      status: t.status,
      category: t.category ?? null,
      headerFormat: parsed.headerFormat,
      bodyText: parsed.bodyText,
      variableNames: parsed.variableNames,
      components: (t.components ?? []) as Prisma.InputJsonValue,
      syncedAt: now,
    };
    await db.seeraWaTemplate.upsert({ where: { name_language: { name: t.name, language: t.language } }, create: { name: t.name, language: t.language, ...data }, update: data });
  }
  // A template deleted on Meta disappears from the list: mark it so it can no longer be chosen.
  await db.seeraWaTemplate.updateMany({ where: { syncedAt: { lt: now } }, data: { status: "DELETED_ON_META" } });
  await recordAudit(db, { actorId, action: "whatsapp_hub.templates_synced", entityType: "SeeraWaTemplate", details: { count: list.length } });
  return listTemplates(db);
}

export async function listTemplates(db: PrismaClient) {
  const rows = await db.seeraWaTemplate.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
  return rows.map((t) => ({
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    headerFormat: t.headerFormat,
    bodyText: t.bodyText,
    variableNames: t.variableNames,
    named: t.variableNames.some((v) => !/^\d+$/.test(v)),
    hasTextHeaderVariable: JSON.stringify(t.components ?? []).includes('"format":"TEXT"') && /HEADER[^}]*\{\{/.test(JSON.stringify(t.components ?? [])),
    syncedAt: t.syncedAt.toISOString(),
  }));
}

async function approvedTemplate(db: PrismaClient, name: string, language: string) {
  const t = await db.seeraWaTemplate.findUnique({ where: { name_language: { name, language } } });
  if (!t) throw new FoundationError("WA_TEMPLATE_UNKNOWN", "This template is not synced from Meta yet — press Sync templates", 400);
  if (t.status !== "APPROVED") throw new FoundationError("WA_TEMPLATE_NOT_APPROVED", `Template "${name}" is ${t.status} on Meta — only APPROVED templates can be sent`, 400);
  return { ...t, named: t.variableNames.some((v) => !/^\d+$/.test(v)) };
}

// ---------------- Audience ----------------
// areaKeys: area-wise sending — city keys ("rajasthan|gangapur") and/or whole states
// ("state:uttar-pradesh"). Empty / absent = every area.
// manualGroups: with MANUAL, only contacts in these groups (empty / absent = every manual contact).
// excludeAreaKeys: send to everyone EXCEPT these cities / states (e.g. "state:uttar-pradesh").
export type Audience = { partyTypes: PartyType[]; distributorIds?: string[]; territoryIds?: string[]; areaKeys?: string[]; excludeAreaKeys?: string[]; manualGroups?: string[] };

export async function resolveAudience(db: PrismaClient, audience: Audience): Promise<Recipient[]> {
  const types = (audience.partyTypes ?? []).filter((t) => PARTY_TYPES.includes(t));
  const out: Recipient[] = [];
  const territory = audience.territoryIds?.length ? audience.territoryIds : null;
  const distributors = audience.distributorIds?.length ? audience.distributorIds : null;
  if (types.includes("RETAILER")) {
    const retailers = await db.seeraRetailer.findMany({
      where: {
        lifecycle: { notIn: [...EXCLUDED_LIFECYCLES] },
        ...(distributors ? { distributorId: { in: distributors } } : {}),
        ...(territory ? { territoryId: { in: territory } } : {}),
      },
      select: { id: true, code: true, businessName: true, ownerName: true, mobile: true, whatsapp: true, address: true, pincode: true, distributorId: true, territoryId: true },
    });
    const distIds = [...new Set(retailers.map((r) => r.distributorId).filter((x): x is string => !!x))];
    const territoryIds = [...new Set(retailers.map((r) => r.territoryId).filter((x): x is string => !!x))];
    const [dists, territories] = await Promise.all([
      db.seeraPartner.findMany({ where: { id: { in: distIds } }, select: { id: true, tradeName: true, legalName: true, addresses: true } }),
      territoryIds.length ? db.seeraGeographyNode.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const distById = new Map(dists.map((d) => [d.id, d]));
    const territoryName = new Map(territories.map((t) => [t.id, t.name]));
    for (const r of retailers) {
      const phone = normalizeIndianMobile(r.whatsapp) ?? normalizeIndianMobile(r.mobile);
      if (!phone) continue;
      const dist = r.distributorId ? distById.get(r.distributorId) : undefined;
      const area = resolveArea({ address: r.address, pincode: r.pincode, territoryName: r.territoryId ? territoryName.get(r.territoryId) : null, distributorAddress: dist?.addresses });
      out.push({ partyType: "RETAILER", partyId: r.id, phone, businessName: r.businessName, ownerName: r.ownerName, city: area.city, state: area.state, areaKey: area.key, distributorName: dist ? (dist.tradeName ?? dist.legalName) : null, code: r.code });
    }
  }
  const partnerTypes = types.filter((t) => t === "DISTRIBUTOR" || t === "SUPER_STOCKIST") as ("DISTRIBUTOR" | "SUPER_STOCKIST")[];
  if (partnerTypes.length) {
    const partners = await db.seeraPartner.findMany({
      where: {
        type: { in: partnerTypes },
        lifecycle: { notIn: [...EXCLUDED_LIFECYCLES] },
        ...(territory ? { territoryIds: { hasSome: territory } } : {}),
        ...(distributors ? { OR: [{ type: "SUPER_STOCKIST" }, { id: { in: distributors } }] } : {}),
      },
      select: { id: true, code: true, type: true, legalName: true, tradeName: true, primaryContact: true, addresses: true },
    });
    for (const p of partners) {
      const c = (p.primaryContact ?? {}) as { mobile?: string; whatsapp?: string; ownerName?: string; name?: string };
      const phone = normalizeIndianMobile(c.whatsapp) ?? normalizeIndianMobile(c.mobile);
      if (!phone) continue;
      const area = resolveArea({ address: Array.isArray(p.addresses) ? p.addresses[0] : p.addresses });
      out.push({ partyType: p.type as PartyType, partyId: p.id, phone, businessName: p.tradeName ?? p.legalName, ownerName: c.ownerName ?? c.name ?? null, city: area.city, state: area.state, areaKey: area.key, distributorName: null, code: p.code });
    }
  }
  // Market Survey shops / wholesalers. A shop that refused WhatsApp contact in the survey is left out;
  // one already linked to a retailer is covered by that retailer record (same phone, de-duplicated).
  if (types.includes("SURVEY")) {
    const surveys = await db.seeraMarketSurvey.findMany({
      where: { mobile: { not: null }, consentStatus: { not: "REFUSED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, shopName: true, contactName: true, mobile: true, market: true, address: true },
    });
    for (const sv of surveys) {
      const phone = normalizeIndianMobile(sv.mobile);
      if (!phone) continue;
      const area = resolveArea({ address: { city: sv.market, line: sv.address } });
      out.push({ partyType: "SURVEY", partyId: sv.id, phone, businessName: sv.shopName, ownerName: sv.contactName, city: area.city, state: area.state, areaKey: area.key, distributorName: null, code: sv.reference });
    }
  }
  // Distributor / super-stockist / wholesaler prospects from Distributor search (not rejected).
  if (types.includes("PROSPECT")) {
    const prospects = await db.seeraProspect.findMany({
      where: { status: { notIn: [...EXCLUDED_LIFECYCLES] }, approvedPartnerId: null },
      select: { id: true, businessName: true, normalizedMobile: true, alternateMobile: true, profile: true },
    });
    for (const p of prospects) {
      const phone = normalizeIndianMobile(p.normalizedMobile) ?? normalizeIndianMobile(p.alternateMobile);
      if (!phone) continue;
      const prof = (p.profile ?? {}) as Record<string, unknown>;
      const owner = typeof prof.ownerName === "string" ? prof.ownerName : typeof prof.contactName === "string" ? prof.contactName : null;
      const area = resolveArea({ address: prof });
      out.push({ partyType: "PROSPECT", partyId: p.id, phone, businessName: p.businessName, ownerName: owner, city: area.city, state: area.state, areaKey: area.key, distributorName: null, code: null });
    }
  }
  // Manually added numbers last, so a number that is also a retailer / partner keeps that
  // richer record (and still gets only one message — see the de-duplication below).
  if (types.includes("MANUAL")) {
    const groups = audience.manualGroups?.length ? audience.manualGroups : null;
    const contacts = await db.seeraWaContact.findMany({
      where: groups ? { OR: [{ groupName: { in: groups.filter((g) => g !== NO_GROUP) } }, ...(groups.includes(NO_GROUP) ? [{ groupName: null }] : [])] } : {},
      orderBy: { createdAt: "asc" },
    });
    for (const c of contacts) {
      const area = resolveArea({ address: { city: c.city, state: c.state }, pincode: null });
      out.push({ partyType: "MANUAL", partyId: c.id, phone: c.phone, businessName: c.businessName || c.name || "Partner", ownerName: c.name, city: area.city, state: area.state, areaKey: area.key, distributorName: null, code: null });
    }
  }
  // Area-wise: keep only the chosen cities / whole states.
  const areaKeys = audience.areaKeys?.length ? new Set(audience.areaKeys) : null;
  const excluded = audience.excludeAreaKeys?.length ? new Set(audience.excludeAreaKeys) : null;
  const inArea = (r: Recipient) =>
    (!areaKeys || areaKeys.has(r.areaKey ?? "") || areaKeys.has(stateKeyOf(r.state ?? null))) &&
    (!excluded || !(excluded.has(r.areaKey ?? "") || excluded.has(stateKeyOf(r.state ?? null))));
  // One message per phone number: a number listed on two parties gets it once.
  const seen = new Set<string>();
  return out.filter((r) => inArea(r) && (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
}

// State → city list with counts (and opted-out counts) for the campaign's area picker.
export async function listAreas(db: PrismaClient, actorId: string, audience: Omit<Audience, "areaKeys">) {
  await requireHub(db, actorId);
  const recipients = await resolveAudience(db, { ...audience, areaKeys: undefined, excludeAreaKeys: undefined });
  const optedOut = new Set((await db.seeraWaOptOut.findMany({ where: { phone: { in: recipients.map((r) => r.phone) } }, select: { phone: true } })).map((o) => o.phone));
  return groupAreas(recipients.map((r) => ({ areaKey: r.areaKey ?? "", city: r.city, state: r.state ?? null, partyType: r.partyType, optedOut: optedOut.has(r.phone) })));
}

function paramsFor(mapping: VariableMapping[], variableNames: string[], r: Recipient): string[] {
  return variableNames.map((v) => {
    const m = mapping.find((x) => x.variable === v);
    return variableValue((m?.source ?? "CONTACT_NAME") as VariableSource, r, m?.value, m?.areaValues);
  });
}

export async function previewAudience(db: PrismaClient, actorId: string, input: { audience: Audience; templateName?: string; language?: string; variableMap?: VariableMapping[] }) {
  await requireHub(db, actorId);
  const recipients = await resolveAudience(db, input.audience);
  const optedOut = new Set((await db.seeraWaOptOut.findMany({ where: { phone: { in: recipients.map((r) => r.phone) } }, select: { phone: true } })).map((o) => o.phone));
  const byType: Record<string, number> = {};
  for (const r of recipients) byType[r.partyType] = (byType[r.partyType] ?? 0) + 1;
  let sample: { name: string; partyType: string; text: string }[] = [];
  if (input.templateName && input.language) {
    const t = await db.seeraWaTemplate.findUnique({ where: { name_language: { name: input.templateName, language: input.language } } });
    if (t) {
      // One real example per area (up to 6), so the per-city personalisation can be checked.
      const perArea = new Map<string, Recipient>();
      for (const r of recipients) if (!perArea.has(r.areaKey ?? "") && perArea.size < 6) perArea.set(r.areaKey ?? "", r);
      sample = [...perArea.values()].map((r) => {
        const values = paramsFor(input.variableMap ?? [], t.variableNames, r);
        return { name: r.businessName, partyType: r.partyType, area: [r.city, r.state].filter(Boolean).join(", "), text: renderPreview(t.bodyText, Object.fromEntries(t.variableNames.map((v, i) => [v, values[i]!]))) };
      });
    }
  }
  const byArea: Record<string, number> = {};
  for (const r of recipients) {
    const label = r.city ?? "City not known";
    byArea[label] = (byArea[label] ?? 0) + 1;
  }
  return { total: recipients.length, optedOut: recipients.filter((r) => optedOut.has(r.phone)).length, byType, byArea, sample };
}

// ---------------- Campaigns ----------------
export type CampaignInput = {
  name: string;
  templateName: string;
  language: string;
  audience: Audience;
  variableMap: VariableMapping[];
  headerMediaUrl?: string | null;
  repeatEveryDays?: number | null;
};

async function validateCampaign(db: PrismaClient, input: CampaignInput) {
  if (!input.name.trim()) throw new FoundationError("WA_CAMPAIGN_NAME", "Give the campaign a name", 400);
  if (!input.audience.partyTypes?.length) throw new FoundationError("WA_AUDIENCE_EMPTY", "Choose who should receive it (retailers, distributors or super stockists)", 400);
  const t = await approvedTemplate(db, input.templateName, input.language);
  for (const v of t.variableNames) {
    const m = input.variableMap.find((x) => x.variable === v);
    if (!m || !(m.source in VARIABLE_SOURCES)) throw new FoundationError("WA_VARIABLE_UNMAPPED", `Choose what goes into {{${v}}}`, 400);
    if (m.source === "CUSTOM" && !m.value?.trim()) throw new FoundationError("WA_VARIABLE_EMPTY", `Type the text for {{${v}}}`, 400);
    if (m.source === "AREA_TEXT" && !m.value?.trim())
      throw new FoundationError("WA_VARIABLE_EMPTY", `Type the "all other areas" text for {{${v}}} — it goes to every city you did not write a separate text for`, 400);
  }
  const fmt = (t.headerFormat ?? "").toUpperCase();
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt) && !/^https:\/\/\S+$/.test(input.headerMediaUrl ?? ""))
    throw new FoundationError("WA_HEADER_MEDIA_REQUIRED", `This template has a ${fmt.toLowerCase()} header — paste its public https link`, 400);
  if (input.repeatEveryDays != null && (input.repeatEveryDays < 1 || input.repeatEveryDays > 90))
    throw new FoundationError("WA_REPEAT_RANGE", "Repeat every 1–90 days", 400);
  return t;
}

export async function saveCampaign(db: PrismaClient, actorId: string, input: CampaignInput & { id?: string }) {
  await requireHub(db, actorId);
  const t = await validateCampaign(db, input);
  const data = {
    name: input.name.trim().slice(0, 120),
    templateName: input.templateName,
    language: input.language,
    category: t.category,
    audience: input.audience as unknown as Prisma.InputJsonValue,
    variableMap: input.variableMap as unknown as Prisma.InputJsonValue,
    headerMediaUrl: input.headerMediaUrl?.trim() || null,
    repeatEveryDays: input.repeatEveryDays ?? null,
  };
  if (input.id) {
    const c = await db.seeraWaCampaign.findUnique({ where: { id: input.id } });
    if (!c) throw new FoundationError("WA_CAMPAIGN_NOT_FOUND", "Campaign not found", 404);
    if (!["DRAFT", "PAUSED"].includes(c.status)) throw new FoundationError("WA_CAMPAIGN_LOCKED", "Pause the campaign before editing it", 409);
    const saved = await db.seeraWaCampaign.update({ where: { id: c.id }, data });
    await recordAudit(db, { actorId, action: "whatsapp_hub.campaign_updated", entityType: "SeeraWaCampaign", entityId: c.id });
    return saved;
  }
  const saved = await db.seeraWaCampaign.create({ data: { ...data, createdById: actorId } });
  await recordAudit(db, { actorId, action: "whatsapp_hub.campaign_created", entityType: "SeeraWaCampaign", entityId: saved.id, afterState: { name: saved.name, template: saved.templateName } });
  return saved;
}

export async function listCampaigns(db: PrismaClient) {
  const rows = await db.seeraWaCampaign.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
  const counts = await db.seeraWaMessage.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
  return rows.map((c) => {
    const s: Record<string, number> = {};
    for (const x of counts.filter((k) => k.campaignId === c.id)) s[x.status] = x._count._all;
    return {
      id: c.id,
      name: c.name,
      templateName: c.templateName,
      language: c.language,
      category: c.category,
      audience: c.audience,
      variableMap: c.variableMap,
      headerMediaUrl: c.headerMediaUrl,
      status: c.status,
      repeatEveryDays: c.repeatEveryDays,
      nextRunAt: c.nextRunAt?.toISOString() ?? null,
      lastRunAt: c.lastRunAt?.toISOString() ?? null,
      runCount: c.runCount,
      lastRunSummary: c.lastRunSummary,
      stats: s,
    };
  });
}

export async function scheduleCampaign(db: PrismaClient, actorId: string, id: string, startAt?: Date | null) {
  await requireHub(db, actorId);
  const c = await db.seeraWaCampaign.findUnique({ where: { id } });
  if (!c) throw new FoundationError("WA_CAMPAIGN_NOT_FOUND", "Campaign not found", 404);
  if (!["DRAFT", "PAUSED"].includes(c.status)) throw new FoundationError("WA_CAMPAIGN_STATE", `Campaign is ${c.status}`, 409);
  await approvedTemplate(db, c.templateName, c.language);
  const when = startAt && startAt.getTime() > Date.now() ? startAt : new Date();
  const saved = await db.seeraWaCampaign.update({ where: { id }, data: { status: "SCHEDULED", nextRunAt: when } });
  await recordAudit(db, { actorId, action: "whatsapp_hub.campaign_scheduled", entityType: "SeeraWaCampaign", entityId: id, afterState: { nextRunAt: when.toISOString(), repeatEveryDays: c.repeatEveryDays } });
  return saved;
}

export async function setCampaignState(db: PrismaClient, actorId: string, id: string, action: "PAUSE" | "CANCEL") {
  await requireHub(db, actorId);
  const c = await db.seeraWaCampaign.findUnique({ where: { id } });
  if (!c) throw new FoundationError("WA_CAMPAIGN_NOT_FOUND", "Campaign not found", 404);
  const status = action === "PAUSE" ? "PAUSED" : "CANCELLED";
  await db.seeraWaCampaign.update({ where: { id }, data: { status } });
  // Messages not handed to Meta yet stop with it.
  await db.seeraWaMessage.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", skipReason: `CAMPAIGN_${status}` } });
  await recordAudit(db, { actorId, action: `whatsapp_hub.campaign_${status.toLowerCase()}`, entityType: "SeeraWaCampaign", entityId: id });
  return { id, status };
}

// Sends one message right now to one number (a staff phone), whatever the global switch says,
// so the template, variables and header can be checked before a campaign goes out.
export async function testSend(db: PrismaClient, actorId: string, input: CampaignInput & { phone: string }) {
  await requireHub(db, actorId);
  const t = await validateCampaign(db, { ...input, name: input.name || "Test" });
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) throw new FoundationError("WA_TEST_PHONE", "Enter a valid 10-digit Indian mobile number", 400);
  const sample: Recipient = { partyType: "RETAILER", partyId: "test", phone, businessName: "Sharma General Store", ownerName: "Ramesh Sharma", city: "Jaipur", state: "Rajasthan", areaKey: "rajasthan|jaipur", distributorName: "Seera Distributor", code: "RT-TEST" };
  const values = paramsFor(input.variableMap, t.variableNames, sample);
  const msg = await db.seeraWaMessage.create({
    data: { idempotencyKey: `test:${randomUUID()}`, templateName: t.name, language: t.language, category: t.category, partyType: "TEST", phone, recipientName: "Test", params: values, headerMediaUrl: input.headerMediaUrl ?? null, status: "SENDING", createdById: actorId },
  });
  try {
    const id = await sendTemplate({ to: phone, name: t.name, language: t.language, named: t.named, variableNames: t.variableNames, values, headerFormat: t.headerFormat, headerMediaUrl: input.headerMediaUrl });
    await db.seeraWaMessage.update({ where: { id: msg.id }, data: { status: "SENT", providerMessageId: id || null, sentAt: new Date(), attempts: 1 } });
    return { ok: true, preview: renderPreview(t.bodyText, Object.fromEntries(t.variableNames.map((v, i) => [v, values[i]!]))) };
  } catch (e) {
    const m = e instanceof Error ? e.message : "Send failed";
    await db.seeraWaMessage.update({ where: { id: msg.id }, data: { status: "FAILED", lastError: m.slice(0, 300), attempts: 1 } });
    throw new FoundationError("WA_TEST_FAILED", `Meta refused the test: ${m}`, 502);
  }
}

// ---------------- Engine (runs from the 5-minute dispatcher) ----------------
export async function runDueCampaigns(db: PrismaClient, now = new Date()) {
  const due = await db.seeraWaCampaign.findMany({ where: { status: "SCHEDULED", nextRunAt: { lte: now } }, take: 10 });
  const results: { campaignId: string; queued: number; skipped: number }[] = [];
  for (const c of due) {
    const next = nextRunAfter(c.nextRunAt ?? now, c.repeatEveryDays);
    // Claim the run so two overlapping dispatcher ticks never both expand the same campaign.
    const claim = await db.seeraWaCampaign.updateMany({
      where: { id: c.id, status: "SCHEDULED", nextRunAt: c.nextRunAt },
      data: { lastRunAt: now, runCount: { increment: 1 }, nextRunAt: next, status: next ? "SCHEDULED" : "COMPLETED" },
    });
    if (claim.count !== 1) continue;
    const runNumber = c.runCount + 1;
    const t = await db.seeraWaTemplate.findUnique({ where: { name_language: { name: c.templateName, language: c.language } } });
    if (!t || t.status !== "APPROVED") {
      await db.seeraWaCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", lastRunSummary: { run: runNumber, error: `Template ${c.templateName} is ${t?.status ?? "missing"} on Meta` } } });
      continue;
    }
    const recipients = await resolveAudience(db, c.audience as unknown as Audience);
    const optedOut = new Set((await db.seeraWaOptOut.findMany({ where: { phone: { in: recipients.map((r) => r.phone) } }, select: { phone: true } })).map((o) => o.phone));
    const mapping = (c.variableMap ?? []) as unknown as VariableMapping[];
    let queued = 0, skipped = 0;
    const rows = recipients.map((r) => {
      const out = optedOut.has(r.phone);
      out ? skipped++ : queued++;
      return {
        idempotencyKey: `campaign:${c.id}:${runNumber}:${r.phone}`,
        campaignId: c.id,
        runNumber,
        templateName: c.templateName,
        language: c.language,
        category: c.category,
        partyType: r.partyType,
        partyId: r.partyId,
        recipientName: r.businessName,
        phone: r.phone,
        params: paramsFor(mapping, t.variableNames, r),
        headerMediaUrl: c.headerMediaUrl,
        status: out ? "SKIPPED" : "QUEUED",
        skipReason: out ? "OPTED_OUT" : null,
        scheduledFor: now,
        createdById: c.createdById,
      };
    });
    for (let i = 0; i < rows.length; i += 500) await db.seeraWaMessage.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
    await db.seeraWaCampaign.update({ where: { id: c.id }, data: { lastRunSummary: { run: runNumber, at: now.toISOString(), audience: recipients.length, queued, skipped } } });
    results.push({ campaignId: c.id, queued, skipped });
  }
  return results;
}

export async function dispatchWaMessages(db: PrismaClient, opts: { limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const settings = await getSettings(db);
  if (!settings.sendEnabled) return { ran: false, reason: "SENDING_OFF" as const, sent: 0, failed: 0, skipped: 0 };
  if (isQuietTime(now, settings)) return { ran: false, reason: "QUIET_HOURS" as const, sent: 0, failed: 0, skipped: 0 };
  const batch = await db.seeraWaMessage.findMany({ where: { status: "QUEUED", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" }, take: Math.min(200, opts.limit ?? 60) });
  let sent = 0, failed = 0, skipped = 0;
  const templateCache = new Map<string, Awaited<ReturnType<typeof db.seeraWaTemplate.findUnique>>>();
  for (const m of batch) {
    const claim = await db.seeraWaMessage.updateMany({ where: { id: m.id, status: "QUEUED" }, data: { status: "SENDING", attempts: { increment: 1 } } });
    if (claim.count !== 1) continue;
    const key = `${m.templateName}|${m.language}`;
    if (!templateCache.has(key)) templateCache.set(key, await db.seeraWaTemplate.findUnique({ where: { name_language: { name: m.templateName, language: m.language } } }));
    const t = templateCache.get(key);
    if (!t || t.status !== "APPROVED") {
      await db.seeraWaMessage.update({ where: { id: m.id }, data: { status: "SKIPPED", skipReason: "TEMPLATE_NOT_APPROVED" } });
      skipped++;
      continue;
    }
    const [optOut, lastMarketing] = await Promise.all([
      db.seeraWaOptOut.findUnique({ where: { phone: m.phone } }),
      db.seeraWaMessage.findFirst({
        where: { phone: m.phone, category: "MARKETING", status: { in: ["SENT", "DELIVERED", "READ"] }, NOT: { id: m.id } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);
    const d = decide({ category: m.category, optedOut: !!optOut, lastMarketingSentAt: lastMarketing?.sentAt ?? null, marketingGapDays: settings.marketingGapDays, now });
    if (!d.send) {
      await db.seeraWaMessage.update({ where: { id: m.id }, data: { status: "SKIPPED", skipReason: d.reason } });
      skipped++;
      continue;
    }
    try {
      const id = await sendTemplate({
        to: m.phone,
        name: m.templateName,
        language: m.language,
        named: t.variableNames.some((v) => !/^\d+$/.test(v)),
        variableNames: t.variableNames,
        values: (m.params as string[]) ?? [],
        headerFormat: t.headerFormat,
        headerMediaUrl: m.headerMediaUrl,
      });
      await db.seeraWaMessage.update({ where: { id: m.id }, data: { status: "SENT", providerMessageId: id || null, sentAt: new Date(), lastError: null } });
      sent++;
    } catch (e) {
      const permanent = e instanceof MetaApiError ? e.permanent : false;
      const attempts = m.attempts + 1;
      const giveUp = permanent || attempts >= MAX_ATTEMPTS;
      await db.seeraWaMessage.update({
        where: { id: m.id },
        data: {
          status: giveUp ? "FAILED" : "QUEUED",
          lastError: (e instanceof Error ? e.message : "Send failed").slice(0, 300),
          scheduledFor: giveUp ? m.scheduledFor : new Date(now.getTime() + 2 ** attempts * 60_000),
        },
      });
      failed++;
    }
  }
  return { ran: true, reason: null, sent, failed, skipped };
}

// ---------------- Webhook ----------------
const RANK: Record<string, number> = { QUEUED: 0, SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };

export async function applyStatus(db: PrismaClient, s: { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string }[] }) {
  if (!s?.id || !s.status) return false;
  const next = s.status === "sent" ? "SENT" : s.status === "delivered" ? "DELIVERED" : s.status === "read" ? "READ" : s.status === "failed" ? "FAILED" : null;
  if (!next) return false;
  const m = await db.seeraWaMessage.findUnique({ where: { providerMessageId: s.id } });
  if (m) {
    if (next !== "FAILED" && (RANK[next] ?? 0) <= (RANK[m.status] ?? 0)) return true;
    const err = s.errors?.[0];
    await db.seeraWaMessage.update({
      where: { id: m.id },
      data: {
        status: next,
        ...(next === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(next === "READ" ? { readAt: new Date(), deliveredAt: m.deliveredAt ?? new Date() } : {}),
        ...(next === "FAILED" ? { lastError: `${err?.code ?? ""} ${err?.title ?? err?.message ?? "Delivery failed"}`.trim().slice(0, 300) } : {}),
      },
    });
    return true;
  }
  const reply = await db.seeraWaInboxMessage.findUnique({ where: { waMessageId: s.id } });
  if (reply) {
    await db.seeraWaInboxMessage.update({ where: { id: reply.id }, data: { status: next } });
    return true;
  }
  return false;
}

function inboundText(message: Record<string, any>): string | null {
  const t = message.type;
  if (t === "text") return message.text?.body ?? null;
  if (t === "button") return message.button?.text ?? null;
  if (t === "interactive") return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
  if (["image", "video", "document"].includes(t)) return message[t]?.caption ?? `[${t}]`;
  if (t === "audio") return "[voice note]";
  if (t === "location") return `[location] ${message.location?.latitude ?? ""},${message.location?.longitude ?? ""}`;
  if (t === "reaction") return `[reaction ${message.reaction?.emoji ?? ""}]`;
  return t ? `[${t}]` : null;
}

export async function matchParty(db: PrismaClient, phone: string): Promise<{ partyType: string; partyId: string; partyName: string } | null> {
  const ten = phone.slice(-10);
  const r = await db.seeraRetailer.findFirst({
    where: { OR: [{ mobile: { endsWith: ten } }, { whatsapp: { endsWith: ten } }, { normalizedMobile: { endsWith: ten } }] },
    select: { id: true, businessName: true },
  });
  if (r) return { partyType: "RETAILER", partyId: r.id, partyName: r.businessName };
  const rows = await db.$queryRaw<{ id: string; type: string; name: string }[]>`
    SELECT id, type::text AS type, COALESCE("tradeName", "legalName") AS name FROM seera_partners
    WHERE right(regexp_replace(COALESCE("primaryContact"->>'mobile', ''), '\\D', '', 'g'), 10) = ${ten}
       OR right(regexp_replace(COALESCE("primaryContact"->>'whatsapp', ''), '\\D', '', 'g'), 10) = ${ten}
    LIMIT 1`;
  if (rows[0]) return { partyType: rows[0].type, partyId: rows[0].id, partyName: rows[0].name };
  const manual = await db.seeraWaContact.findFirst({ where: { phone: { endsWith: ten } }, select: { id: true, name: true, businessName: true } }).catch(() => null);
  if (manual) return { partyType: "MANUAL", partyId: manual.id, partyName: manual.businessName || manual.name || `+91${ten}` };
  const pr = await db.seeraProspect.findFirst({ where: { OR: [{ normalizedMobile: { endsWith: ten } }, { alternateMobile: { endsWith: ten } }] }, select: { id: true, businessName: true } });
  if (pr) return { partyType: "PROSPECT", partyId: pr.id, partyName: pr.businessName };
  const sv = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, "shopName" AS name FROM seera_market_surveys
    WHERE right(regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g'), 10) = ${ten} ORDER BY "createdAt" DESC LIMIT 1`;
  if (sv[0]) return { partyType: "SURVEY", partyId: sv[0].id, partyName: sv[0].name };
  return null;
}

// ---------------- Manual contacts ----------------
export const NO_GROUP = "__none__";
export type ContactInput = { phone: string; name?: string | null; businessName?: string | null; city?: string | null; state?: string | null; groupName?: string | null; notes?: string | null };
const tidy = (v: string | null | undefined, max = 120) => (v?.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const contactData = (c: Omit<ContactInput, "phone">) => ({
  name: tidy(c.name),
  businessName: tidy(c.businessName),
  city: cleanCity(c.city) ?? null,
  state: normalizeState(c.state) ?? null,
  groupName: tidy(c.groupName, 60),
  notes: tidy(c.notes, 300),
});

export async function listContacts(db: PrismaClient, actorId: string, q?: string, group?: string) {
  await requireHub(db, actorId);
  const term = q?.trim();
  const digits = term?.replace(/\D/g, "") ?? "";
  const where: Prisma.SeeraWaContactWhereInput = {
    ...(group ? (group === NO_GROUP ? { groupName: null } : { groupName: group }) : {}),
    ...(term
      ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { businessName: { contains: term, mode: "insensitive" } }, { city: { contains: term, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
      : {}),
  };
  const [rows, total, groups, optOuts] = await Promise.all([
    db.seeraWaContact.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }),
    db.seeraWaContact.count({ where }),
    db.seeraWaContact.groupBy({ by: ["groupName"], _count: { _all: true }, orderBy: { groupName: "asc" } }),
    db.seeraWaOptOut.findMany({ select: { phone: true } }),
  ]);
  const out = new Set(optOuts.map((o) => o.phone));
  return {
    total,
    contacts: rows.map((c) => ({ ...c, optedOut: out.has(c.phone), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
    groups: groups.map((g) => ({ name: g.groupName ?? NO_GROUP, count: g._count._all })),
  };
}

export async function saveContact(db: PrismaClient, actorId: string, input: ContactInput & { id?: string }) {
  await requireHub(db, actorId);
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) throw new FoundationError("WA_CONTACT_PHONE", "Enter a valid 10-digit Indian mobile number", 400);
  const data = { phone, ...contactData(input) };
  if (input.id) {
    const clash = await db.seeraWaContact.findUnique({ where: { phone } });
    if (clash && clash.id !== input.id) throw new FoundationError("WA_CONTACT_DUPLICATE", "This number is already in your contacts", 409);
    const saved = await db.seeraWaContact.update({ where: { id: input.id }, data });
    await recordAudit(db, { actorId, action: "whatsapp_hub.contact_updated", entityType: "SeeraWaContact", entityId: saved.id });
    return saved;
  }
  const saved = await db.seeraWaContact.upsert({ where: { phone }, create: { ...data, createdById: actorId }, update: data });
  await recordAudit(db, { actorId, action: "whatsapp_hub.contact_saved", entityType: "SeeraWaContact", entityId: saved.id });
  return saved;
}

// Paste many numbers at once. Existing numbers are updated only where the paste has a value, so
// pasting a bare number list into a group never wipes names typed earlier.
export async function importContacts(db: PrismaClient, actorId: string, input: { text: string; groupName?: string | null; city?: string | null; state?: string | null }) {
  await requireHub(db, actorId);
  const { rows, invalid } = parseContactLines(input.text, (raw) => normalizeIndianMobile(raw));
  if (rows.length > 2000) throw new FoundationError("WA_CONTACT_BULK_LIMIT", "Paste at most 2000 numbers at a time", 400);
  const existing = new Map((await db.seeraWaContact.findMany({ where: { phone: { in: rows.map((r) => r.phone) } } })).map((c) => [c.phone, c]));
  let added = 0, updated = 0;
  for (const r of rows) {
    const data = contactData({ name: r.name, businessName: r.businessName, city: r.city ?? input.city, state: r.state ?? input.state, groupName: input.groupName });
    const prev = existing.get(r.phone);
    if (prev) {
      const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null));
      if (Object.keys(patch).length) await db.seeraWaContact.update({ where: { id: prev.id }, data: patch });
      updated++;
    } else {
      await db.seeraWaContact.create({ data: { phone: r.phone, ...data, createdById: actorId } });
      added++;
    }
  }
  await recordAudit(db, { actorId, action: "whatsapp_hub.contacts_imported", entityType: "SeeraWaContact", details: { added, updated, invalid: invalid.length, group: input.groupName ?? null } });
  return { added, updated, invalid };
}

export async function deleteContacts(db: PrismaClient, actorId: string, ids: string[]) {
  await requireHub(db, actorId);
  const r = await db.seeraWaContact.deleteMany({ where: { id: { in: ids } } });
  await recordAudit(db, { actorId, action: "whatsapp_hub.contacts_deleted", entityType: "SeeraWaContact", details: { count: r.count } });
  return { deleted: r.count };
}

export async function recordInbound(db: PrismaClient, message: Record<string, any>, contact?: { profile?: { name?: string }; wa_id?: string }) {
  if (!message?.id || !message?.from) return false;
  const exists = await db.seeraWaInboxMessage.findUnique({ where: { waMessageId: message.id } });
  if (exists) return true;
  const phone = normalizeIndianMobile(message.from) ?? String(message.from).replace(/\D/g, "");
  const party = await matchParty(db, phone).catch(() => null);
  const text = inboundText(message);
  await db.seeraWaInboxMessage.create({
    data: {
      direction: "IN",
      waMessageId: message.id,
      phone,
      profileName: contact?.profile?.name?.slice(0, 120) ?? null,
      partyType: party?.partyType ?? null,
      partyId: party?.partyId ?? null,
      partyName: party?.partyName ?? null,
      type: String(message.type ?? "unknown"),
      text: text?.slice(0, 4000) ?? null,
      raw: message as Prisma.InputJsonValue,
    },
  });
  const kw = inboundKeyword(message.type === "button" ? message.button?.text : message.type === "text" ? message.text?.body : null);
  if (kw === "STOP") await db.seeraWaOptOut.upsert({ where: { phone }, create: { phone, source: "STOP_REPLY", reason: text?.slice(0, 100) ?? "STOP" }, update: {} });
  if (kw === "START") await db.seeraWaOptOut.deleteMany({ where: { phone, source: "STOP_REPLY" } });
  if (message.type !== "reaction") {
    await autoReply(db, { phone, text, keyword: kw, party, profileName: contact?.profile?.name ?? null }).catch((e) =>
      console.error("whatsapp_hub.auto_reply_failed", { error: e instanceof Error ? e.message : String(e) }),
    );
  }
  return true;
}

// ---------------- Inbox ----------------
export async function listThreads(db: PrismaClient, actorId: string, q?: string) {
  await requireHub(db, actorId);
  const recent = await db.seeraWaInboxMessage.findMany({ orderBy: { createdAt: "desc" }, take: 3000 });
  const threads = new Map<string, { phone: string; name: string | null; partyType: string | null; lastText: string | null; lastAt: string; lastDirection: string; unread: number; lastInboundAt: string | null; needsAttention: string | null; humanSeen: boolean }>();
  for (const m of recent) {
    let t = threads.get(m.phone);
    if (!t) {
      t = { phone: m.phone, name: m.partyName ?? m.profileName, partyType: m.partyType, lastText: m.text, lastAt: m.createdAt.toISOString(), lastDirection: m.direction, unread: 0, lastInboundAt: null, needsAttention: null, humanSeen: false };
      threads.set(m.phone, t);
    }
    if (!t.name) t.name = m.partyName ?? m.profileName;
    if (m.direction === "IN" && !m.isRead) t.unread++;
    if (m.direction === "IN" && !t.lastInboundAt) t.lastInboundAt = m.createdAt.toISOString();
    // newest-first: an alerting auto-reply with no staff reply after it = the team must act
    if (m.direction === "OUT" && m.sentById) t.humanSeen = true;
    const raw = m.raw as { alert?: boolean; ruleName?: string } | null;
    if (!t.humanSeen && !t.needsAttention && m.type === "auto" && raw?.alert) t.needsAttention = raw.ruleName ?? "Follow up";
  }
  const needle = q?.trim().toLowerCase();
  const optOuts = new Set((await db.seeraWaOptOut.findMany({ select: { phone: true } })).map((o) => o.phone));
  return [...threads.values()]
    .filter((t) => !needle || t.phone.includes(needle) || (t.name ?? "").toLowerCase().includes(needle))
    .map(({ humanSeen: _h, ...t }) => ({ ...t, optedOut: optOuts.has(t.phone) }))
    .sort((a, b) => Number(!!b.needsAttention) - Number(!!a.needsAttention) || b.lastAt.localeCompare(a.lastAt));
}

export async function getThread(db: PrismaClient, actorId: string, phone: string) {
  await requireHub(db, actorId);
  const messages = await db.seeraWaInboxMessage.findMany({ where: { phone }, orderBy: { createdAt: "asc" }, take: 500 });
  await db.seeraWaInboxMessage.updateMany({ where: { phone, direction: "IN", isRead: false }, data: { isRead: true } });
  const campaignMsgs = await db.seeraWaMessage.findMany({ where: { phone }, orderBy: { createdAt: "desc" }, take: 20, select: { templateName: true, status: true, sentAt: true, createdAt: true, campaignId: true } });
  const lastIn = [...messages].reverse().find((m) => m.direction === "IN");
  const optOut = await db.seeraWaOptOut.findUnique({ where: { phone } });
  return {
    phone,
    messages: messages.map((m) => ({ id: m.id, direction: m.direction, text: m.text, type: m.type, at: m.createdAt.toISOString(), status: m.status, buttons: m.type === "auto" ? ((m.raw as { buttons?: string[] } | null)?.buttons ?? []) : [], rule: m.type === "auto" ? ((m.raw as { ruleName?: string } | null)?.ruleName ?? null) : null })),
    templatesSent: campaignMsgs.map((m) => ({ template: m.templateName, status: m.status, at: (m.sentAt ?? m.createdAt).toISOString() })),
    canReply: withinServiceWindow(lastIn?.createdAt ?? null, new Date()),
    optedOut: !!optOut,
    partyName: messages.find((m) => m.partyName)?.partyName ?? messages.find((m) => m.profileName)?.profileName ?? null,
  };
}

export async function replyInThread(db: PrismaClient, actorId: string, phone: string, text: string) {
  await requireHub(db, actorId);
  const body = text.trim();
  if (!body) throw new FoundationError("WA_REPLY_EMPTY", "Type a reply", 400);
  const lastIn = await db.seeraWaInboxMessage.findFirst({ where: { phone, direction: "IN" }, orderBy: { createdAt: "desc" } });
  if (!withinServiceWindow(lastIn?.createdAt ?? null, new Date()))
    throw new FoundationError("WA_WINDOW_CLOSED", "WhatsApp allows free replies only within 24 hours of their last message — send an approved template instead", 409);
  const id = await sendText(phone, body.slice(0, 4000));
  await db.seeraWaInboxMessage.create({ data: { direction: "OUT", waMessageId: id || null, phone, type: "text", text: body.slice(0, 4000), isRead: true, status: "SENT", sentById: actorId, partyType: lastIn?.partyType, partyId: lastIn?.partyId, partyName: lastIn?.partyName } });
  await recordAudit(db, { actorId, action: "whatsapp_hub.inbox_reply", entityType: "SeeraWaInboxMessage", details: { phoneLast4: phone.slice(-4) } });
  return { ok: true };
}

export async function setOptOut(db: PrismaClient, actorId: string, phoneRaw: string, optOut: boolean, reason?: string) {
  await requireHub(db, actorId);
  const phone = normalizeIndianMobile(phoneRaw);
  if (!phone) throw new FoundationError("WA_PHONE_INVALID", "Enter a valid 10-digit Indian mobile number", 400);
  if (optOut) await db.seeraWaOptOut.upsert({ where: { phone }, create: { phone, source: "MANUAL", reason: reason?.slice(0, 100), createdById: actorId }, update: {} });
  else await db.seeraWaOptOut.deleteMany({ where: { phone } });
  await recordAudit(db, { actorId, action: optOut ? "whatsapp_hub.opt_out_added" : "whatsapp_hub.opt_out_removed", entityType: "SeeraWaOptOut", details: { phoneLast4: phone.slice(-4) } });
  return { phone, optOut };
}

export async function overview(db: PrismaClient, actorId: string) {
  await requireHub(db, actorId);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [byStatus, unread, active, optOuts, templates] = await Promise.all([
    db.seeraWaMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since }, NOT: { partyType: "TEST" } }, _count: { _all: true } }),
    db.seeraWaInboxMessage.count({ where: { direction: "IN", isRead: false } }),
    db.seeraWaCampaign.count({ where: { status: "SCHEDULED" } }),
    db.seeraWaOptOut.count(),
    db.seeraWaTemplate.count({ where: { status: "APPROVED" } }),
  ]);
  return { last7Days: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])), unread, activeCampaigns: active, optOuts, approvedTemplates: templates };
}

// ---------------- Auto-replies ----------------
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.seeradetergent.in").replace(/\/$/, "").replace("://seeradetergent.in", "://www.seeradetergent.in");
const MENU = ["📦 ऑर्डर करना है", "📘 रेट लिस्ट", "📞 कॉल कीजिए"];
const HUMAN_QUIET_MS = 30 * 60_000; // a staff reply in the last 30 min means a person is chatting — the bot stays quiet

type AutoSeed = { kind: string; name: string; keywords: string[]; replyText: string; mediaType?: string; mediaUrl?: string; buttons: string[]; alertTeam?: boolean; priority: number; cooldownMinutes?: number; active?: boolean };
export const DEFAULT_AUTO_REPLIES: AutoSeed[] = [
  { kind: "CONFIG", name: "Auto-reply switch", keywords: [], replyText: "-", buttons: [], priority: 0, active: true },
  { kind: "RULE", name: "ऑर्डर", priority: 10, alertTeam: true, keywords: ["ऑर्डर करना है", "ऑर्डर पक्का", "ऑर्डर भेजना है", "स्टॉक भेजो", "स्टॉक चाहिए", "पूरी रेंज भेजो", "ऑर्डर", "माल भेजो", "order", "stock", "maal bhejo", "order karna hai"],
    replyText: "🙏 धन्यवाद {name} जी! आपका ऑर्डर का संदेश मिल गया।\n\nकृपया बताइए:\n1️⃣ कौन सा प्रोडक्ट — सीरा जंबो ब्लू / सीरा व्हाइट / पाउडर\n2️⃣ कितने बॉक्स\n\nहमारी टीम आज ही आपसे संपर्क करके आपके डिस्ट्रीब्यूटर से माल पहुँचवाएगी 🚚", buttons: ["📘 रेट लिस्ट", "📞 कॉल कीजिए"] },
  { kind: "RULE", name: "रेट लिस्ट / कैटलॉग", priority: 20, keywords: ["रेट लिस्ट", "रेट लिस्ट चाहिए", "रेट बताओ", "रेट", "दाम", "कीमत", "कैटलॉग", "ज़्यादा जानकारी", "जानकारी", "rate", "price", "rate list", "catalogue", "catalog", "details", "kitne ka hai"],
    replyText: "📘 ये रहा सीरा · MUV प्रोडक्ट कैटलॉग 2026।\nआख़िरी पेज पर पूरी रेट लिस्ट और ऑर्डर फ़ॉर्म है — क्वांटिटी लिखिए, फ़ोटो खींचिए और भेज दीजिए।\n\nसीरा जंबो ब्लू 180 g · सीरा व्हाइट 160 g · आत्मनिर्भर पाउडर 120 g — सिर्फ़ ₹10 💪",
    mediaType: "DOCUMENT", mediaUrl: `${SITE}/whatsapp/Seera_MUV_Catalogue_2026.pdf`, buttons: ["📦 ऑर्डर करना है", "📞 कॉल कीजिए"] },
  { kind: "RULE", name: "सैंपल", priority: 30, alertTeam: true, keywords: ["सैंपल चाहिए", "सैंपल", "ट्रायल", "sample", "trial"],
    replyText: "बिल्कुल {name} जी! 👍\nसैंपल के लिए अपनी दुकान का नाम और पता भेजिए — या 📍 लोकेशन शेयर कर दीजिए। हमारा प्रतिनिधि जल्द आपकी दुकान पर पहुँचेगा।", buttons: ["📦 ऑर्डर करना है", "📘 रेट लिस्ट"] },
  { kind: "RULE", name: "कॉल", priority: 40, alertTeam: true, keywords: ["कॉल कीजिए", "कॉल करो", "बात करनी है", "फ़ोन करो", "कॉल", "call", "call me", "phone", "baat karni hai"],
    replyText: "📞 ज़रूर {name} जी! हमारी टीम जल्द ही इसी नंबर पर आपको कॉल करेगी (सुबह 9 से शाम 7 बजे)।\nकिसी और नंबर पर बात करनी हो तो वो नंबर यहीं भेज दीजिए।", buttons: [] },
  { kind: "RULE", name: "शिकायत / सवाल", priority: 50, alertTeam: true, keywords: ["शिकायत बतानी है", "शिकायत", "सवाल पूछना है", "सुझाव देना है", "समस्या", "ख़राब", "खराब", "complaint", "problem", "kharab", "issue"],
    replyText: "🙏 {name} जी, हम सुन रहे हैं।\nअपनी बात विस्तार से लिखिए, और हो सके तो पैक या बिल की फ़ोटो 📸 भेजिए। फ़ाउंडर टीम ख़ुद देखकर 24 घंटे के अंदर जवाब देगी।", buttons: [] },
  { kind: "RULE", name: "धन्यवाद / हाँ", priority: 60, keywords: ["स्वागत है", "समझ गया", "भरोसा है", "मंज़ूर है", "साथ हैं", "अच्छा है", "धन्यवाद", "शुक्रिया", "बढ़िया", "हाँ", "ठीक है", "thanks", "thank you", "ok", "okay", "nice", "good", "badhiya", "haan", "theek hai"],
    replyText: "🙏 बहुत-बहुत धन्यवाद {name} जी! सीरा परिवार हमेशा आपके साथ है।\nकुछ भी चाहिए तो नीचे दबाइए 👇", buttons: MENU },
  { kind: "RULE", name: "नमस्ते", priority: 70, keywords: ["नमस्ते", "नमस्कार", "राम राम", "जय श्री राम", "hi", "hello", "hey", "namaste", "namaskar", "ram ram", "hii"],
    replyText: "🙏 नमस्ते {name} जी! सीरा — सर्व शक्तिमान में आपका स्वागत है।\nबताइए, हम आपकी क्या मदद करें? 👇", buttons: MENU },
  { kind: "FALLBACK", name: "बाक़ी हर संदेश", priority: 900, cooldownMinutes: 720, keywords: [],
    replyText: "🙏 धन्यवाद {name} जी, आपका संदेश मिल गया। हमारी टीम जल्द ही जवाब देगी।\nतब तक नीचे से चुनिए 👇", buttons: MENU },
  { kind: "STOP", name: "STOP की पुष्टि", priority: 1, keywords: [], replyText: "✅ ठीक है, अब आपको सीरा के ऑफ़र वाले मैसेज नहीं भेजे जाएँगे।\nदोबारा शुरू करने के लिए START लिखें।", buttons: [] },
  { kind: "START", name: "START की पुष्टि", priority: 2, keywords: [], replyText: "🎉 स्वागत है {name} जी! अब आपको सीरा के ऑफ़र और जानकारी फिर से मिलती रहेगी।", buttons: [] },
];

async function loadAutoReplies(db: PrismaClient) {
  let rows = await db.seeraWaAutoReply.findMany({ orderBy: [{ kind: "asc" }, { priority: "asc" }] });
  if (!rows.length) {
    await db.seeraWaAutoReply.createMany({ data: DEFAULT_AUTO_REPLIES.map((r) => ({ ...r, cooldownMinutes: r.cooldownMinutes ?? 2, active: r.active ?? true, alertTeam: r.alertTeam ?? false })) });
    rows = await db.seeraWaAutoReply.findMany({ orderBy: [{ kind: "asc" }, { priority: "asc" }] });
  }
  return rows;
}

const fillName = (t: string, name: string | null) => t.replace(/\{name\}/g, (name ?? "").trim() || "भाई").replace(/\s+जी/g, (m) => m);

type InboundCtx = { phone: string; text: string | null; keyword: "STOP" | "START" | null; party: { partyType: string; partyId: string; partyName: string } | null; profileName: string | null };

// Answers one incoming message. Returns the rule used, or a reason it stayed quiet.
export async function autoReply(db: PrismaClient, ctx: InboundCtx, now = new Date()): Promise<{ sent: boolean; rule?: string; reason?: string }> {
  const rows = await loadAutoReplies(db);
  const cfg = rows.find((r) => r.kind === "CONFIG");
  if (cfg && !cfg.active) return { sent: false, reason: "AUTO_REPLY_OFF" };
  const human = await db.seeraWaInboxMessage.findFirst({ where: { phone: ctx.phone, direction: "OUT", sentById: { not: null }, createdAt: { gte: new Date(now.getTime() - HUMAN_QUIET_MS) } }, select: { id: true } });
  if (human) return { sent: false, reason: "TEAM_IS_CHATTING" };
  let rule = ctx.keyword ? rows.find((r) => r.kind === ctx.keyword && r.active) : null;
  if (!ctx.keyword) rule = pickAutoReply(rows, ctx.text) ?? rows.find((r) => r.kind === "FALLBACK" && r.active) ?? null;
  if (!rule) return { sent: false, reason: "NO_RULE" };
  const last = await db.seeraWaInboxMessage.findFirst({ where: { phone: ctx.phone, direction: "OUT", type: "auto", createdAt: { gte: new Date(now.getTime() - rule.cooldownMinutes * 60_000) } }, orderBy: { createdAt: "desc" }, select: { raw: true } });
  if (last && (last.raw as { ruleId?: string } | null)?.ruleId === rule.id) return { sent: false, rule: rule.name, reason: "COOLDOWN" };
  const name = ctx.party?.partyName ?? ctx.profileName;
  const body = fillName(rule.replyText, ctx.profileName ?? ctx.party?.partyName ?? null);
  const media = rule.mediaUrl && rule.mediaType ? { type: (rule.mediaType === "IMAGE" ? "image" : "document") as "image" | "document", link: rule.mediaUrl } : null;
  const id = rule.buttons.length ? await sendInteractive(ctx.phone, body, rule.buttons, media) : media ? await sendMedia(ctx.phone, media.type, media.link, body) : await sendText(ctx.phone, body.slice(0, 4000));
  await db.seeraWaInboxMessage.create({
    data: {
      direction: "OUT", waMessageId: id || null, phone: ctx.phone, type: "auto", text: body.slice(0, 4000), isRead: true, status: "SENT",
      partyType: ctx.party?.partyType ?? null, partyId: ctx.party?.partyId ?? null, partyName: name ?? null,
      raw: { ruleId: rule.id, ruleName: rule.name, alert: rule.alertTeam, buttons: rule.buttons, media: rule.mediaUrl } as Prisma.InputJsonValue,
    },
  });
  await db.seeraWaAutoReply.update({ where: { id: rule.id }, data: { hits: { increment: 1 } } });
  return { sent: true, rule: rule.name };
}

export async function listAutoReplies(db: PrismaClient, actorId: string) {
  await requireHub(db, actorId);
  const rows = await loadAutoReplies(db);
  const order: Record<string, number> = { RULE: 0, FALLBACK: 1, STOP: 2, START: 3 };
  return { enabled: rows.find((r) => r.kind === "CONFIG")?.active ?? true, rules: rows.filter((r) => r.kind !== "CONFIG").sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.priority - b.priority) };
}

export type AutoReplyInput = { id?: string; kind?: string; name: string; keywords: string[]; replyText: string; mediaType?: string | null; mediaUrl?: string | null; buttons: string[]; alertTeam: boolean; active: boolean; priority?: number; cooldownMinutes?: number };
export async function saveAutoReply(db: PrismaClient, actorId: string, input: AutoReplyInput) {
  await requireHub(db, actorId);
  if (!input.replyText.trim()) throw new FoundationError("WA_AUTO_EMPTY", "Write the reply text", 400);
  if (input.buttons.filter(Boolean).length > 3) throw new FoundationError("WA_AUTO_BUTTONS", "At most 3 buttons", 400);
  if (input.buttons.some((b) => b.trim().length > 20)) throw new FoundationError("WA_AUTO_BUTTON_LONG", "Each button can have at most 20 characters", 400);
  if (input.mediaUrl && !/^https:\/\/\S+$/.test(input.mediaUrl)) throw new FoundationError("WA_AUTO_MEDIA", "Attachment must be a public https link", 400);
  const kind = input.kind && ["RULE", "FALLBACK", "STOP", "START"].includes(input.kind) ? input.kind : "RULE";
  if (kind === "RULE" && !input.keywords.some((k) => k.trim())) throw new FoundationError("WA_AUTO_KEYWORDS", "Add at least one word or button text to match", 400);
  const data = {
    kind, name: input.name.trim().slice(0, 80) || "Rule", keywords: input.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 60), replyText: input.replyText.trim().slice(0, 1000),
    mediaType: input.mediaUrl ? (input.mediaType === "IMAGE" ? "IMAGE" : "DOCUMENT") : null, mediaUrl: input.mediaUrl?.trim() || null,
    buttons: input.buttons.map((b) => b.trim()).filter(Boolean).slice(0, 3), alertTeam: input.alertTeam, active: input.active,
    priority: Math.max(1, Math.min(999, Math.round(input.priority ?? 100))), cooldownMinutes: Math.max(0, Math.min(10080, Math.round(input.cooldownMinutes ?? (kind === "FALLBACK" ? 720 : 2)))), updatedById: actorId,
  };
  const row = input.id ? await db.seeraWaAutoReply.update({ where: { id: input.id }, data }) : await db.seeraWaAutoReply.create({ data });
  await recordAudit(db, { actorId, action: input.id ? "whatsapp_hub.auto_reply_updated" : "whatsapp_hub.auto_reply_created", entityType: "SeeraWaAutoReply", entityId: row.id });
  return row;
}
export async function deleteAutoReply(db: PrismaClient, actorId: string, id: string) {
  await requireHub(db, actorId);
  const r = await db.seeraWaAutoReply.findUnique({ where: { id } });
  if (!r || r.kind !== "RULE") throw new FoundationError("WA_AUTO_KEEP", "Only your own rules can be deleted — turn the built-in ones off instead", 400);
  await db.seeraWaAutoReply.delete({ where: { id } });
  return { ok: true };
}
export async function setAutoReplyEnabled(db: PrismaClient, actorId: string, enabled: boolean) {
  await requireHub(db, actorId);
  await loadAutoReplies(db);
  await db.seeraWaAutoReply.updateMany({ where: { kind: "CONFIG" }, data: { active: enabled, updatedById: actorId } });
  await recordAudit(db, { actorId, action: enabled ? "whatsapp_hub.auto_reply_on" : "whatsapp_hub.auto_reply_off", entityType: "SeeraWaAutoReply" });
  return { enabled };
}
// "If a partner writes this, what goes back?" — no message is sent.
export async function testAutoReply(db: PrismaClient, actorId: string, text: string) {
  await requireHub(db, actorId);
  const rows = await loadAutoReplies(db);
  const kw = inboundKeyword(text);
  const rule = kw ? rows.find((r) => r.kind === kw) : pickAutoReply(rows, text) ?? rows.find((r) => r.kind === "FALLBACK");
  return rule ? { rule: rule.name, kind: rule.kind, reply: fillName(rule.replyText, "रमेश"), buttons: rule.buttons, mediaUrl: rule.mediaUrl, active: rule.active } : null;
}
