import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_DASHBOARD, PERMISSIONS } from "@/lib/sales/constants";
import { isSafeInternalPath } from "@/lib/auth/safe-path";

export { isSafeInternalPath };

/**
 * MUV Enterprise UI — Stage 1 (Authentication and Role-Aware Entry).
 *
 * The one place a post-login destination is decided, for both the
 * credentials flow (`components/auth/login-form.tsx`, via the
 * `resolveLoginDestination` Server Action in `actions/auth.ts`) and the
 * OAuth flow (`app/(auth)/login/continue/page.tsx`, reached after
 * NextAuth completes Google/Apple sign-in) — one resolution function,
 * two callers, never two competing implementations of "where does this
 * person belong."
 *
 * Deliberately NOT a generic route-permission engine: `DESTINATION_RULES`
 * below only knows about route prefixes that actually exist today. A
 * future stage adding `/finance` or `/network` adds one entry each: an
 * unrecognized prefix is never trusted, it always falls back to the
 * role landing page — so this file never gets ahead of what's real.
 */

const DEFAULT_FALLBACK = "/access-denied";

type EntryContext = {
  userRole: "ADMIN" | "STAFF" | "CUSTOMER";
  hasActiveSalesRole: boolean;
  salesRoleName: string | null;
  isFounder: boolean;
  permissions: Set<string>;
  enabledFlags: Set<string>;
};

type DestinationRule = { prefix: string; allowed: (ctx: EntryContext) => boolean };

const ENTERPRISE_OPERATIONS_PERMISSIONS = [
  PERMISSIONS.ENTERPRISE_VENDOR_VIEW, PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW,
  PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, PERMISSIONS.ENTERPRISE_QUALITY_VIEW,
  PERMISSIONS.ENTERPRISE_WAREHOUSE_VIEW, PERMISSIONS.ENTERPRISE_PLANNING_VIEW,
  PERMISSIONS.ENTERPRISE_REPORTING_VIEW,
];
const NETWORK_PERMISSIONS = [
  PERMISSIONS.NETWORK_PARTNERS_VIEW, PERMISSIONS.NETWORK_AGREEMENTS_MANAGE,
  PERMISSIONS.NETWORK_CLAIMS_MANAGE, PERMISSIONS.NETWORK_PARTNERS_MANAGE, PERMISSIONS.NETWORK_ANALYTICS_VIEW,
];
const FINANCE_PERMISSIONS = [
  PERMISSIONS.FINANCE_MASTERS_VIEW, PERMISSIONS.FINANCE_RECEIVABLES_VIEW,
  PERMISSIONS.FINANCE_PAYABLES_VIEW, PERMISSIONS.FINANCE_EXPENSES_MANAGE, PERMISSIONS.FINANCE_REPORTS_VIEW,
];

function canReach(ctx: EntryContext, flag: string, permissions: PermissionKeyLike[]): boolean {
  return (
    ctx.hasActiveSalesRole &&
    ctx.enabledFlags.has(flag) &&
    (ctx.isFounder || permissions.some((key) => ctx.permissions.has(key)))
  );
}
type PermissionKeyLike = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

function canReachEnterpriseOperations(ctx: EntryContext): boolean {
  return canReach(ctx, "ENTERPRISE_OPERATIONS_ENABLED", ENTERPRISE_OPERATIONS_PERMISSIONS);
}
function canReachNetwork(ctx: EntryContext): boolean {
  return canReach(ctx, "ENTERPRISE_BUSINESS_NETWORK_ENABLED", NETWORK_PERMISSIONS);
}
function canReachFinance(ctx: EntryContext): boolean {
  return canReach(ctx, "ENTERPRISE_FINANCE_ENABLED", FINANCE_PERMISSIONS);
}

const DESTINATION_RULES: DestinationRule[] = [
  { prefix: "/admin", allowed: (ctx) => ctx.userRole === "ADMIN" || ctx.userRole === "STAFF" },
  { prefix: "/account", allowed: () => true },
  { prefix: "/dashboard", allowed: (ctx) => ctx.hasActiveSalesRole },
  { prefix: "/sales", allowed: (ctx) => ctx.hasActiveSalesRole },
  { prefix: "/enterprise", allowed: canReachEnterpriseOperations },
  { prefix: "/network", allowed: canReachNetwork },
  { prefix: "/finance", allowed: canReachFinance },
];

