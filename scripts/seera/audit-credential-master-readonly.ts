import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Full credential-master audit across every active operational portal.
// Never prints passwordHash. Never mutates anything.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: production });

async function dumpRole(roleCode: string) {
  const role = await db.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    console.log(`  ROLE ${roleCode}: NOT IN CATALOG`);
    return;
  }
  const assignments = await db.userRoleAssignment.findMany({ where: { roleId: role.id, status: "ACTIVE" }, include: { user: true } });
  console.log(`\n== ${roleCode} (${assignments.length} active) ==`);
  for (const a of assignments) {
    const u = a.user;
    const links = await db.seeraPartyUser.findMany({ where: { userId: u.id, active: true }, include: { partner: true } });
    console.log(
      `  userId=${u.id} name=${u.name ?? "?"} phone=${u.phone ?? "NULL"} email=${u.normalizedEmail} status=${u.status} hasPasswordHash=${Boolean(u.passwordHash)} lastLoginAt=${u.lastLoginAt?.toISOString() ?? "never"} partyLinks=${links.map((l) => `${l.partner.legalName}(${l.accessRole})`).join(",") || "none"}`,
    );
  }
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  for (const code of [
    "FOUNDER_SUPER_ADMIN",
    "COMPANY_ADMIN",
    "SALES_MANAGER",
    "SALES_EXECUTIVE",
    "DISTRIBUTOR_OWNER",
    "DISTRIBUTOR_OPERATOR",
    "SUPER_STOCKIST_OWNER",
    "SUPER_STOCKIST_OPERATOR",
    "ACCOUNTS_MANAGER",
    "READ_ONLY_AUDITOR",
    "MANUFACTURING_MANAGER",
    "PRODUCTION_SUPERVISOR",
    "STORE_EXECUTIVE",
    "QC_USER",
    "PRODUCTION_OPERATOR",
  ]) {
    await dumpRole(code);
  }

  // Company Direct: is it login-enabled at all (any User with a PartyUser link to the COMPANY_DIRECT partner)?
  const cdPartner = await db.seeraPartner.findFirst({ where: { type: "COMPANY_DIRECT" } });
  console.log(`\n== COMPANY DIRECT PARTNER ==`);
  console.log(cdPartner ? `id=${cdPartner.id} name=${cdPartner.legalName}` : "NO COMPANY_DIRECT PARTNER EXISTS");
  if (cdPartner) {
    const cdLinks = await db.seeraPartyUser.findMany({ where: { partnerId: cdPartner.id, active: true } });
    console.log(`  active party-user links: ${cdLinks.length}`);
  }

  // Duplicate mobile check across ALL users (not just per-role) for a global signal.
  const allUsers = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, phone: true, name: true } });
  const byPhone = new Map<string, string[]>();
  for (const u of allUsers) if (u.phone) byPhone.set(u.phone, [...(byPhone.get(u.phone) ?? []), u.id]);
  const dupes = [...byPhone.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`\n== GLOBAL DUPLICATE MOBILE CHECK (${allUsers.length} active users) ==`);
  console.log(dupes.length ? JSON.stringify(dupes) : "No duplicate mobiles.");

  // Distributor partner count sanity vs role assignment count.
  const distPartners = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, select: { id: true, legalName: true, assignedSuperStockistId: true } });
  console.log(`\n== ACTIVE DISTRIBUTOR PARTNERS (${distPartners.length}) with S.S. linkage ==`);
  for (const d of distPartners) console.log(`  id=${d.id} name=${d.legalName} assignedSuperStockistId=${d.assignedSuperStockistId ?? "NONE"}`);

  const ssPartners = await db.seeraPartner.findMany({ where: { type: "SUPER_STOCKIST", lifecycle: "ACTIVE" }, select: { id: true, legalName: true } });
  console.log(`\n== ACTIVE SUPER STOCKIST PARTNERS (${ssPartners.length}) ==`);
  for (const s of ssPartners) console.log(`  id=${s.id} name=${s.legalName}`);
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
