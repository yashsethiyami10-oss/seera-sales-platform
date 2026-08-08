import type { Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { workspacePreferenceInput } from "./schemas";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 4 — Workspace
 * Preferences. One row per (organization, user) — a genuinely new set of
 * fields, none of which duplicate anything already on `User` (checked:
 * `User` has no timezone/density/page-size/landing-page columns). A
 * `defaultDashboardLayoutId` is validated to be one of the same owner's
 * own layouts — a Founder cannot point their preference at another
 * user's layout id even though the row itself is stored as a plain
 * string, not a Prisma-level constraint away from it.
 */

export async function getMyWorkspacePreferences() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  return enterpriseTransaction((tx) => tx.founderWorkspacePreference.findUnique({
    where: { organizationKey_userId: { organizationKey: principal.organizationKey, userId: principal.id } },
  }));
}

export async function updateMyWorkspacePreferences(input: unknown) {
  const data = workspacePreferenceInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_WORKSPACE_MANAGE);

  return enterpriseTransaction(async (tx) => {
    if (data.defaultDashboardLayoutId) {
      const layout = await tx.founderDashboardLayout.findFirst({
        where: { id: data.defaultDashboardLayoutId, organizationKey: principal.organizationKey, ownerId: principal.id },
      });
      if (!layout) throw new NotFoundError("Dashboard layout");
    }

    return tx.founderWorkspacePreference.upsert({
      where: { organizationKey_userId: { organizationKey: principal.organizationKey, userId: principal.id } },
      update: {
        defaultDashboardLayoutId: data.defaultDashboardLayoutId ?? undefined,
        defaultLandingSurface: data.defaultLandingSurface ?? undefined,
        defaultDateRange: data.defaultDateRange ?? undefined,
        defaultComparisonMode: data.defaultComparisonMode ?? undefined,
        displayDensity: data.displayDensity ?? undefined,
        tablePageSize: data.tablePageSize ?? undefined,
        timezone: data.timezone ?? undefined,
        notificationDisplayPreferences: (data.notificationDisplayPreferences as Prisma.InputJsonValue | undefined) ?? undefined,
      },
      create: {
        organizationKey: principal.organizationKey, userId: principal.id,
        defaultDashboardLayoutId: data.defaultDashboardLayoutId, defaultLandingSurface: data.defaultLandingSurface,
        defaultDateRange: data.defaultDateRange, defaultComparisonMode: data.defaultComparisonMode,
        displayDensity: data.displayDensity, tablePageSize: data.tablePageSize, timezone: data.timezone,
        notificationDisplayPreferences: data.notificationDisplayPreferences as Prisma.InputJsonValue | undefined,
      },
    });
  });
}
