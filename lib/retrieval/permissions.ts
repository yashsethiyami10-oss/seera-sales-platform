import { auth } from "@/lib/auth";
import type { CallerClearance, PermissionLayer } from "./types";

/**
 * "Permission Validation" (pipeline stage 2) — the caller's clearance is
 * always derived server-side from the real session, never accepted as a
 * client-supplied parameter. This is the single source of truth every
 * retrieval action and source fetcher calls before touching any content
 * model.
 *
 * Mirrors the exact tiering already established across Modules 1–4's own
 * RBAC checks: STAFF reaches PUBLIC+INTERNAL; only ADMIN reaches
 * CONFIDENTIAL; an unauthenticated or CUSTOMER-role caller is treated
 * identically to "public" — PUBLIC-layer, published-only, no exception.
 */
export async function resolveCallerClearance(): Promise<CallerClearance> {
  const session = await auth();
  const role = session?.user?.role;

  if (role === "ADMIN") return { role: "ADMIN", maxLayer: "CONFIDENTIAL", canAccessNonPublished: true };
  if (role === "STAFF") return { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true };
  if (role === "CUSTOMER") return { role: "CUSTOMER", maxLayer: "PUBLIC", canAccessNonPublished: false };
  return { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false };
}

const LAYER_RANK: Record<PermissionLayer, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2 };

/** "Filter by Layer A/B/C" (pipeline stage 6) — per-result check. */
export function layerAllowed(layer: PermissionLayer, clearance: CallerClearance): boolean {
  return LAYER_RANK[layer] <= LAYER_RANK[clearance.maxLayer];
}

/** The full set of layers a given clearance may see — used to build
 * Prisma `layer: { in: [...] }` filters directly, so a query never even
 * fetches a row it would have to discard afterward. */
export function allowedLayers(clearance: CallerClearance): PermissionLayer[] {
  return (["PUBLIC", "INTERNAL", "CONFIDENTIAL"] as const).filter((l) => layerAllowed(l, clearance));
}
