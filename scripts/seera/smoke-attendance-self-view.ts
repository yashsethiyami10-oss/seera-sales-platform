// Post-End-Day Daily Summary gap closure — proves dailyActivityTimeline's new self-view permission
// branch: a Sales Executive (no network:manage) CAN read their OWN day's timeline (field_reports:
// view_self, already granted to that role) and CANNOT read someone else's (still needs
// network:manage). Safe to re-run: creates its own throwaway employees per run, TEST DB only.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { dailyActivityTimeline, istBusinessDayStart } from "../../lib/sales-distribution/attendance-service";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const production = envFile(".env").DATABASE_URL;
const test = envFile(".env.test").TEST_DATABASE_URL;
authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ✓", msg);
}

async function main() {
  const suffix = Date.now().toString(36);
  const role = await db.role.findUnique({ where: { code: "SALES_EXECUTIVE" } });
  if (!role) throw new Error("SALES_EXECUTIVE role not found");
  const empA = await db.user.create({ data: { email: `selfview-a-${suffix}@seera.test`, normalizedEmail: `selfview-a-${suffix}@seera.test`, name: "Self View A", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: empA.id, roleId: role.id, status: "ACTIVE" } });
  const empB = await db.user.create({ data: { email: `selfview-b-${suffix}@seera.test`, normalizedEmail: `selfview-b-${suffix}@seera.test`, name: "Self View B", passwordHash: "x", status: "ACTIVE" } });
  await db.userRoleAssignment.create({ data: { userId: empB.id, roleId: role.id, status: "ACTIVE" } });

  const today = istBusinessDayStart(new Date());

  console.log("=== A Sales Executive can read their OWN day's timeline (field_reports:view_self) ===");
  const own = await dailyActivityTimeline(db, empA.id, empA.id, today);
  assert(own.hasAnyData === false, "no fixture activity today -> hasAnyData false (never fabricated)");

  console.log("\n=== The SAME Sales Executive canNOT read a DIFFERENT employee's timeline ===");
  let deniedCorrectly = false;
  try {
    await dailyActivityTimeline(db, empA.id, empB.id, today);
  } catch (e) {
    deniedCorrectly = e instanceof Error && /permission|forbidden|denied|unauthorized/i.test(e.message);
    if (!deniedCorrectly) console.log("  (unexpected error shape):", e);
  }
  assert(deniedCorrectly, "cross-employee read is denied — self-view does not weaken the manager-only gate for OTHER employees' data");

  await db.$disconnect();
  console.log("\nALL SELF-VIEW PERMISSION ASSERTIONS PASSED.");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
