import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";
import { createRetailer, executiveCheckIn, executiveCheckOut, capturePhoto, createFollowUp } from "../../lib/sales-distribution/field-portal-service";
import { FoundationError } from "../../lib/foundation/errors";

// TEST-only live smoke test for the Sales Executive Founder-UAT bug-fix pass: proves the BACKEND
// half of the reported defects at the data layer (each visit/photo is genuinely isolated by
// visitId; the photo-required checkout gate fires and clears correctly; the photo format check no
// longer rejects real phone-camera output). The customer-state-leakage bug itself was a client-side
// React state bug (FieldJourney.tsx never reset local state across visits) — fixed in that file
// directly; this script proves the server side has no equivalent problem and never did. Safe to
// re-run.

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
runtime.searchParams.set("connection_limit", "8");
runtime.searchParams.set("pool_timeout", "180");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const uniqueSuffix = Date.now();
  const timing: Record<string, number> = {};
  const timed = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    const result = await fn();
    timing[label] = Date.now() - start;
    return result;
  };

  // Clean up any dangling open visit/session from a prior run.
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" }, checkedOutAt: null } });
  if (openVisit) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED" });

  const session = await timed("start-day", () => startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", remarks: "Bugfix smoke test" }));
  console.log("[Start Day] OK");

  // ---------------- TEST CASE A: Customer A — full happy path with a real photo ----------------
  const shopA = `Bugfix Shop A ${uniqueSuffix}`;
  const retailerA = await timed("customer-save-A", () =>
    createRetailer(db, exec.id, { businessName: shopA, address: { area: "Area A" }, idempotencyKey: `bugfix-a-${uniqueSuffix}` }),
  );
  const visitA = await timed("check-in-A", () =>
    executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailerA.id, idempotencyKey: `bugfix-a-checkin-${uniqueSuffix}` }),
  );
  const photoA = await timed("photo-upload-A", () =>
    capturePhoto(db, exec.id, { visitId: visitA.id, photoType: "SHOPFRONT", fileBase64: PNG_1PX, mimeType: "image/png", originalName: "a.png", idempotencyKey: `bugfix-a-photo-${uniqueSuffix}` }),
  );
  await timed("follow-up-A", () =>
    createFollowUp(db, exec.id, { type: "RETAIL_ORDER", retailerId: retailerA.id, visitId: visitA.id, dueDate: new Date(Date.now() + 86_400_000), priority: "NORMAL", note: "Smoke follow-up A", idempotencyKey: `bugfix-a-fu-${uniqueSuffix}` }),
  );
  // Checkout must see Photo A immediately — no exception should be required.
  await timed("checkout-A", () => executiveCheckOut(db, exec.id, visitA.id, { outcome: "ORDER_BOOKED" }));
  const closedA = await db.seeraVisit.findUniqueOrThrow({ where: { id: visitA.id } });
  assert(closedA.checkedOutAt != null, "expected visit A to be checked out");
  assert(closedA.photoExceptionReason == null, "expected visit A to need no photo exception — it had a real photo");
  console.log("[Test A] OK — checkout recognized Photo A immediately, no exception required");

  // ---------------- TEST CASE B: Customer B — proves total isolation from A ----------------
  const shopB = `Bugfix Shop B ${uniqueSuffix}`;
  const retailerB = await timed("customer-save-B", () =>
    createRetailer(db, exec.id, { businessName: shopB, address: { area: "Area B" }, idempotencyKey: `bugfix-b-${uniqueSuffix}` }),
  );
  assert(retailerB.id !== retailerA.id, "expected a genuinely distinct retailer for B");
  const visitB = await timed("check-in-B", () =>
    executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailerB.id, idempotencyKey: `bugfix-b-checkin-${uniqueSuffix}` }),
  );
  assert(visitB.id !== visitA.id, "expected a genuinely distinct visit for B");
  const photosOnB = await db.seeraVisitPhoto.findMany({ where: { visitId: visitB.id, deletedAt: null } });
  assert(photosOnB.length === 0, `expected Photo A to NOT appear on visit B, found ${photosOnB.length} photo(s)`);
  assert(photosOnB.every((p) => p.id !== photoA.id), "expected Photo A's id to never appear under visit B");
  const followUpsOnA = await db.seeraFollowUp.findMany({ where: { visitId: visitA.id } });
  const followUpsOnB = await db.seeraFollowUp.findMany({ where: { visitId: visitB.id } });
  assert(followUpsOnA.length === 1 && followUpsOnB.length === 0, "expected Customer A's follow-up to stay on visit A only");
  console.log("[Test B, part 1] OK — Photo A absent from visit B, follow-up A absent from visit B");

  const photoB = await timed("photo-upload-B", () =>
    capturePhoto(db, exec.id, { visitId: visitB.id, photoType: "COUNTER", fileBase64: PNG_1PX, mimeType: "image/png", originalName: "b.png", idempotencyKey: `bugfix-b-photo-${uniqueSuffix}` }),
  );
  assert(photoB.visitId === visitB.id && photoB.id !== photoA.id, "expected Photo B to be its own distinct row on visit B");
  await timed("checkout-B", () => executiveCheckOut(db, exec.id, visitB.id, { outcome: "ORDER_BOOKED" }));
  console.log("[Test B, part 2] OK — Photo B persisted and checkout accepted it immediately");

  // ---------------- TEST CASE C: Customer C — no-photo gate, then governed exception ----------------
  const shopC = `Bugfix Shop C ${uniqueSuffix}`;
  const retailerC = await createRetailer(db, exec.id, { businessName: shopC, address: { area: "Area C" }, idempotencyKey: `bugfix-c-${uniqueSuffix}` });
  const visitC = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailerC.id, idempotencyKey: `bugfix-c-checkin-${uniqueSuffix}` });
  let gateFired = false;
  let gateMessage = "";
  try {
    await executiveCheckOut(db, exec.id, visitC.id, { outcome: "NO_ORDER", noOrderReason: "Shop closed" });
  } catch (error) {
    gateFired = error instanceof FoundationError && error.code === "PHOTO_OR_EXCEPTION_REQUIRED";
    gateMessage = error instanceof Error ? error.message : "";
  }
  assert(gateFired, "expected PHOTO_OR_EXCEPTION_REQUIRED to fire with no photo and no exception");
  assert(gateMessage === "Add a shop photo or choose a valid no-photo reason.", `expected the improved message text, got: ${gateMessage}`);
  console.log("[Test C, part 1] OK — clean, catchable PHOTO_OR_EXCEPTION_REQUIRED (no crash), improved message:", gateMessage);
  await executiveCheckOut(db, exec.id, visitC.id, { outcome: "NO_ORDER", noOrderReason: "Shop closed", photoExceptionReason: "RETAILER_REFUSED" });
  const closedC = await db.seeraVisit.findUniqueOrThrow({ where: { id: visitC.id } });
  assert(closedC.checkedOutAt != null && closedC.photoExceptionReason === "RETAILER_REFUSED", "expected checkout to succeed once a governed no-photo exception was given");
  console.log("[Test C, part 2] OK — governed no-photo exception lets checkout succeed");

  // ---------------- Photo format handling ----------------
  const shopD = `Bugfix Shop D ${uniqueSuffix}`;
  const retailerD = await createRetailer(db, exec.id, { businessName: shopD, address: { area: "Area D" }, idempotencyKey: `bugfix-d-${uniqueSuffix}` });
  const visitD = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailerD.id, idempotencyKey: `bugfix-d-checkin-${uniqueSuffix}` });
  let rejected = false;
  try {
    await capturePhoto(db, exec.id, { visitId: visitD.id, photoType: "SHOPFRONT", fileBase64: PNG_1PX, mimeType: "image/gif", originalName: "bad.gif", idempotencyKey: `bugfix-d-bad-${uniqueSuffix}` });
  } catch (error) {
    rejected = error instanceof FoundationError && error.code === "UNSUPPORTED_PHOTO_TYPE";
  }
  assert(rejected, "expected a genuinely unsupported format (gif) to be cleanly rejected, not crash");
  const heicPhoto = await capturePhoto(db, exec.id, { visitId: visitD.id, photoType: "SHOPFRONT", fileBase64: PNG_1PX, mimeType: "image/heic", originalName: "iphone.heic", idempotencyKey: `bugfix-d-heic-${uniqueSuffix}` });
  assert(!!heicPhoto.id, "expected HEIC (real iPhone camera format) to now be accepted");
  await executiveCheckOut(db, exec.id, visitD.id, { outcome: "ORDER_BOOKED" });
  console.log("[Photo format] OK — GIF cleanly rejected, HEIC (real phone-camera format) now accepted");

  await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED" });

  console.log("\nTiming (ms):", timing);
  console.log("\nALL EXECUTIVE BUG-FIX SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