async function loadEntryContext(): Promise<EntryContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true, active: true,
      salesRole: { select: { name: true, active: true, permissions: { select: { permission: { select: { permissionKey: true } } } } } },
    },
  });
  if (!user || !user.active) return null;

  const hasActiveSalesRole = Boolean(user.salesRole?.active);
  const salesRoleName = hasActiveSalesRole ? user.salesRole!.name : null;
  const isFounder = salesRoleName === "Founder";
  const permissions = new Set(hasActiveSalesRole ? user.salesRole!.permissions.map((p) => p.permission.permissionKey) : []);

  const flagRows = await prisma.aiConfiguration.findMany({
    where: { organizationKey: "MUV", category: "FEATURE_FLAG", active: true },
    select: { key: true, value: true },
  });
  const enabledFlags = new Set(flagRows.filter((row) => Boolean((row.value as { enabled?: boolean }).enabled)).map((row) => row.key));

  return { userRole: user.role, hasActiveSalesRole, salesRoleName, isFounder, permissions, enabledFlags };
}

/**
 * Where an authenticated user lands with no (or an unusable) requested
 * destination. Never throws — every branch resolves to a real string,
 * with `/access-denied` as the one terminal fallback every path can
 * reach, so this can never loop.
 *
 * Priority matches the seeded reality that a single user can hold both
 * role systems at once (the seeded Founder account has `role: "ADMIN"`
 * *and* a Founder `SalesRole`): an active Sales role always wins over
 * the generic Admin/Staff flag, since it's the more specific identity —
 * a Founder belongs on their own Founder dashboard, not the generic
 * Commerce/CMS admin overview.
 */
export async function resolveRoleLandingPath(preloaded?: EntryContext | null): Promise<string> {
  const ctx = preloaded === undefined ? await loadEntryContext() : preloaded;
  if (!ctx) return DEFAULT_FALLBACK;

  if (ctx.hasActiveSalesRole) {
    const namedDashboard = ctx.salesRoleName ? ROLE_DASHBOARD[ctx.salesRoleName] : undefined;
    if (namedDashboard) return namedDashboard;
    // A real, active sales role with no named dashboard entry (e.g. a
    // role scoped only to Enterprise Operations, Business Network, or
    // Enterprise Finance) — offer the richest thing they can actually
    // reach today rather than a bare "insufficient role" message, since
    // they do have real access.
    if (canReachEnterpriseOperations(ctx)) return "/enterprise";
    if (canReachNetwork(ctx)) return "/network";
    if (canReachFinance(ctx)) return "/finance";
    return "/sales";
  }
  if (ctx.userRole === "ADMIN" || ctx.userRole === "STAFF") return "/admin";
  if (ctx.userRole === "CUSTOMER") return "/account";
  return DEFAULT_FALLBACK;
}

/**
 * The main entry point. `requestedCallback` is untrusted client input
 * (a query-string value). Returns a destination that is *always* either
 * the validated, authorized callback, or a safe fallback — never the
 * raw input, and never a throw.
 */
export async function resolveAuthorizedDestination(requestedCallback: unknown): Promise<string> {
  const ctx = await loadEntryContext();
  if (!ctx) return "/login";

  if (isSafeInternalPath(requestedCallback)) {
    const rule = DESTINATION_RULES.find((r) => requestedCallback === r.prefix || requestedCallback.startsWith(`${r.prefix}/`));
    if (rule && rule.allowed(ctx)) return requestedCallback;
    // Recognized prefix but not authorized for it, or an unrecognized
    // prefix entirely (including a route this policy doesn't know about
    // yet) — per Stage 1's own rule, silently ignore the callback and
    // use the role landing page rather than bouncing them to a
    // destination that will just reject them again.
  }
  return resolveRoleLandingPath(ctx);
}
