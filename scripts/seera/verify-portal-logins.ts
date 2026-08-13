import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { login } from "../../lib/foundation/auth-service";
import { portalLandingPathForRole, primaryRoleAssignment } from "../../lib/foundation/portal-landing";

// TEST-only: exercises the REAL login() code path (bcrypt compare, status check, session create)
// against TEST DB for each candidate portal user, then computes the real landing path the same
// way the login API route does. Read-mostly except for the Session rows login() itself creates
// (harmless, TEST-only, identical to what a real browser login does).

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
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "3");
runtime.searchParams.set("pool_timeout", "90");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

const PASSWORD = "SeeraReview!2026";
const candidates = [
  { label: "Sales Executive", email: "review-sales-executive-1@seera.test", expectedPath: "/portal/sales-executive" },
  { label: "Sales Manager", email: "review-sales-manager-1@seera.test", expectedPath: "/portal/sales-manager" },
  { label: "Distributor", email: "review-distributor-owner@seera.test", expectedPath: "/portal/distributor" },
  { label: "Super Stockist", email: "review-ss-owner@seera.test", expectedPath: "/portal/super-stockist" },
];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  for (const c of candidates) {
    const userRow = await db.user.findUnique({ where: { normalizedEmail: c.email } });
    const roles = userRow
      ? await db.userRoleAssignment.findMany({ where: { userId: userRow.id, status: "ACTIVE" }, include: { role: true } })
      : [];
    const partyMemberships = userRow
      ? await db.seeraPartyUser.findMany({ where: { userId: userRow.id, active: true } })
      : [];
    try {
      const result = await login(db, { email: c.email, password: PASSWORD });
      const primary = await primaryRoleAssignment(db, result.userId);
      const landing = portalLandingPathForRole(primary?.role.code);
      console.log(
        JSON.stringify({
          label: c.label,
          email: c.email,
          userExists: Boolean(userRow),
          userStatus: userRow?.status,
          activeRoles: roles.map((r) => r.role.code),
          partyMemberships: partyMemberships.map((p) => ({ partnerId: p.partnerId, accessRole: p.accessRole })),
          loginResult: "SUCCESS",
          computedLandingPath: landing,
          expectedLandingPath: c.expectedPath,
          landingMatches: landing === c.expectedPath,
          verdict: landing === c.expectedPath ? "PASS" : "FAIL",
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          label: c.label,
          email: c.email,
          userExists: Boolean(userRow),
          userStatus: userRow?.status,
          activeRoles: roles.map((r) => r.role.code),
          partyMemberships: partyMemberships.map((p) => ({ partnerId: p.partnerId, accessRole: p.accessRole })),
          loginResult: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          verdict: "FAIL",
        }),
      );
    }
  }
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
