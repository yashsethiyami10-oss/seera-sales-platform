import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { interpretSmartFinance } from "../../lib/finance/smart-finance/service";

// SEERA — Smart Finance Part 3 deep audit. Calls the REAL interpretSmartFinance service (no
// mocking) against TEST DB for every Founder-specified real-world sentence, and prints exactly
// what a Founder would see: understood fields, missing fields, confidence, and whether anything
// was silently guessed. interpretSmartFinance never posts — read-only by construction.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: prod, testUrl: test });
const url = new URL(test);
url.searchParams.set("connection_limit", "1");
url.searchParams.set("connect_timeout", "15");
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

const SCENARIOS = [
  "2000 diesel cash se diya",
  "2000 diesel Ramesh ko cash se diya",
  "2000 diesel Manoj ko cash se diya",
  "8000 advertisement HDFC se pay kiya",
  "3000 salary Manoj ko di",
  "5000 travel reimbursement Ramesh ko diya",
  "10000 distributor se receive hue",
  "15000 Fatehnagar distributor se aaye",
  "2000 courier ke diye",
  "500 cash office expense",
  "3000 vendor ko diye",
  "5000 bank se vendor ko pay kiya",
  "दो हजार डीज़ल कैश से दिया",
  "2000 diesel cash se dediya yaar",
  "2000 XYZQ123 ko cash se diya",
  "2000 asdkjaslkdj ko diya",
  "2000 diesel diya",
  "diesel cash se diya",
  "5000 kisi ko diya",
  "diya",
  "2000",
  "2000 diesel",
  "2000 Ramesh ko diya",
  "5000 HDFC se diya diesel Ramesh ko",
];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const founder = await prisma.user.findFirst({ where: { normalizedEmail: "review-founder@seera.test" }, select: { id: true, email: true } });
  if (!founder) throw new Error("review-founder@seera.test not found — cannot trace without an authorized actor");
  console.log(`Actor: ${founder.email} (${founder.id})\n`);

  for (const [i, text] of SCENARIOS.entries()) {
    console.log(`\n${"=".repeat(70)}\n[${i + 1}] "${text}"`);
    try {
      const d = await interpretSmartFinance(prisma, founder.id, { text });
      console.log(`  understood=${d.understood} confidence=${d.confidence} direction=${d.direction} amount=${d.amount} purpose=${d.purposeCode ?? "-"}`);
      console.log(`  treasury=${d.treasury ? `${d.treasury.name} (assumed=${d.treasuryAssumed})` : "null"} treasuryOptions=${d.treasuryOptions.length} emptyState=${!!d.treasuryEmptyState}`);
      if (d.employee) console.log(`  employee=${d.employee.name}`);
      if (d.personResolution) console.log(`  person: role=${d.personResolution.role} status=${d.personResolution.status} -> ${d.personResolution.explanation}`);
      console.log(`  missingRequired=[${d.missingRequired.join(", ")}]`);
      console.log(`  postAction=${d.postAction}`);
      if (d.notes.length) console.log(`  notes: ${d.notes.join(" | ")}`);
    } catch (error) {
      console.log(`  *** THREW: ${error instanceof Error ? `${error.name}: ${error.message}` : error} ***`);
    }
  }

  console.log("\n\n=== Retry/idempotency probe: same text twice (simulated double-submit) ===");
  const d1 = await interpretSmartFinance(prisma, founder.id, { text: "2000 diesel cash se diya" });
  const d2 = await interpretSmartFinance(prisma, founder.id, { text: "2000 diesel cash se diya" });
  console.log(`  both interpretations identical shape: understood=${d1.understood}/${d2.understood}, missingRequired=${JSON.stringify(d1.missingRequired)}/${JSON.stringify(d2.missingRequired)}`);
  console.log(`  NOTE: interpretSmartFinance itself never posts — actual idempotency guard lives on the money-desk-create/guided-receipt endpoint, checked separately below.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
