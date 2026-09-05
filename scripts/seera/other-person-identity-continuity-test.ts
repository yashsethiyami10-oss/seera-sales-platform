import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { interpretSmartFinance } from "../../lib/finance/smart-finance/service";
import { confirmOtherParty } from "../../lib/finance/smart-finance/other-party";

// Verifies the Founder's exact required behaviour: "Ramesh ko 2000 diye" (unknown) -> confirm as
// Other Person -> "Ramesh ko 1500 aur diye" (later) resolves to the SAME identity, never a new one.
// Writes ONE test fixture row to TEST DB only (a disposable Other Party dimension) — no production
// contact, no employee/login created.

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
url.searchParams.set("connection_limit", "1");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" }, select: { id: true } });

  const name = `Ramesh Continuity ${Date.now().toString(36)}`;
  console.log(`Step 1 — interpret "2000 diesel ${name} ko cash se diya" (expect UNMATCHED)`);
  const d1 = await interpretSmartFinance(prisma, founder.id, { text: `2000 diesel ${name} ko cash se diya` });
  console.log(`  person.status=${d1.personResolution?.status} missingRequired=${JSON.stringify(d1.missingRequired)}`);
  if (d1.personResolution?.status !== "UNMATCHED") throw new Error("expected UNMATCHED on first mention");

  console.log(`\nStep 2 — confirmOtherParty("${name}") (simulates the Founder tapping "Add & use")`);
  const confirmed = await confirmOtherParty(prisma, founder.id, { name, partyType: "Other Person", purpose: "diesel" });
  console.log(`  created=${confirmed.created} dimension.id=${confirmed.dimension.id}`);

  console.log(`\nStep 3 — interpret "1500 diesel ${name} ko aur cash se diya" (expect MATCHED to the SAME id)`);
  const d2 = await interpretSmartFinance(prisma, founder.id, { text: `1500 diesel ${name} ko aur cash se diya` });
  console.log(`  person.status=${d2.personResolution?.status} otherParty.id=${d2.personResolution?.otherParty?.id}`);
  const sameIdentity = d2.personResolution?.status === "MATCHED" && d2.personResolution.otherParty?.id === confirmed.dimension.id;
  console.log(`  SAME IDENTITY REUSED: ${sameIdentity}`);
  if (!sameIdentity) throw new Error("FAIL: second mention did not resolve to the same Other Party identity");

  console.log(`\nStep 4 — interpret again with a slightly different phrasing to confirm robustness: "500 courier ${name.split(" ")[0]} ko diya"`);
  const d3 = await interpretSmartFinance(prisma, founder.id, { text: `500 courier ${name.split(" ")[0]} ko diya` });
  console.log(`  person.status=${d3.personResolution?.status} candidates=${d3.personResolution?.candidates?.length ?? 0}`);

  console.log(`\nStep 5 — confirm no duplicate Other Party was created for "${name}" (expect exactly 1 active dimension)`);
  const dims = await prisma.seeraFinancialDimension.findMany({ where: { kind: "OTHER_PARTY", isActive: true, name: { contains: "Ramesh Continuity" } } });
  console.log(`  active OTHER_PARTY dimensions matching "Ramesh Continuity": ${dims.length}`);
  if (dims.length !== 1) throw new Error(`FAIL: expected exactly 1 dimension, found ${dims.length}`);

  console.log("\n=== ALL STEPS PASSED — Other Person identity continuity confirmed ===");

  console.log("\nCleanup: deactivating the disposable test fixture (TEST DB only)...");
  await prisma.seeraFinancialDimension.update({ where: { id: confirmed.dimension.id }, data: { isActive: false } });
  console.log("done.");
}

main()
  .catch((e) => {
    console.error("\n*** FAILED ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
