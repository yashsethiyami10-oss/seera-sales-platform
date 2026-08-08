import { AppError } from "@/lib/errors";
import type { EnterprisePrincipal, EnterpriseTx } from "@/lib/enterprise/context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 4 — the single
 * shared "which widgets can this user see" implementation. Factored out
 * of `widget-service.ts`'s `listWidgetsForCurrentUser` (Stage 1) BEFORE
 * Dashboard Layouts and Pinned Widgets were written, so all three widget
 * consumers (widget list, layouts, pins) validate against the exact same
 * ACTIVE + permission-authorized widget set — never a second widget
 * registry, per this Stage's explicit "Do not duplicate widget metadata
 * in a new registry" instruction.
 */

export async function getAuthorizedWidgetDefinitions(tx: EnterpriseTx, principal: EnterprisePrincipal) {
  const definitions = await tx.founderWidgetDefinition.findMany({ where: { status: "ACTIVE" }, orderBy: [{ defaultOrder: "asc" }] });
  return definitions.filter((widget) => !widget.requiredPermission || principal.isFounder || principal.permissions.has(widget.requiredPermission));
}

/** Throws if any code is deleted, inactive, or not authorized for this
 * user — the concrete enforcement behind "Reject deleted, unsupported,
 * or unauthorized widgets" / "A user must not be able to persist or
 * display a widget they lack permission to access." */
export async function assertWidgetCodesAuthorized(tx: EnterpriseTx, principal: EnterprisePrincipal, codes: string[]) {
  const authorized = await getAuthorizedWidgetDefinitions(tx, principal);
  const authorizedCodes = new Set(authorized.map((w) => w.code));
  for (const code of codes) {
    if (!authorizedCodes.has(code)) {
      throw new AppError(`Widget "${code}" does not exist, is not active, or is not authorized for this user`);
    }
  }
  return authorized;
}
