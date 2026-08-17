import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { executiveCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// TEST-only reproduction of the live production Sales Executive "Confirm & end day"
// failure (Error ID de02b1a5-0a95-47d2-8642-3886d65bb6f1) for a genuinely
// ZERO-ACTIVITY day: Start Day succeeds, then End Day is called immediately with
// no retailer/visit/order/photo in between. Exercises the real service layer
// exactly as app/api/field/operations/route.ts (action=end-day) calls it, and
// prints the full raw error (name/message/code/meta/stack) if it throws, instead
// of guessing from code inspection alone.

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
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

async function attempt(label: string, execEmail: string, startInput: Parameters<typeof startFieldDay>[2], endInput: Omit<Parameters<typeof endFieldDay>[3], "outcome"> & { outcome?: string }) {
  console.log(`\n=== ${label} (${execEmail}) ===`);
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: execEmail } });
  const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (existing) {
    await db.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date(), outcome: "COMPLETED" } });
    console.log(`  Cleaned up pre-existing active session ${existing.id}`);
  }
  const resolvedStartInput = { ...startInput };
  if (resolvedStartInput.employeeRole === "SALES_EXECUTIVE" && resolvedStartInput.workingType === "RETAILING" && !resolvedStartInput.workingDistributorId) {
    const authorized = await executiveAuthorizedDistributors(db, exec.id);
    if (!authorized.length) throw new Error(`No authorized distributor found for ${execEmail} — cannot repro RETAILING Start Day`);
    resolvedStartInput.workingDistributorId = authorized[0]!.id;
    console.log(`  Using working distributor ${authorized[0]!.id} (${authorized[0]!.legalName})`);
  }
  const session = await startFieldDay(db, exec.id, resolvedStartInput);
  console.log(`  Start Day OK: session=${session.id} status=${session.status}`);

  try {
    const result = await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", ...endInput });
    console.log("  End Day OK (no throw):", JSON.stringify(result));
    return true;
  } catch (error) {
    console.log("  !!! End Day THREW !!!");
    if (error && typeof error === "object") {
      console.log("    name:", (error as { name?: string }).name);
      console.log("    message:", (error as { message?: string }).message);
      console.log("    code:", (error as { code?: string }).code);
      console.log("    meta:", JSON.stringify((error as { meta?: unknown }).meta));
      console.log("    stack:\n", (error as { stack?: string }).stack);
    } else {
      console.log("    raw:", error);
    }
    return false;
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);

  await attempt(
    "SCENARIO A: zero-activity, GPS available on both Start and End (Founder's exact repro)",
    "review-sales-executive-1@seera.test",
    { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 28.6139, longitude: 77.2090, accuracy: 10 },
    { latitude: 28.614, longitude: 77.2091, accuracy: 12, remarks: "zero-activity repro" },
  );

  await attempt(
    "SCENARIO B: zero-activity, GPS available on Start, MISSING on End (client sends undefined lat/lng)",
    "review-sales-executive-2@seera.test",
    { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 28.6139, longitude: 77.2090, accuracy: 10 },
    { endExceptionReason: "GPS unavailable", remarks: "zero-activity, no end gps" },
  );

  console.log("\n=== SCENARIO C: WITH activity (check-in + order + check-out), then End Day ===");
  {
    const execEmail = "review-sales-executive-1@seera.test";
    const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: execEmail } });
    const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" }, checkedOutAt: null } });
    if (openVisit) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "repro cleanup", photoExceptionReason: "OTHER" });
    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
    if (existing) await db.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date(), outcome: "COMPLETED" } });

    const authorized = await executiveAuthorizedDistributors(db, exec.id);
    const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209, accuracy: 10 });
    console.log(`  Start Day OK: session=${session.id}`);

    const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { salespersonId: exec.id, lifecycle: "ACTIVE" } });
    const pricedSku = await db.seeraPriceVersion.findFirstOrThrow({
      where: { tier: "DISTRIBUTOR_TO_RETAILER", status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }], sku: { status: "ACTIVE" } },
      select: { skuId: true },
    });
    const sku = await db.seeraSku.findUniqueOrThrow({ where: { id: pricedSku.skuId } });
    const visit = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailer.id, latitude: 28.614, longitude: 77.2095, accuracy: 10, idempotencyKey: `repro-checkin-${Date.now()}` });
    console.log(`  Check-in OK: visit=${visit.id} retailer=${retailer.businessName}`);

    const order = await placeRetailerOrder(db, { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" }, {
      retailerId: retailer.id,
      idempotencyKey: `repro-order-${Date.now()}`,
      lines: [{ skuId: sku.id, quantity: 1 }],
    });
    console.log(`  Order OK: order=${(order as { id?: string }).id ?? JSON.stringify(order)}`);

    await executiveCheckOut(db, exec.id, visit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "OTHER", latitude: 28.6141, longitude: 77.2096, accuracy: 10 });
    console.log("  Check-out OK");

    try {
      const result = await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED", latitude: 28.6142, longitude: 77.2097, accuracy: 10, remarks: "scenario C repro" });
      console.log("  End Day OK (no throw):", JSON.stringify(result));
    } catch (error) {
      console.log("  !!! End Day THREW !!!");
      console.log("    name:", (error as { name?: string }).name, "message:", (error as { message?: string }).message, "code:", (error as { code?: string }).code);
      console.log("    stack:\n", (error as { stack?: string }).stack);
    }
  }

  console.log("\n=== DONE ===");
}

main()
  .catch((error) => { console.error("SCRIPT-LEVEL FAILURE:", error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
