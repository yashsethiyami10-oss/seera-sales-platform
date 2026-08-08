import { getSalesPrincipal } from "@/lib/sales/authorization";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation).
 *
 * `lib/os-shell/current-user.ts` (Milestone 1) deliberately stayed
 * domain-agnostic — no Sales-specific dependency, because Milestone 1 had
 * zero permission-gated content for a permission set to mean anything for.
 * Milestone 2 changes that: real navigation entries (`registry/navigation.ts`)
 * now declare real `requiredPermission`s, and this codebase's one real
 * permission source is `lib/sales/authorization.ts`'s Sales principal
 * (the same system every action this milestone added is gated through —
 * see actions/customers.ts's own note on why a third auth system was never
 * introduced). This function is the bridge: it resolves the current user's
 * granted permission set for the Shell's nav filter, tolerating users who
 * have no active Sales role at all (a base STAFF/ADMIN account with no
 * SalesRole assigned) by returning an empty set rather than throwing —
 * they simply see no permission-gated nav entries, which is correct, not
 * an error.
 */
export async function getGrantedPermissions(): Promise<ReadonlySet<string>> {
  try {
    const principal = await getSalesPrincipal();
    if (principal.isFounder) {
      // Founder implicitly holds every permission (lib/sales/authorization.ts's
      // own rule) — reflected here as an actual superset rather than special-
      // casing "isFounder" again in the Shell's generic nav filter.
      const { PERMISSIONS } = await import("@/lib/sales/constants");
      return new Set(Object.values(PERMISSIONS));
    }
    return principal.permissions;
  } catch {
    return new Set();
  }
}
