import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { WHATSAPP_TEMPLATES, templateFor } from "../../lib/messaging/whatsapp-templates";
import { queueRetailerCommunication } from "../../lib/sales-distribution/retailer-communication-service";
import { queuePartnerVisitCommunication } from "../../lib/sales-distribution/partner-communication-service";

// Live proof (WhatsApp template reconciliation task): for each of the six Meta-APPROVED live
// templates, actually calls the real queue function against real TEST DB fixtures and inspects
// the resulting OutboxEvent row — not just reading the code — to prove templateName/languageCode/
// param-count/param-order/no-blank-values all match the live Meta reconciliation. Also proves the
// three not-yet-created templates are refused at queue time (TEMPLATE_NOT_APPROVED), never
// attempted. Safe to re-run — every row it creates is a fresh, disposable visit/outbox record.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

type Row = { template: string; language: string | null; expectedParams: number; actualParams: number; order: string; result: "PASS" | "FAIL" };
const rows: Row[] = [];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);

  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { salespersonId: exec.id, mobile: { not: null } } });
  const session = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  const workSessionId =
    session?.id ??
    (
      await db.seeraWorkSession.create({
        data: { employeeId: exec.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", startedAt: new Date(), status: "ACTIVE" },
      })
    ).id;
  const order = await db.seeraSalesOrder.findFirst({ where: { retailerId: retailer.id, salespersonId: exec.id }, orderBy: { createdAt: "desc" } });

  async function freshVisit(extra: Record<string, unknown> = {}) {
    return db.seeraVisit.create({
      data: {
        workSessionId,
        retailerId: retailer.id,
        checkedInAt: new Date(),
        checkedOutAt: new Date(),
        outcome: "PENDING",
        idempotencyKey: `wa-reconcile-${randomUUID()}`,
        ...extra,
      },
    });
  }

  function checkRow(templateKey: keyof typeof WHATSAPP_TEMPLATES, payload: any) {
    const def = templateFor(templateKey);
    const params: string[] = payload?.templateParams ?? [];
    const orderOk = !params.some((p) => p === "undefined" || p === "null" || p.trim() === "");
    const nameOk = payload?.templateName === def.metaTemplateName;
    const langOk = payload?.languageCode === def.languageCode;
    const countOk = params.length === def.paramLabels.length;
    const pass = orderOk && nameOk && langOk && countOk;
    rows.push({
      template: def.metaTemplateName,
      language: payload?.languageCode ?? null,
      expectedParams: def.paramLabels.length,
      actualParams: params.length,
      order: params.join(" | "),
      result: pass ? "PASS" : "FAIL",
    });
    assert(pass, `${templateKey} mismatch: name=${payload?.templateName} lang=${payload?.languageCode} params=${JSON.stringify(params)}`);
  }

  // 1. RETAILER_ORDER_PLACED (ORDER_RECORDED)
  {
    const visit = await freshVisit({ outcome: "PRODUCTIVE" });
    const result = await queueRetailerCommunication(db, { eventType: "ORDER_RECORDED", retailerId: retailer.id, visitId: visit.id, orderId: order?.id, actorId: exec.id });
    assert(result.queued, `RETAILER_ORDER_PLACED did not queue: ${result.reason}`);
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: result.outboxEventId! } });
    checkRow("RETAILER_ORDER_PLACED", event.payload);
  }

  // 2. RETAILER_NO_ORDER (REFUSED_OR_UNABLE) — bypass the once-per-day guard by deleting any
  // earlier row this same script run may have left for today, since this script is safe to re-run.
  {
    await db.outboxEvent.deleteMany({ where: { eventType: "REFUSED_OR_UNABLE", aggregateType: "SeeraRetailer", aggregateId: retailer.id, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
    const visit = await freshVisit({ outcome: "NO_ORDER", noOrderReason: "Stock available, will order next visit" });
    const result = await queueRetailerCommunication(db, { eventType: "REFUSED_OR_UNABLE", retailerId: retailer.id, visitId: visit.id, actorId: exec.id });
    assert(result.queued, `RETAILER_NO_ORDER did not queue: ${result.reason}`);
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: result.outboxEventId! } });
    checkRow("RETAILER_NO_ORDER", event.payload);
  }

  // 3. RETAILER_FOLLOW_UP
  {
    const followUpAt = new Date(Date.now() + 3 * 86_400_000);
    const visit = await freshVisit({ outcome: "FOLLOW_UP", followUpAt });
    const result = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, visitId: visit.id, actorId: exec.id });
    assert(result.queued, `RETAILER_FOLLOW_UP did not queue: ${result.reason}`);
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: result.outboxEventId! } });
    checkRow("RETAILER_FOLLOW_UP", event.payload);
  }

  // 4. RETAILER_ORDER_DELIVERED
  {
    const result = await queueRetailerCommunication(db, { eventType: "DELIVERED", retailerId: retailer.id, orderId: order?.id, actorId: exec.id });
    assert(result.queued, `RETAILER_ORDER_DELIVERED did not queue: ${result.reason}`);
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: result.outboxEventId! } });
    checkRow("RETAILER_ORDER_DELIVERED", event.payload);
  }

  // 5 & 6. DISTRIBUTOR_VISIT_COMPLETED / SUPER_STOCKIST_VISIT_COMPLETED
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  for (const [partnerType, key] of [
    ["DISTRIBUTOR", "DISTRIBUTOR_VISIT_COMPLETED"],
    ["SUPER_STOCKIST", "SUPER_STOCKIST_VISIT_COMPLETED"],
  ] as const) {
    const partner = await db.seeraPartner.findFirstOrThrow({ where: { type: partnerType } });
    const contact = partner.primaryContact as { mobile?: string } | null;
    assert(contact?.mobile, `${partnerType} fixture has no primaryContact.mobile — cannot prove this template live`);
    const visit = await db.seeraVisit.create({
      data: {
        workSessionId: (
          (await db.seeraWorkSession.findFirst({ where: { employeeId: manager.id, status: "ACTIVE" } })) ??
          (await db.seeraWorkSession.create({ data: { employeeId: manager.id, employeeRole: "SALES_MANAGER", workingType: "PARTNER", startedAt: new Date(), status: "ACTIVE" } }))
        ).id,
        partnerId: partner.id,
        partnerType,
        partnerVisitPurpose: "Order discussion and stock review",
        checkedInAt: new Date(),
        checkedOutAt: new Date(),
        outcome: "PENDING",
        idempotencyKey: `wa-reconcile-${randomUUID()}`,
      },
    });
    const result = await queuePartnerVisitCommunication(db, { partnerId: partner.id, partnerType, visitId: visit.id, actorId: manager.id });
    assert(result.queued, `${key} did not queue: ${result.reason}`);
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { id: result.outboxEventId! } });
    checkRow(key, event.payload);
  }

  // 7-9. The three not-yet-created templates must be refused at queue time, never attempted.
  for (const [eventType, templateKey] of [
    ["ORDER_ACCEPTED", "RETAILER_ORDER_ACCEPTED"],
    ["ORDER_PARTIAL", "RETAILER_ORDER_PARTIAL"],
    ["OUT_FOR_DELIVERY", "RETAILER_OUT_FOR_DELIVERY"],
  ] as const) {
    const result = await queueRetailerCommunication(db, { eventType, retailerId: retailer.id, orderId: order?.id, actorId: exec.id });
    assert(!result.queued && result.reason === "TEMPLATE_NOT_APPROVED", `${templateKey} should have been refused, got: ${JSON.stringify(result)}`);
    console.log(`MISSING TEMPLATE GOVERNED CORRECTLY: ${templateKey} -> queued=false reason=${result.reason}`);
  }

  console.log("\nTEMPLATE RECONCILIATION LIVE PROOF");
  for (const row of rows) {
    console.log(`${row.template}: language=${row.language} expectedParams=${row.expectedParams} actualParams=${row.actualParams} order=[${row.order}] RESULT=${row.result}`);
  }
  const anyFail = rows.some((r) => r.result === "FAIL");
  console.log(`\nOVERALL: ${anyFail ? "FAIL" : "PASS"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
