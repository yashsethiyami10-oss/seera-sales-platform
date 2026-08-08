import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import { principalHasPermission, principalHasAnyPermission } from "@/lib/platform-core/authorization";
import type { PermissionKey } from "@/lib/platform-core/constants";
import type { AiPrincipal } from "./types";

const injectionPatterns = [
  /ignore (all|any|the) previous instructions/i, /reveal (the )?(system prompt|secret|api key|password)/i,
  /bypass (rbac|permission|approval|security)/i, /act as (root|administrator)/i,
  /access (another|other) organization/i, /execute (an )?unregistered tool/i,
];
const secretPatterns = [
  /postgres(?:ql)?:\/\/[^\s]+/gi, /\b(sk|pk|api)[-_][A-Za-z0-9_-]{16,}\b/g,
  /(?:password|token|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi,
];

export const correlationId = () => crypto.randomUUID();
export function sanitizeContext(value: unknown) {
  const raw = JSON.stringify(value);
  const sanitized = secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), raw);
  return JSON.parse(sanitized) as unknown;
}
export async function enforceAiPlatform(principal: AiPrincipal, requestText?: string) {
  const [platform, kill] = await Promise.all([
    prisma.aiConfiguration.findUnique({ where: { organizationKey_key: { organizationKey: principal.organizationKey, key: "AI_PLATFORM_ENABLED" } } }),
    prisma.aiConfiguration.findUnique({ where: { organizationKey_key: { organizationKey: principal.organizationKey, key: "AI_KILL_SWITCH" } } }),
  ]);
  if ((platform?.value as { enabled?: boolean })?.enabled !== true || (kill?.value as { enabled?: boolean })?.enabled === true) throw new AppError("MUV AI is currently unavailable", 503);
  if (requestText && injectionPatterns.some(pattern => pattern.test(requestText))) {
    const id = correlationId();
    await prisma.aiSecurityEvent.create({ data: { organizationKey: principal.organizationKey, userId: principal.id, eventType: "PROMPT_INJECTION_ATTEMPT", severity: "HIGH", component: "AI_SECURITY", correlationId: id, details: { blocked: true } } });
    await prisma.salesAuditLog.create({ data: { userId: principal.id, module: "muv_ai_security", action: "PROMPT_INJECTION_BLOCKED", newValue: { correlationId: id } } });
    throw new ForbiddenError("The request conflicts with MUV AI security policy");
  }
}
export async function rateLimit(principal: AiPrincipal) {
  const config = await prisma.aiConfiguration.findUnique({ where: { organizationKey_key: { organizationKey: principal.organizationKey, key: "RATE_LIMIT_POLICY" } } });
  const limit = Number((config?.value as { perUserPerMinute?: number })?.perUserPerMinute ?? 20);
  const since = new Date(Date.now() - 60_000);
  if (await prisma.aiTelemetry.count({ where: { userId: principal.id, metricType: "REQUEST", createdAt: { gte: since } } }) >= limit) throw new AppError("AI request rate limit reached", 429);
}
/**
 * MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part B.
 *
 * Both guards below used to re-implement the isFounder-bypass-or-
 * permission-set-membership check inline (a hand-written copy of the
 * centralized authorization logic, flagged as a CRITICAL finding in
 * Block 1/2). They now call lib/platform-core/authorization.ts's shared
 * principalHasPermission/principalHasAnyPermission — the exact same
 * predicates requirePermission/requireAnyPermission/hasPermission use —
 * so there is exactly one place this decision is made platform-wide.
 * Signatures are unchanged (still synchronous, still take an
 * already-resolved AiPrincipal) — every existing call site and the
 * existing narrow-permission-denial test keep working unmodified.
 */
export function requireAiPermission(principal: AiPrincipal, permission: PermissionKey) {
  if (!principalHasPermission(principal, permission)) throw new ForbiddenError();
}

/**
 * Enterprise UI Integration — Stage 3 route-integrity fix, extracted into
 * a named, independently testable guard. app/sales/ai/admin/page.tsx used
 * to only check "ai.operations.view" (view-level), while the nav link has
 * always required one of these three management permissions — a
 * view-only user could reach full AI registry/config data by direct URL.
 * Matches the same any-of-three shape as the nav's own gate.
 */
export function requireAiAdminPermission(principal: AiPrincipal) {
  const canManage = principalHasAnyPermission(principal, [
    "ai.prompts.manage", "ai.providers.manage", "ai.security.manage",
  ]);
  if (!canManage) throw new ForbiddenError();
}
export function validateOrganization(principal: AiPrincipal, organizationKey: string) {
  if (organizationKey !== principal.organizationKey) throw new ForbiddenError("Cross-organization access denied");
}
