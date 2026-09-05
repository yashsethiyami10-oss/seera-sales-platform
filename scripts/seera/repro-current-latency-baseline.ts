import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

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
if (target.role !== "test") throw new Error("ABORT: not TEST");
const prisma = new PrismaClient({ datasources: { db: { url: test } } });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  for (let i = 1; i <= 8; i++) {
    const start = Date.now();
    await prisma.user.findFirst({ where: { normalizedEmail: "review-founder@seera.test" } });
    console.log(`  query ${i}: ${Date.now() - start}ms`);
  }
  console.log("\n=== interactive transaction with 5 sequential simple queries (mirrors placeRetailerOrder shape) ===");
  const txStart = Date.now();
  await prisma.$transaction(
    async (tx) => {
      for (let i = 1; i <= 5; i++) {
        const s = Date.now();
        await tx.user.findFirst({ where: { normalizedEmail: "review-founder@seera.test" } });
        console.log(`  tx query ${i}: ${Date.now() - s}ms`);
      }
    },
    { timeout: 30_000 },
  );
  console.log(`  total tx: ${Date.now() - txStart}ms`);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
