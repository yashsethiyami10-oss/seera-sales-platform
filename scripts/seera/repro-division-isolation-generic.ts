import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { resolveManagerOperationalScope } from "../../lib/sales-distribution/scope";

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
  const suffix = randomUUID().slice(0, 8);
  const manager1 = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const manager2 = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-manager-2@seera.test" } });

  // Two GENERIC territories, unrelated to Jhansi/Bhilwara, proving the fix isn't hardcoded to
  // those specific names.
  const territoryA = await prisma.seeraGeographyNode.create({ data: { code: `GEN-A-${suffix}`, name: `Generic Territory A ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
  const territoryB = await prisma.seeraGeographyNode.create({ data: { code: `GEN-B-${suffix}`, name: `Generic Territory B ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  await prisma.seeraAssignment.create({ data: { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: manager1.id, targetType: "GEOGRAPHY", targetId: territoryA.id, effectiveFrom: new Date("2026-01-01"), reason: "Generic isolation test", createdById: founder.id } });
  await prisma.seeraAssignment.create({ data: { assignmentType: "EXECUTIVE_TERRITORY", subjectType: "USER", subjectId: manager2.id, targetType: "GEOGRAPHY", targetId: territoryB.id, effectiveFrom: new Date("2026-01-01"), reason: "Generic isolation test", createdById: founder.id } });

  const distributorA = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `GEN-DA-${suffix}`, legalName: `Generic Distributor A ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000010" }, addresses: { city: "A" }, territoryIds: [territoryA.id], createdById: founder.id } });
  const distributorB = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `GEN-DB-${suffix}`, legalName: `Generic Distributor B ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000011" }, addresses: { city: "B" }, territoryIds: [territoryB.id], createdById: founder.id } });

  const scope1 = await resolveManagerOperationalScope(prisma, manager1.id);
  const scope2 = await resolveManagerOperationalScope(prisma, manager2.id);

  check("manager1 (territory A) sees distributor A", scope1.distributorIds.includes(distributorA.id));
  check("manager1 (territory A) does NOT see distributor B", !scope1.distributorIds.includes(distributorB.id));
  check("manager2 (territory B) sees distributor B", scope2.distributorIds.includes(distributorB.id));
  check("manager2 (territory B) does NOT see distributor A", !scope2.distributorIds.includes(distributorA.id));

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraAssignment.deleteMany({ where: { targetId: { in: [territoryA.id, territoryB.id] } } });
  await prisma.seeraPartner.deleteMany({ where: { id: { in: [distributorA.id, distributorB.id] } } });
  await prisma.seeraGeographyNode.deleteMany({ where: { id: { in: [territoryA.id, territoryB.id] } } });
  console.log("done.");

  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
