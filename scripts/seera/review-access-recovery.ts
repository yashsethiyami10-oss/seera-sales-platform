import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { inspectDatabaseUrl } from "../../lib/database/identity-guard";
import { authorizeTestRuntime } from "../../lib/database/test-runtime-guard";
import { hashPassword } from "../../lib/foundation/auth-service";

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
const testEnvironment = envFile(path.join(root, ".env.test"));
const test = testEnvironment.TEST_DATABASE_URL;
const runtimeTarget = testEnvironment.TEST_DIRECT_DATABASE_URL ?? test;
const identity = authorizeTestRuntime({ runtimeRole: "test", runtimeDatabaseUrl: runtimeTarget, configuredProductionUrl: production, configuredTestUrl: test });
const runtime = new URL(runtimeTarget);
runtime.searchParams.set("connection_limit", "2");
runtime.searchParams.set("pool_timeout", "60");
runtime.searchParams.set("connect_timeout", "20");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });
const reviewPassword = "SeeraReview!2026";

const accounts = [
  ["Founder / Super Admin", "review-founder@seera.test", "FOUNDER_SUPER_ADMIN", "/portal/founder-admin"],
  ["Company Admin", "review-company-admin@seera.test", "COMPANY_ADMIN", "/portal/company-admin"],
  ["Accounts Manager", "review-accounts-manager@seera.test", "ACCOUNTS_MANAGER", "/portal/accounts"],
  ["Accounts Executive", "review-accounts-executive@seera.test", "ACCOUNTS_EXECUTIVE", "/portal/accounts"],
  ["Sales Head", "review-sales-head@seera.test", "SALES_HEAD", "/portal/sales-manager"],
  ["Sales Manager", "review-sales-manager-1@seera.test", "SALES_MANAGER", "/portal/sales-manager"],
  ["Sales Executive", "review-sales-executive-1@seera.test", "SALES_EXECUTIVE", "/portal/sales-executive"],
  ["Super Stockist Owner", "review-ss-owner@seera.test", "SUPER_STOCKIST_OWNER", "/portal/super-stockist"],
  ["Super Stockist Operator", "review-ss-operator@seera.test", "SUPER_STOCKIST_OPERATOR", "/portal/super-stockist"],
  ["Distributor Owner", "review-distributor-owner@seera.test", "DISTRIBUTOR_OWNER", "/portal/distributor"],
  ["Distributor Operator", "review-distributor-operator@seera.test", "DISTRIBUTOR_OPERATOR", "/portal/distributor"],
  ["Distributor Delivery User", "review-delivery@seera.test", "DISTRIBUTOR_DELIVERY_USER", "/portal/distributor"],
  ["Retailer User", "review-retailer@seera.test", "RETAILER_USER", "/portal/retailer"],
  ["Read-only Auditor", "review-auditor@seera.test", "READ_ONLY_AUDITOR", "/portal/auditor"],
] as const;

async function inspect() {
  const emails = accounts.map(([, email]) => email);
  const users = await db.user.findMany({
    where: { normalizedEmail: { in: emails } },
    include: { roleAssignments: { include: { role: true } } },
  });
  const userByEmail = new Map(users.map((user) => [user.normalizedEmail, user]));
  const userIds = users.map((user) => user.id);
  const [partyScopes, assignments, sessions] = await Promise.all([
    db.seeraPartyUser.findMany({ where: { userId: { in: userIds }, active: true }, select: { userId: true, effectiveFrom: true, effectiveTo: true } }),
    db.seeraAssignment.findMany({ where: { OR: [{ subjectId: { in: userIds } }, { targetId: { in: userIds } }] }, select: { subjectId: true, targetId: true, effectiveFrom: true, effectiveTo: true } }),
    db.session.findMany({ where: { userId: { in: userIds }, revokedAt: null, expires: { gt: new Date() } }, select: { userId: true, authorizationVersion: true } }),
  ]);
  const now = new Date();
  const rows = [];
  for (const [roleName, email, roleCode, landing] of accounts) {
    const user = userByEmail.get(email);
    const activeRole = user?.roleAssignments.some((assignment) => assignment.role.code === roleCode && assignment.status === "ACTIVE" && assignment.effectiveFrom <= now && (!assignment.effectiveTo || assignment.effectiveTo > now)) ?? false;
    const passwordValid = Boolean(user?.passwordHash && await bcrypt.compare(reviewPassword, user.passwordHash));
    const partnerScopeCount = user ? partyScopes.filter((scope) => scope.userId === user.id && scope.effectiveFrom <= now && (!scope.effectiveTo || scope.effectiveTo > now)).length : 0;
    const assignmentCount = user ? assignments.filter((assignment) => (assignment.subjectId === user.id || assignment.targetId === user.id) && assignment.effectiveFrom <= now && (!assignment.effectiveTo || assignment.effectiveTo > now)).length : 0;
    const activeSessions = user ? sessions.filter((session) => session.userId === user.id && session.authorizationVersion === user.authorizationVersion).length : 0;
    rows.push({ roleName, email, roleCode, landing, exists: Boolean(user), active: user?.status === "ACTIVE", activeRole, passwordValid, partnerScopes: partnerScopeCount, assignments: assignmentCount, activeSessions });
  }
  return rows;
}

