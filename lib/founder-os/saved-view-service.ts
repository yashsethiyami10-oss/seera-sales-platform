import type { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import type { EnterpriseTx, EnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { savedViewCreateInput, savedViewUpdateInput } from "./schemas";
import { SURFACE_FILTERABLE_FIELDS, WORKSPACE_LIMITS, type WorkspaceSurface } from "./domain";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 4 — Saved Views.
 * A Saved View never stores a query, only a structured description of
 * one (surface + filters + sort + date range + display mode) — every
 * read of a saved view's *data* still goes through the real Stage 1-3
 * surface service; this file only persists/validates the description.
 *
 * Ownership is enforced by scoping every read/write to
 * `ownerId: principal.id` — including for the Founder role itself
 * (`isFounder` bypasses the *permission* check inside
 * `requireFounderOsPrincipal`, never the ownership scope here; two
 * different Founder-role accounts must not see each other's saved views).
 */

type FilterCondition = { field: string; operator: string; value: unknown };

function assertFieldsSupported(surface: WorkspaceSurface, filters: FilterCondition[] | undefined) {
  if (!filters || filters.length === 0) return;
  const allowed = new Set(SURFACE_FILTERABLE_FIELDS[surface]);
  for (const condition of filters) {
    if (!allowed.has(condition.field)) {
      throw new AppError(`"${condition.field}" is not a filterable field for surface ${surface}`);
    }
  }
}

async function requireOwnedSavedView(tx: EnterpriseTx, principal: EnterprisePrincipal, id: string) {
  const view = await tx.founderSavedView.findFirst({ where: { id, organizationKey: principal.organizationKey, ownerId: principal.id } });
  if (!view) throw new NotFoundError("Saved view");
  return view;
}

export async function listSavedViews(surface?: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction((tx) => tx.founderSavedView.findMany({
    where: { organizationKey: principal.organizationKey, ownerId: principal.id, surface: surface ?? undefined },
    orderBy: [{ surface: "asc" }, { createdAt: "desc" }],
  }));
}

export async function createSavedView(input: unknown) {
  const data = savedViewCreateInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  assertFieldsSupported(data.surface, data.filters);

  return enterpriseTransaction(async (tx) => {
    const count = await tx.founderSavedView.count({ where: { organizationKey: principal.organizationKey, ownerId: principal.id } });
    if (count >= WORKSPACE_LIMITS.maxSavedViewsPerOwner) throw new AppError("Maximum number of saved views reached");

    if (data.isDefault) {
      await tx.founderSavedView.updateMany({
        where: { organizationKey: principal.organizationKey, ownerId: principal.id, surface: data.surface, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.founderSavedView.create({
      data: {
        organizationKey: principal.organizationKey, ownerId: principal.id, surface: data.surface,
        name: data.name, description: data.description, filters: data.filters as Prisma.InputJsonValue,
        sortBy: data.sortBy, sortDirection: data.sortDirection,
        dateRangeFrom: data.dateRangeFrom, dateRangeTo: data.dateRangeTo,
        displayMode: data.displayMode, isDefault: data.isDefault,
      },
    });
  });
}

export async function updateSavedView(input: unknown) {
  const data = savedViewUpdateInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    const view = await requireOwnedSavedView(tx, principal, data.id);
    if (data.filters) assertFieldsSupported(view.surface as WorkspaceSurface, data.filters);

    if (data.isDefault) {
      await tx.founderSavedView.updateMany({
        where: { organizationKey: principal.organizationKey, ownerId: principal.id, surface: view.surface, isDefault: true, id: { not: view.id } },
        data: { isDefault: false },
      });
    }

    return tx.founderSavedView.update({
      where: { id: view.id },
      data: {
        name: data.name ?? undefined, description: data.description ?? undefined,
        filters: (data.filters as Prisma.InputJsonValue | undefined) ?? undefined,
        sortBy: data.sortBy ?? undefined, sortDirection: data.sortDirection ?? undefined,
        dateRangeFrom: data.dateRangeFrom ?? undefined, dateRangeTo: data.dateRangeTo ?? undefined,
        displayMode: data.displayMode ?? undefined, isDefault: data.isDefault ?? undefined,
      },
    });
  });
}

/** Dedicated, atomic default-switching entry point — the sequence (unset
 * every other default for this owner+surface, then set this one) runs as
 * two statements inside one Serializable transaction, backed by the
 * `founder_saved_views_one_default_per_owner_surface` partial unique
 * index as a hard guarantee against a concurrent request doing the same
 * thing. */
export async function setDefaultSavedView(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const view = await requireOwnedSavedView(tx, principal, id);
    await tx.founderSavedView.updateMany({
      where: { organizationKey: principal.organizationKey, ownerId: principal.id, surface: view.surface, isDefault: true },
      data: { isDefault: false },
    });
    return tx.founderSavedView.update({ where: { id: view.id }, data: { isDefault: true } });
  });
}

export async function deleteSavedView(id: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const view = await requireOwnedSavedView(tx, principal, id);
    await tx.founderSavedView.delete({ where: { id: view.id } });
    return { deleted: true, id: view.id };
  });
}
