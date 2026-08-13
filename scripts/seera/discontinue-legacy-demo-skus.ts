import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, one-time correction: the 3 fictional "Seera Hair Oil / Shampoo / Face Wash" fixture
// SKUs (IV26-*) were seeded ACTIVE by an earlier version of seed-integrated-review.ts and were
// therefore still live in TEST DB from prior runs even after that seed script was fixed to seed
// them DISCONTINUED going forward. This flips any that are still ACTIVE. Safe to re-run (no-op
// once corrected); never deletes rows (historical order-line snapshots reference their id).

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
const db = new PrismaClient({ datasourceUrl: test });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const result = await db.seeraSku.updateMany({
    where: { code: { in: ["IV26-HAIR-OIL-100", "IV26-SHAMPOO-200", "IV26-FACE-WASH-100"] }, status: "ACTIVE" },
    data: { status: "DISCONTINUED" },
  });
  console.log(`Discontinued ${result.count} legacy demo SKU(s).`);
}
main().finally(() => db.$disconnect());
