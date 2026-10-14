import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/foundation/audit-service", () => ({ recordAudit: vi.fn(async () => undefined) }));
const { dispatchWhatsAppOutbox, dispatchOutboxEventById } = await import("@/lib/messaging/outbox-dispatch");
const { whatsappDisplayState } = await import("@/lib/sales-distribution/market-survey-service");

// Regression (production, 2026-10-13): Meta accepted a survey thank-you (wamid set), then its webhook
// reported "failed" (131049), which marks the outbox row FAILED with attempts 0. The batch dispatcher
// selected every FAILED row, so enabling it would have re-sent a message Meta had already processed.
type Row = Record<string, any>;
function fakeDb(rows: Row[]) {
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return (v.in as unknown[]).includes(row[k]);
        if ("lt" in v) return row[k] < v.lt;
        if ("lte" in v) return row[k] <= v.lte;
      }
      return row[k] === v;
    });
  return {
    outboxEvent: {
      findMany: async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)),
      findUnique: async ({ where }: { where: Row }) => rows.find((r) => r.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
  } as never;
}
const payload = { mobile: "919876543210", templateName: "seera_retailer_survey_thankyou", templateParams: ["Ramesh"], templateKey: "MARKET_SURVEY_THANK_YOU", languageCode: "hi" };
const row = (over: Row): Row => ({ aggregateType: "SeeraMarketSurvey", eventType: "MARKET_SURVEY_THANK_YOU", payload, attempts: 0, availableAt: new Date(0), lockedAt: null, lastErrorCode: null, providerMessageId: null, ...over });

describe("outbox never re-sends a message Meta already accepted", () => {
  it("batch dispatcher skips FAILED rows that carry a provider message id, but still retries never-accepted ones", async () => {
    const rows = [
      row({ id: "meta-failed", status: "FAILED", providerMessageId: "wamid.ACCEPTED", lastErrorCode: "131049" }),
      row({ id: "send-failed", status: "FAILED", lastErrorCode: "TIMEOUT" }),
      row({ id: "pending", status: "PENDING" }),
    ];
    const sendWhatsApp = vi.fn(async () => ({ id: `wamid.NEW${sendWhatsApp.mock.calls.length}` }));
    const results = await dispatchWhatsAppOutbox(fakeDb(rows), () => ({ sendWhatsApp }), { aggregateType: "SeeraMarketSurvey" });
    expect(results.map((r) => r.id).sort()).toEqual(["pending", "send-failed"]);
    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(rows[0]).toMatchObject({ status: "FAILED", providerMessageId: "wamid.ACCEPTED", lastErrorCode: "131049" });
  });

  it("single-event dispatch refuses a row Meta already accepted", async () => {
    const rows = [row({ id: "meta-failed", status: "FAILED", providerMessageId: "wamid.ACCEPTED" })];
    const sendWhatsApp = vi.fn();
    expect(await dispatchOutboxEventById(fakeDb(rows), () => ({ sendWhatsApp }), "meta-failed")).toBeNull();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it("survey view shows a Meta delivery failure as final, not 'will retry'", () => {
    expect(whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "FAILED", lastErrorCode: "131049", providerMessageId: "wamid.X" })).toBe("FAILED");
    expect(whatsappDisplayState({ whatsappState: "QUEUED" }, { status: "FAILED", lastErrorCode: "TIMEOUT", providerMessageId: null })).toBe("RETRYING");
  });
});
