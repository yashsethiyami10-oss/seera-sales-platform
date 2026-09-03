import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { upsertCompanyProfile, uploadCompanyBrandingAsset, getBrandingAssetBytes, getCompanyProfileForSettings } from "../../lib/finance/company-profile-service";

// Part I (Final 100% Completion Execution Contract) — verifies the real branding-asset-serving
// path the new /api/finance/company-branding-asset route uses end to end: upload a real image,
// confirm it's retrievable with the correct bytes/mime type, and confirm an unconfigured asset
// (never uploaded) is reported as genuinely absent, never a fabricated placeholder image.
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

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  const profile = await upsertCompanyProfile(prisma, founder.id, {
    legalName: `Seera Detergents Pvt Ltd Preview ${suffix}`, gstin: "09ABCDE1234F1Z5", address: { line: "Plot 12" }, state: "Uttar Pradesh", stateCode: "09",
  });

  console.log("=== Before upload: no asset configured, no fabricated image returned ===");
  const beforeProfile = await getCompanyProfileForSettings(prisma, founder.id);
  check("logoFileId is genuinely null before any upload", beforeProfile?.logoFileId === null);
  const beforeBytes = await getBrandingAssetBytes(prisma, beforeProfile?.logoFileId ?? null);
  check("no asset bytes returned for an unconfigured logo (null, not a placeholder)", beforeBytes === null);

  console.log("\n=== Upload a real logo image ===");
  const updated = await uploadCompanyBrandingAsset(prisma, founder.id, { kind: "LOGO", originalName: "logo.png", mimeType: "image/png", bytes: PNG_1PX });
  check("Company Profile now has a real logoFileId after upload", Boolean(updated.logoFileId));

  const afterBytes = await getBrandingAssetBytes(prisma, updated.logoFileId);
  check("the real uploaded bytes are retrievable and match exactly what was uploaded", Boolean(afterBytes) && Buffer.from(afterBytes!.bytes).equals(PNG_1PX));
  check("the correct real mime type is preserved", afterBytes?.mimeType === "image/png");

  console.log("\n=== Re-upload (replace) — the OLD file is never referenced again, new bytes serve immediately ===");
  const PNG_1PX_2 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const updated2 = await uploadCompanyBrandingAsset(prisma, founder.id, { kind: "LOGO", originalName: "logo2.png", mimeType: "image/png", bytes: PNG_1PX_2 });
  check("re-upload produces a NEW fileId (not reusing the old one)", updated2.logoFileId !== updated.logoFileId);
  const afterReupload = await getBrandingAssetBytes(prisma, updated2.logoFileId);
  check("the NEW bytes are what's now served, not the old ones", Boolean(afterReupload) && Buffer.from(afterReupload!.bytes).equals(PNG_1PX_2));

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.storedFile.deleteMany({ where: { entityType: "SeeraBillingProfile", entityId: profile.id } });
  await prisma.seeraBillingProfile.delete({ where: { id: profile.id } });
  const remaining = await prisma.seeraBillingProfile.count({ where: { id: profile.id } });
  console.log(`Remaining: companyProfile=${remaining}`);
  if (remaining !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
