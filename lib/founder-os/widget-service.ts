import type { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { widgetPreferenceInput, widgetPinInput, pinnedReorderInput } from "./schemas";
import { getAuthorizedWidgetDefinitions, assertWidgetCodesAuthorized } from "./widget-catalogue";
import { WORKSPACE_LIMITS } from "./domain";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Founder Widget
 * Framework. `FounderWidgetDefinition` is the registry (seeded, one row
 * per available widget); `FounderWidgetPreference` is a per-user,
 * per-organization override of visibility/order/settings — a user with no
 * preference row for a given widget simply sees that widget's own default
 * (`defaultVisible`/`defaultOrder`), which is how "future personalization"
 * is supported without requiring every user to have an explicit row for
 * every widget that ever gets added.
 *
 * Stage 4 adds Pinned Widgets directly onto this same
 * `FounderWidgetPreference` row (see `schema.prisma`'s `pinned`/
 * `pinnedOrder` columns) — no second widget system.
 */

export async function listWidgetsForCurrentUser() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction(async (tx) => {
    const [definitions, preferences] = await Promise.all([
      getAuthorizedWidgetDefinitions(tx, principal),
      tx.founderWidgetPreference.findMany({ where: { organizationKey: principal.organizationKey, userId: principal.id } }),
    ]);
    const preferenceByWidgetId = new Map(preferences.map((p) => [p.widgetId, p]));
    return definitions
      .map((widget) => {
        const preference = preferenceByWidgetId.get(widget.id);
        return {
          code: widget.code, name: widget.name, category: widget.category, description: widget.description,
          visible: preference?.visible ?? widget.defaultVisible,
          sortOrder: preference?.sortOrder ?? widget.defaultOrder,
          settings: preference?.settings ?? null,
          pinned: preference?.pinned ?? false,
          pinnedOrder: preference?.pinnedOrder ?? null,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });
}

export async function setWidgetPreference(input: unknown) {
  const data = widgetPreferenceInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WIDGETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const widget = await tx.founderWidgetDefinition.findUnique({ where: { code: data.widgetCode } });
    if (!widget) throw new NotFoundError("Widget");
    // Independent Audit finding F1: this write path did not enforce
    // widget authorization the way pinWidget/createDashboardLayout do,
    // letting a caller persist a preference row for a widget whose
    // requiredPermission they lack. No prior exposure resulted (listWidgetsForCurrentUser
    // independently filters unauthorized widgets out at the definitions
    // level), but the same boundary should be enforced once, at every
    // write path into this table, not left to agree by coincidence.
    // Existence was already confirmed above (preserving the specific
    // NotFoundError contract callers depend on), so this call only ever
    // exercises its "not active / not authorized" branch here.
    await assertWidgetCodesAuthorized(tx, principal, [data.widgetCode]);
    return tx.founderWidgetPreference.upsert({
      where: { organizationKey_userId_widgetId: { organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id } },
      update: {
        visible: data.visible ?? undefined,
        sortOrder: data.sortOrder ?? undefined,
        settings: (data.settings as Prisma.InputJsonValue | undefined) ?? undefined,
      },
      create: {
        organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id,
        visible: data.visible ?? widget.defaultVisible, sortOrder: data.sortOrder ?? widget.defaultOrder,
        settings: data.settings as Prisma.InputJsonValue | undefined,
      },
    });
  });
}

// ---------------------------------------------------------------------
// Part 3D, Stage 4 — Pinned Widgets
// ---------------------------------------------------------------------

export async function listPinnedWidgets() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction(async (tx) => {
    const pinned = await tx.founderWidgetPreference.findMany({
      where: { organizationKey: principal.organizationKey, userId: principal.id, pinned: true },
      include: { widget: true },
      orderBy: [{ pinnedOrder: "asc" }],
    });
    return pinned
      .filter((p) => p.widget.status === "ACTIVE" && (!p.widget.requiredPermission || principal.isFounder || principal.permissions.has(p.widget.requiredPermission)))
      .map((p) => ({ code: p.widget.code, name: p.widget.name, category: p.widget.category, pinnedOrder: p.pinnedOrder }));
  });
}

export async function pinWidget(input: unknown) {
  const data = widgetPinInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    await assertWidgetCodesAuthorized(tx, principal, [data.widgetCode]);
    const widget = await tx.founderWidgetDefinition.findUniqueOrThrow({ where: { code: data.widgetCode } });

    const existing = await tx.founderWidgetPreference.findUnique({
      where: { organizationKey_userId_widgetId: { organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id } },
    });
    if (existing?.pinned) return existing; // idempotent — already pinned, not a duplicate

    const pinnedCount = await tx.founderWidgetPreference.count({ where: { organizationKey: principal.organizationKey, userId: principal.id, pinned: true } });
    if (pinnedCount >= WORKSPACE_LIMITS.maxPinnedWidgets) {
      throw new AppError(`Cannot pin more than ${WORKSPACE_LIMITS.maxPinnedWidgets} widgets`);
    }

    return tx.founderWidgetPreference.upsert({
      where: { organizationKey_userId_widgetId: { organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id } },
      update: { pinned: true, pinnedOrder: pinnedCount },
      create: {
        organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id,
        visible: widget.defaultVisible, sortOrder: widget.defaultOrder, pinned: true, pinnedOrder: pinnedCount,
      },
    });
  });
}

export async function unpinWidget(input: unknown) {
  const data = widgetPinInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const widget = await tx.founderWidgetDefinition.findUnique({ where: { code: data.widgetCode } });
    if (!widget) throw new NotFoundError("Widget");
    const existing = await tx.founderWidgetPreference.findUnique({
      where: { organizationKey_userId_widgetId: { organizationKey: principal.organizationKey, userId: principal.id, widgetId: widget.id } },
    });
    if (!existing?.pinned) return existing; // idempotent — already unpinned
    return tx.founderWidgetPreference.update({ where: { id: existing.id }, data: { pinned: false, pinnedOrder: null } });
  });
}

export async function reorderPinnedWidgets(input: unknown) {
  const data = pinnedReorderInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const pinned = await tx.founderWidgetPreference.findMany({
      where: { organizationKey: principal.organizationKey, userId: principal.id, pinned: true },
      include: { widget: true },
    });
    const rowByCode = new Map(pinned.map((p) => [p.widget.code, p]));
    if (data.widgetCodes.length !== pinned.length || !data.widgetCodes.every((code) => rowByCode.has(code))) {
      throw new AppError("Reorder list must contain exactly the currently pinned widgets, each once");
    }
    await Promise.all(data.widgetCodes.map((code, index) => {
      const row = rowByCode.get(code)!;
      return tx.founderWidgetPreference.update({ where: { id: row.id }, data: { pinnedOrder: index } });
    }));
    return data.widgetCodes.map((code, index) => ({ code, pinnedOrder: index }));
  });
}
