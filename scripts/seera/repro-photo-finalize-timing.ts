import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// Measures the SERVER-side portion of the photo pipeline only: signature issuance and finalize
// (the actual Cloudinary upload transfer happens client<->Cloudinary directly, never through this
// server, so it cannot be measured here — flagged explicitly, not silently omitted).

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
const url = new URL(test);
url.searchParams.set("connection_limit", "3");
url.searchParams.set("connect_timeout", "20");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "test-cloud";
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "test-key";
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "test-secret-never-returned";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`  [${Date.now() - start}ms] ${label}`);
  return result;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const { createFieldPhotoUploadSignature, finalizeFieldPhotoUpload } = await import("../../lib/sales-distribution/field-photo-cloudinary-service");
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  const existing = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existing) await prisma.seeraWorkSession.update({ where: { id: existing.id }, data: { status: "ENDED", endedAt: new Date() } });

  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });
  const suffix = randomUUID().slice(0, 8);
  const { visit } = await createRetailerAndCheckIn(prisma, executive.id, {
    businessName: `Photo Repro ${suffix}`,
    address: { area: "Test Area" },
    latitude: 28.6139,
    longitude: 77.209,
    confirmDuplicate: false,
    idempotencyKey: randomUUID(),
    workSessionId: session.id,
    checkInIdempotencyKey: randomUUID(),
  });

  console.log("\n=== Server-side photo pipeline timing (Cloudinary transfer itself NOT measured here) ===");
  const signed = await timed("createFieldPhotoUploadSignature (client calls this BEFORE opening camera, per the signature-prefetch optimization)", () =>
    createFieldPhotoUploadSignature(prisma, executive.id, visit.id),
  );

  // Simulate what Cloudinary's response would report for a realistic ~2MB field photo.
  const fullPublicId = `${signed.folder}/${signed.public_id}`;
  await timed("finalizeFieldPhotoUpload (DB write + audit, AFTER Cloudinary transfer completes)", () =>
    finalizeFieldPhotoUpload(prisma, executive.id, {
      visitId: visit.id,
      photoType: "SHOPFRONT",
      publicId: fullPublicId,
      version: 1234567890,
      signature: "mock-signature",
      secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/v1234567890/${fullPublicId}.jpg`,
      bytes: 2_100_000,
      width: 2048,
      height: 1536,
      format: "jpg",
    }),
  );

  console.log("\n=== Cleanup ===");
  await prisma.seeraGpsSample.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraVisitPhoto.deleteMany({ where: { visitId: visit.id } });
  await prisma.seeraVisit.deleteMany({ where: { workSessionId: session.id } });
  await prisma.seeraRetailer.deleteMany({ where: { businessName: { contains: "Photo Repro" } } });
  await prisma.seeraWorkSession.delete({ where: { id: session.id } });
  console.log("done.");
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
