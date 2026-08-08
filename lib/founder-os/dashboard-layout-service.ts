import type { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import type { EnterpriseTx, EnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { dashboardLayoutCreateInput, dashboardLayoutUpdateInput } from "./schemas";
import { assertWidgetCodesAuthorized } from "./widget-catalogue";
import { WORKSPACE_LIMITS } from "./domain";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 4 — Dashboard
 * Layouts. A layout is a named, ordered arrangement of the Stage 1
 * widget catalogue — `widgets` is a JSON array of
 * `{ widgetCode, order, section?, width?, height?, visible }`, validated
 * on every write against `widget-catalogue.ts`'s `assertWidgetCodesAuthorized`
 * (the same authorization check `listWidgetsForCurrentUser` itself uses)
 * so a layout can never reference a deleted, inactive, or unauthorized
 * widget. No widget metadata (name/category/description) is duplicated
 * into the layout — only the widget's `code` and this layout's own
 * placement fields.
 */

async function requireOwnedLayout(tx: EnterpriseTx, principal: EnterprisePrincipal, id: string) {
  const layout = await tx.founderDashboardLayout.findFirst({ where: { id, organizationKey: principal.organizationKey, ownerId: principal.id } });
  if (!layout) throw new NotFoundError("Dashboard layout");
  return layout;
}

export async function listDashboardLayouts() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction((tx) => tx.founderDashboardLayout.findMany({
    where: { organizationKey: principal.organizationKey, ownerId: principal.id },
    orderBy: [{ createdAt: "desc" }],
  }));
}

export async function createDashboardLayout(input: unknown) {
  const data = dashboardLayoutCreateInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    await assertWidgetCodesAuthorized(tx, principal, data.widgets.map((w) => w.widgetCode));

    const count = await tx.founderDashboardLayout.count({ where: { organizationKey: principal.organizationKey, ownerId: principal.id } });
    if (count >= WORKSPACE_LIMITS.maxDashboardLayoutsPerOwner) throw new AppError("Maximum number of dashboard layouts reached");

    if (data.isActive) {
      await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isActive: true }, data: { isActive: false } });
    }
    if (data.isDefault) {
      await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isDefault: true }, data: { isDefault: false } });
    }

    return tx.founderDashboardLayout.create({
      data: {
        organizationKey: principal.organizationKey, ownerId: principal.id, name: data.name,
        widgets: data.widgets as Prisma.InputJsonValue, isActive: data.isActive, isDefault: data.isDefault,
      },
    });
  });
}

export async function updateDashboardLayout(input: unknown) {
  const data = dashboardLayoutUpdateInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    const layout = await requireOwnedLayout(tx, principal, data.id);
    if (data.widgets) await assertWidgetCodesAuthorized(tx, principal, data.widgets.map((w) => w.widgetCode));

    if (data.isActive) {
      await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isActive: true, id: { not: layout.id } }, data: { isActive: false } });
    }
    if (data.isDefault) {
      await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isDefault: true, id: { not: layout.id } }, data: { isDefault: false } });
    }

    return tx.founderDashboardLayout.update({
      where: { id: layout.id },
      data: {
        name: data.name ?? undefined,
        widgets: (data.widgets as Prisma.InputJsonValue | undefined) ?? undefined,
        isActive: data.isActive ?? undefined,
        isDefault: data.isDefault ?? undefined,
      },
    });
  });
}

/** Atomic "make this the one active layout" — same unset-then-set
 * sequence as Saved Views' `setDefaultSavedView`, backed by the
 * `founder_dashboard_layouts_one_active_per_owner` partial unique index. */
export async function activateDashboardLayout(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const layout = await requireOwnedLayout(tx, principal, id);
    await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isActive: true }, data: { isActive: false } });
    return tx.founderDashboardLayout.update({ where: { id: layout.id }, data: { isActive: true } });
  });
}

export async function setDefaultDashboardLayout(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const layout = await requireOwnedLayout(tx, principal, id);
    await tx.founderDashboardLayout.updateMany({ where: { organizationKey: principal.organizationKey, ownerId: principal.id, isDefault: true }, data: { isDefault: false } });
    return tx.founderDashboardLayout.update({ where: { id: layout.id }, data: { isDefault: true } });
  });
}

export async function deleteDashboardLayout(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const layout = await requireOwnedLayout(tx, principal, id);
    await tx.founderDashboardLayout.delete({ where: { id: layout.id } });
    return { deleted: true, id: layout.id };
  });
}

/** "Reset to system default": deactivates every custom layout this owner
 * has (never deletes them — a reset is not a destructive action), so
 * `listWidgetsForCurrentUser` falls back to each widget's own
 * `defaultVisible`/`defaultOrder` (Stage 1's real system default) —
 * reusing that existing fallback rather than fabricating a second
 * "system default layout" row. */
export async function resetDashboardLayoutToSystemDefault() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const result = await tx.founderDashboardLayout.updateMany({
      where: { organizationKey: principal.organizationKey, ownerId: principal.id, OR: [{ isActive: true }, { isDefault: true }] },
      data: { isActive: false, isDefault: false },
    });
    return { reset: true, layoutsAffected: result.count };
  });
}