async function repair(rows: Awaited<ReturnType<typeof inspect>>) {
  const founder = await db.user.findUnique({ where: { normalizedEmail: "review-founder@seera.test" } });
  if (!founder) throw new Error("FOUNDER_REVIEW_USER_MISSING_REQUIRES_FIXTURE_RECONSTRUCTION");
  const passwordHash = await hashPassword(reviewPassword);
  const changed: string[] = [];
  for (const row of rows) {
    const user = await db.user.findUnique({ where: { normalizedEmail: row.email } });
    if (!user) throw new Error(`REVIEW_USER_MISSING:${row.email}`);
    const role = await db.role.findUnique({ where: { code: row.roleCode } });
    if (!role || role.status !== "ACTIVE") throw new Error(`ACTIVE_ROLE_MISSING:${row.roleCode}`);
    if (!row.active || !row.passwordValid) {
      await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", passwordHash, suspendedAt: null, suspensionReason: null, authorizationVersion: { increment: 1 } } });
      await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: "TEST_REVIEW_ACCESS_RECOVERY" } });
      changed.push(`${row.email}:credentials`);
    }
    if (!row.activeRole) {
      await db.userRoleAssignment.updateMany({ where: { userId: user.id, roleId: role.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokedById: founder.id, revocationReason: "TEST_REVIEW_ACCESS_RECOVERY" } });
      await db.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, assignedById: founder.id, assignmentReason: "TEST review access recovery" } });
      changed.push(`${row.email}:role`);
    }
  }
  return changed;
}

async function verifyHttp() {
  const baseUrl = process.env.SEERA_REVIEW_BASE_URL ?? "http://localhost:3001";
  const results = [];
  for (let index = 0; index < accounts.length; index += 1) {
    const [roleName, email, , landing] = accounts[index];
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `127.9.0.${index + 1}` },
      body: JSON.stringify({ email, password: reviewPassword }),
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await loginResponse.json().catch(() => ({})) as { landingPath?: string; error?: { code?: string } };
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    let landingStatus = 0;
    let refreshStatus = 0;
    let finalUrl = "";
    if (loginResponse.ok && cookie) {
      const landingResponse = await fetch(`${baseUrl}${landing}`, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
      landingStatus = landingResponse.status;
      finalUrl = landingResponse.headers.get("location") ?? landing;
      if (index === 0) {
        const refreshResponse = await fetch(`${baseUrl}${landing}`, { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
        refreshStatus = refreshResponse.status;
      }
    }
    results.push({ roleName, email, expectedLanding: landing, loginStatus: loginResponse.status, landingPath: payload.landingPath ?? null, landingStatus, refreshStatus: index === 0 ? refreshStatus : undefined, finalUrl, pass: loginResponse.status === 200 && payload.landingPath === landing && Boolean(cookie) && landingStatus === 200 && (index !== 0 || refreshStatus === 200), errorCode: payload.error?.code ?? null });
  }
  return results;
}

async function main() {
  const before = await inspect();
  const shouldRepair = process.argv.includes("--repair");
  const shouldVerifyHttp = process.argv.includes("--http-verify");
  const changed = shouldRepair ? await repair(before) : [];
  const after = shouldRepair ? await inspect() : before;
  const http = shouldVerifyHttp ? await verifyHttp() : undefined;
  console.log(JSON.stringify({ fingerprint: inspectDatabaseUrl(test, "test").fingerprint, directFingerprint: identity.fingerprint, mode: shouldRepair ? "repair" : shouldVerifyHttp ? "http-verify" : "inspect", changed, accounts: after, http }, null, 2));
}

main().finally(() => db.$disconnect());
