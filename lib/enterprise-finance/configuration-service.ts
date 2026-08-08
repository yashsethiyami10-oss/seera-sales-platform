import { NotFoundError, ConflictError } from "@/lib/errors";
import { requireVersion } from "@/lib/enterprise/context";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import { assertFinanceTransition, FINANCE_CONFIGURATION_TRANSITIONS } from "./domain";
import { financeConfigurationInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Wave 1) — organization-scoped
 * Finance Configuration. One row per organization (`organizationKey` is
 * `@unique`); "create" and "edit draft" are the same upsert-style write,
 * matching how `FinanceConfiguration.status` starts DRAFT and only becomes
 * ACTIVE through an explicit, separately-permissioned transition.
 */

export async function getFinanceConfiguration() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction((tx) =>
    tx.financeConfiguration.findUnique({ where: { organizationKey: principal.organizationKey } }));
}

export async function saveFinanceConfigurationDraft(input: unknown, expectedVersion?: number) {
  const data = financeConfigurationInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeConfiguration.findUnique({ where: { organizationKey: principal.organizationKey } });

    if (!current) {
      const created = await tx.financeConfiguration.create({
        data: { ...data, organizationKey: principal.organizationKey, status: "DRAFT", createdById: principal.id },
      });
      await recordEnterpriseMutation(tx, principal, {
        module: "enterprise_finance", action: "FINANCE_CONFIGURATION_CREATED",
        entityType: "FinanceConfiguration", entityId: created.id,
        description: "Finance configuration draft created",
        next: { status: created.status, baseCurrency: created.baseCurrency },
      });
      return created;
    }

    if (expectedVersion === undefined) throw new ConflictError("expectedVersion is required to update an existing configuration");
    requireVersion(current.version, expectedVersion);
    const updated = await tx.financeConfiguration.update({
      where: { id: current.id },
      data: { ...data, updatedById: principal.id, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_CONFIGURATION_UPDATED",
      entityType: "FinanceConfiguration", entityId: updated.id,
      description: "Finance configuration updated",
      previous: { version: current.version }, next: { version: updated.version },
    });
    return updated;
  });
}

export async function activateFinanceConfiguration(expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeConfiguration.findUnique({ where: { organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Finance configuration");
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "ACTIVE", FINANCE_CONFIGURATION_TRANSITIONS);

    const activated = await tx.financeConfiguration.update({
      where: { id: current.id },
      data: { status: "ACTIVE", updatedById: principal.id, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_CONFIGURATION_ACTIVATED",
      entityType: "FinanceConfiguration", entityId: activated.id,
      description: "Finance configuration activated",
      previous: { status: current.status }, next: { status: activated.status },
    });
    return activated;
  });
}
