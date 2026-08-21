import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// STRICTLY READ-ONLY. Investigates Founder report: Distributor / Super Stockist portal login
// credentials that worked "yesterday" now report incorrect ID/password on production. Prints
// only safe fields (never passwordHash) per the investigation's explicit safety rules.

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
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: production, productionUrl: production, testUrl: test });
const prisma = new PrismaClient({ datasourceUrl: production });

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY)`);

  const roles = await prisma.role.findMany({
    where: { code: { in: ["DISTRIBUTOR_OWNER", "DISTRIBUTOR_OPERATOR", "DISTRIBUTOR_DELIVERY_USER", "SUPER_STOCKIST_OWNER", "SUPER_STOCKIST_OPERATOR"] } },
  });
  console.log(`\nRoles found in catalog: ${roles.map((r) => `${r.code}(status=${r.status})`).join(", ") || "NONE"}`);
  const roleIds = roles.map((r) => r.id);

  const assignments = await prisma.userRoleAssignment.findMany({
    where: { roleId: { in: roleIds } },
    include: { role: true, user: true },
    orderBy: { assignedAt: "asc" },
  });

  console.log(`\nTotal Distributor/Super-Stockist role assignments (any status): ${assignments.length}`);

  for (const a of assignments) {
    const u = a.user;
    const partyLinks = await prisma.seeraPartyUser.findMany({
      where: { userId: u.id },
      include: { partner: true },
    });
    const activeLinks = partyLinks.filter((p) => p.active && (!p.effectiveTo || p.effectiveTo > new Date()));

    console.log(`\n--- ${a.role.code} | assignment status=${a.status} ---`);
    console.log(`  User id=${u.id}`);
    console.log(`  name=${u.name ?? "(none)"}`);
    console.log(`  email=${u.email}`);
    console.log(`  normalizedEmail=${u.normalizedEmail}`);
    console.log(`  phone=${u.phone ?? "(none)"}`);
    console.log(`  user.status=${u.status}`);
    console.log(`  suspendedAt=${u.suspendedAt?.toISOString() ?? "null"}  suspensionReason=${u.suspensionReason ?? "null"}`);
    console.log(`  hasPasswordHash=${Boolean(u.passwordHash)}`);
    console.log(`  authorizationVersion=${u.authorizationVersion}`);
    console.log(`  lastLoginAt=${u.lastLoginAt?.toISOString() ?? "never"}`);
    console.log(`  createdAt=${u.createdAt.toISOString()}  updatedAt=${u.updatedAt.toISOString()}`);
    console.log(`  roleAssignment: assignedAt=${a.assignedAt.toISOString()} effectiveFrom=${a.effectiveFrom.toISOString()} effectiveTo=${a.effectiveTo?.toISOString() ?? "null"} revokedAt=${a.revokedAt?.toISOString() ?? "null"}`);
    console.log(`  partner linkage (SeeraPartyUser): total=${partyLinks.length} active=${activeLinks.length}`);
    for (const p of partyLinks) {
      console.log(`    partnerId=${p.partnerId} partnerName=${p.partner.legalName} partnerType=${p.partner.type} accessRole=${p.accessRole} active=${p.active} effectiveFrom=${p.effectiveFrom.toISOString()} effectiveTo=${p.effectiveTo?.toISOString() ?? "null"}`);
    }
  }

  // Sanity: does the login lookup field (normalizedEmail per lib/foundation/auth-service.ts)
  // actually look like a usable identifier for these accounts, or is it a placeholder?
  console.log(`\n\n--- Cross-check: any of these users share a normalizedEmail collision or malformed value? ---`);
  const byEmail = new Map<string, number>();
  for (const a of assignments) byEmail.set(a.user.normalizedEmail, (byEmail.get(a.user.normalizedEmail) ?? 0) + 1);
  for (const [email, count] of byEmail) if (count > 1) console.log(`  COLLISION: ${email} used by ${count} accounts`);
  if ([...byEmail.values()].every((c) => c === 1)) console.log(`  No collisions.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
