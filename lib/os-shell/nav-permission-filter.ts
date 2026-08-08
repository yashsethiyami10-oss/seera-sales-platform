import type { NavManifestEntry } from "@/components/os-shell/registry/navigation";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Navigation System /
 * "Permission-aware rendering".
 *
 * Generalizes the exact filter rule `lib/sales/navigation.ts`'s
 * `getSalesNavigation()` already uses in production
 * (`!item.any || item.any.some((key) => principal.permissions.has(key))`)
 * into a domain-agnostic form the platform layer can use for any future
 * App's navigation, not just Sales.
 *
 * Manifest Architecture §3 requires navigation visibility to be
 * "expressible entirely through declared references" — never logic an App
 * computes itself — which is exactly what this being a single, pure,
 * platform-owned function (rather than each App filtering its own entries)
 * guarantees.
 */
export function filterNavByPermission(
  entries: readonly NavManifestEntry[],
  grantedPermissions: ReadonlySet<string>
): NavManifestEntry[] {
  return entries.filter((entry) => !entry.requiredPermission || grantedPermissions.has(entry.requiredPermission));
}
