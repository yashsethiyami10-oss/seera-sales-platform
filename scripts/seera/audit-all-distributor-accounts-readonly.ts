import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Audits all 10 production Distributor partners' login capability. Never
// prints a password hash or plaintext password.

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

async function main() {
  console.log(`[GUARD] role=${target.role}`);
  const distributors = await db.seeraPartner.findMany({ where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, orderBy: { legalName: "asc" } });
  console.log(`\n== ${distributors.length} ACTIVE DISTRIBUTOR PARTNERS ==`);
  for (const d of distributors) {
    const links = await db.seeraPartyUser.findMany({ where: { partnerId: d.id, active: true } });
    const addr = d.addresses && typeof d.addresses === "object" ? (d.addresses as { city?: unknown }).city : undefined;
    console.log(`\n--- ${d.legalName} (${d.code}) town=${typeof addr === "string" ? addr : "?"} ---`);
    if (!links.length) { console.log(`  NO ACTIVE PARTY-USER LINK`); continue; }
    for (const link of links) {
      const u = await db.user.findUniqueOrThrow({ where: { id: link.userId } });
      const roles = await db.userRoleAssignment.findMany({ where: { userId: u.id, status: "ACTIVE" }, include: { role: true } });
      const hasDistOwner = roles.some((a) => a.role.code === "DISTRIBUTOR_OWNER");
      console.log(
        `  userId=${u.id} name=${u.name} phone=${u.phone ?? "NULL"} email=${u.normalizedEmail} status=${u.status} hasPasswordHash=${Boolean(u.passwordHash)} accessRole=${link.accessRole} DISTRIBUTOR_OWNER=${hasDistOwner} lastLoginAt=${u.lastLoginAt?.toISOString() ?? "never"}`,
      );
    }
  }

  // Duplicate-mobile / duplicate-user cross-check across all distributor-linked users.
  const allUserIds = [...new Set((await db.seeraPartyUser.findMany({ where: { partner: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" }, active: true }, select: { userId: true } })).map((p) => p.userId))];
  const byPhone = new Map<string, number>();
  for (const id of allUserIds) {
    const u = await db.user.findUnique({ where: { id } });
    if (u?.phone) byPhone.set(u.phone, (byPhone.get(u.phone) ?? 0) + 1);
  }
  console.log(`\n== MOBILE UNIQUENESS CHECK (${allUserIds.length} users) ==`);
  const dupes = [...byPhone.entries()].filter(([, c]) => c > 1);
  console.log(dupes.length ? `DUPLICATES: ${JSON.stringify(dupes)}` : "No duplicate mobiles across Distributor logins.");
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
