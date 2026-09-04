import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } from "../../lib/sales-distribution/field-photo-cloudinary-service";

// Priority 5 (Final Remaining System Completion Mission) — proves requireActiveOwnedVisit's
// widening (field-photo-cloudinary-service.ts) actually reaches a Manager's own visit now, and
// that the fix is a genuine capability addition, not a scope relaxation: an Executive's own visit
// still works exactly as before, and a Manager still cannot reach ANOTHER actor's visit (Manager or
// Executive). NOTE — this dev checkout has no CLOUDINARY_* credentials configured locally (neither
// .env nor .env.test), so the real Cloudinary network round-trip cannot be exercised from here; this
// is reported honestly rather than faked. What IS fully provable without credentials: the
// authorization/visit-scope layer runs BEFORE cloudinaryConfig() inside
// createFieldPhotoUploadSignature, so a call that reaches PHOTO_STORAGE_UNAVAILABLE (config missing)
// instead of VISIT_SCOPE_DENIED (scope check) has, by construction, already passed the exact scope
// check this fix changed — that boundary is what's asserted below.
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const prisma = new PrismaClient({ datasourceUrl: test });

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function scopeOutcome(actorId: string, visitId: string): Promise<"PASSED_SCOPE" | "VISIT_SCOPE_DENIED" | "OTHER"> {
  try {
    await createFieldPhotoUploadSignature(prisma, actorId, visitId);
    return "PASSED_SCOPE"; // would only happen if Cloudinary creds WERE configured
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "VISIT_SCOPE_DENIED") return "VISIT_SCOPE_DENIED";
    if (code === "PHOTO_STORAGE_UNAVAILABLE") return "PASSED_SCOPE"; // scope check passed, failed only on missing local creds
    throw e;
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const manager = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const otherExecutive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-2@seera.test" } });

  const retailer = await prisma.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE" } });

  console.log("=== Setup: an ACTIVE Manager session + visit, and an ACTIVE Executive session + visit ===");
  // Clean slate — mirrors repro-start-day-add-customer.ts: end any pre-existing ACTIVE session for
  // these actors first (the unique constraint allows only one ACTIVE session per employeeId).
  for (const employeeId of [manager.id, executive.id]) {
    const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId, status: "ACTIVE" } });
    if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });
  }
  const managerSession = await prisma.seeraWorkSession.create({
    data: { employeeId: manager.id, employeeRole: "SALES_MANAGER", workingType: "RETAILING", status: "ACTIVE", startedAt: new Date() },
  });
  const managerVisit = await prisma.seeraVisit.create({
    data: { workSessionId: managerSession.id, retailerId: retailer.id, checkedInAt: new Date(), idempotencyKey: `repro-mgr-photo-visit-${managerSession.id}` },
  });
  const execSession = await prisma.seeraWorkSession.create({
    data: { employeeId: executive.id, employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", status: "ACTIVE", startedAt: new Date() },
  });
  const execVisit = await prisma.seeraVisit.create({
    data: { workSessionId: execSession.id, retailerId: retailer.id, checkedInAt: new Date(), idempotencyKey: `repro-mgr-photo-visit-${execSession.id}` },
  });

  console.log("\n=== PRIORITY 5 — Manager can now reach the Cloudinary signing pipeline for their OWN visit ===");
  check("Manager's own visit passes the (widened) scope check", (await scopeOutcome(manager.id, managerVisit.id)) === "PASSED_SCOPE");

  console.log("\n=== Regression — Executive's own visit still passes exactly as before ===");
  check("Executive's own visit still passes the scope check (unchanged)", (await scopeOutcome(executive.id, execVisit.id)) === "PASSED_SCOPE");

  console.log("\n=== Still correctly denied — a Manager cannot reach an UNRELATED actor's visit ===");
  check("Manager cannot reach the Executive's visit", (await scopeOutcome(manager.id, execVisit.id)) === "VISIT_SCOPE_DENIED");
  check("An unrelated Executive cannot reach the Manager's visit", (await scopeOutcome(otherExecutive.id, managerVisit.id)) === "VISIT_SCOPE_DENIED");

  console.log("\n=== finalizeFieldPhotoUpload's own visit-scope + publicId-prefix checks are unaffected by the widening ===");
  await finalizeFieldPhotoUpload(prisma, manager.id, {
    visitId: managerVisit.id,
    photoType: "SHOPFRONT",
    publicId: `seera/field-visits/${execVisit.id}/spoofed`, // deliberately another visit's folder
    version: 1,
    signature: "0".repeat(40),
    secureUrl: "https://res.cloudinary.com/x/image/upload/v1/seera/field-visits/x/spoofed.jpg",
    bytes: 1000,
    width: 100,
    height: 100,
    format: "jpg",
  }).then(
    () => check("finalize rejects a publicId outside the caller's own visit folder", false),
    (e) => check("finalize rejects a publicId outside the caller's own visit folder (PHOTO_SCOPE_DENIED)", (e as { code?: string }).code === "PHOTO_SCOPE_DENIED"),
  );

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  console.log("\n--- Honest scope note ---");
  console.log("No CLOUDINARY_* credentials are configured in this dev checkout's .env/.env.test, so the");
  console.log("real Cloudinary network upload + response-signature verification round trip could not be");
  console.log("exercised from this script. What's proven above is the authorization/visit-scope boundary");
  console.log("this fix actually changed (it runs before Cloudinary config is even read), plus finalize's");
  console.log("independent publicId-prefix check — both fully exercisable without real credentials.");

  console.log("\n=== Cleanup ===");
  await prisma.seeraVisit.deleteMany({ where: { id: { in: [managerVisit.id, execVisit.id] } } });
  await prisma.seeraWorkSession.deleteMany({ where: { id: { in: [managerSession.id, execSession.id] } } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
