import type { getSalesPrincipal } from "@/lib/sales/authorization";
import type { PermissionKey } from "@/lib/sales/constants";

type Principal = Awaited<ReturnType<typeof getSalesPrincipal>>;

/**
 * Institutional Sales OS list scoping, shared by every list action (leads,
 * opportunities, quotations, samples, follow-ups, tasks): Founder or anyone
 * holding the domain's `*.view_all` permission sees every record; everyone
 * else is restricted to records assigned to them. Returns a Prisma `where`
 * fragment to spread into the caller's own filters — never a full query, so
 * each action stays in control of its own shape.
 */
export function assignedScopeWhere(principal: Principal, viewAllKey: PermissionKey, assignedField: string): Record<string, unknown> {
  if (principal.isFounder || principal.permissions.has(viewAllKey)) return {};
  return { [assignedField]: principal.id };
}
