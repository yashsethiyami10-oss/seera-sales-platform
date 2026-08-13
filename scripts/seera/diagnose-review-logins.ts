import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only, read-only diagnostic for the four review-user logins the Founder is manually UAT-ing.
// Checks every link in the login chain: user existence/status/passwordHash, active role assignment,
// active role, party/org membership (Distributor/S.S. only), and the effective-permission set that
// determines the landing route. Makes no writes.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });
const PASSWORD = "SeeraReview!2026";

const REVIEW_EMAILS = [
  "review-sales-executive-1@seera.test",
  "review-sales-manager-1@seera.test",
  "review-distributor-owner@seera.test",
  "review-ss-owner@seera.test",
];

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  for (const email of REVIEW_EMAILS) {
    console.log(`\n=== ${email} ===`);
    const user = await db.user.findUnique({
      where: { normalizedEmail: email },
      include: {
        roleAssignments: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) {
      console.log("USER: MISSING");
      continue;
    }
    console.log("USER: exists, id=", user.id, "status=", user.status);
    console.log("passwordHash present:", Boolean(user.passwordHash));
    if (user.passwordHash) {
      const valid = await bcrypt.compare(PASSWORD, user.passwordHash);
      console.log(`passwordHash matches "${PASSWORD}":`, valid);
    }
    const activeAssignments = user.roleAssignments.filter(
      (a) => a.status === "ACTIVE" && (!a.effectiveTo || a.effectiveTo > new Date()),
    );
    console.log("role assignments (total):", user.roleAssignments.length, "active:", activeAssignments.length);
    for (const a of user.roleAssignments) {
      console.log(
        `  - role=${a.role.code} assignmentStatus=${a.status} roleStatus=${a.role.status} effectiveTo=${a.effectiveTo ?? "null"} permCount=${a.role.permissions.length}`,
      );
    }
    const permissions = new Set(
      activeAssignments.filter((a) => a.role.status === "ACTIVE").flatMap((a) => a.role.permissions.map((p) => p.permission.code)),
    );
    console.log("effective permission count:", permissions.size);
    let landing = "/";
    if (permissions.has("system:super_admin")) landing = "/portal/founder-admin";
    else if (permissions.has("portal:admin")) landing = "/portal/company-admin";
    else if (permissions.has("portal:accounts")) landing = "/portal/accounts";
    else if (permissions.has("portal:sales_manager")) landing = "/portal/sales-manager";
    else if (permissions.has("portal:sales_executive")) landing = "/portal/sales-executive";
    else if (permissions.has("portal:distributor")) landing = "/portal/distributor";
    else if (permissions.has("portal:super_stockist")) landing = "/portal/super-stockist";
    else if (permissions.has("portal:retailer")) landing = "/portal/retailer";
    else if (permissions.has("audit:view")) landing = "/portal/auditor";
    console.log("computed landing path:", landing);

    if (email.includes("distributor-owner") || email.includes("ss-owner")) {
      const memberships = await db.seeraPartyUser.findMany({ where: { userId: user.id }, include: { partner: true } });
      console.log("party memberships (total):", memberships.length);
      for (const m of memberships)
        console.log(`  - partner=${m.partner.tradeName ?? m.partner.legalName} type=${m.partner.type} lifecycle=${m.partner.lifecycle} active=${m.active}`);
      const activeMembership = memberships.find((m) => m.active && (!m.effectiveTo || m.effectiveTo > new Date()));
      console.log("has active membership:", Boolean(activeMembership));
    }
  }
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
