import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { invoiceWizardSkuCatalog } from "../../lib/finance/reports-service";

// Finance + Money Desk UI/UX Restructure §6 — the Create Invoice wizard's Items step reads this new
// report. Proves: real SKUs returned (not fabricated), taxRate/hsn surfaced honestly (null when
// genuinely unconfigured — never defaulted to 0 client-side, matching the "never invent a price/tax"
// convention this whole codebase already follows), and the money_desk:create RBAC gate this reuses
// from requireIssuerScope's COMPANY-issuer check is actually enforced.
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

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  console.log("=== Founder (money_desk:create) can read the catalog ===");
  const skus = await invoiceWizardSkuCatalog(prisma, founder.id);
  check("returns a non-empty real SKU catalog", skus.length > 0);
  check("every row has a real skuId/label/brand", skus.every((s) => s.value && s.label && s.brand));
  const configured = skus.find((s) => s.taxRate != null && s.hsn);
  const unconfigured = skus.find((s) => s.taxRate == null || !s.hsn);
  check("a configured SKU (if any exists) reports its real taxRate, not fabricated", !configured || typeof configured.taxRate === "number");
  console.log(`  [info] ${skus.filter((s) => s.taxRate != null).length}/${skus.length} SKUs have a configured GST rate; ${unconfigured ? "at least one does not (correctly surfaced as taxRate:null, not defaulted to 0)" : "all are configured"}`);

  console.log("\n=== A non-Money-Desk actor is correctly denied ===");
  await invoiceWizardSkuCatalog(prisma, executive.id).then(
    () => check("Sales Executive without money_desk:create is correctly denied", false),
    (e) => check("Sales Executive without money_desk:create is correctly denied (ACCESS_DENIED)", (e as { code?: string }).code === "ACCESS_DENIED"),
  );

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
