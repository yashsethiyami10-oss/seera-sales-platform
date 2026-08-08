import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { requireVersion, type EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";
import {
  assertFinanceTransition, assertPostingEnabled,
  FINANCE_ACCOUNT_TRANSITIONS, wouldCreateHierarchyCycle,
} from "./domain";
import { financeAccountInput } from "./schemas";

/**
 * Enterprise Finance Platform (Part 3C, Wave 1) — Chart of Accounts.
 * Journal/ledger posting itself is Wave 2+; "deactivation safety" here can
 * only check for other Wave-1 references (the account being used as a
 * FinanceConfiguration control account, or having active children/postable
 * descendants) — once posted-activity exists, `assertDeactivationSafe`
 * gains that check without changing this function's call sites.
 */

async function assertDeactivationSafe(tx: EnterpriseTx, organizationKey: string, accountId: string) {
  const referencedByConfig = await tx.financeConfiguration.findFirst({
    where: {
      organizationKey,
      OR: [
        { retainedEarningsAccountId: accountId }, { arControlAccountId: accountId }, { apControlAccountId: accountId },
        { inputTaxControlAccountId: accountId }, { outputTaxControlAccountId: accountId }, { defaultCashAccountId: accountId },
        { defaultBankAccountId: accountId }, { roundingAccountId: accountId }, { defaultExpensePayableAccountId: accountId },
      ],
    },
  });
  if (referencedByConfig) throw new ConflictError("This account is referenced by the finance configuration and cannot be deactivated");
}

export async function createAccount(input: unknown) {
  const data = financeAccountInput.parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  // Not validated against CONVENTIONAL_NORMAL_BALANCE here — contra
  // accounts (e.g. Accumulated Depreciation, a CREDIT-balance ASSET) are
  // legitimate. The caller's declared value is recorded as an explicit
  // choice, never silently overwritten by the conventional default.

  return enterpriseTransaction(async (tx) => {
    let hierarchyLevel = 1;
    if (data.parentId) {
      const parent = await tx.financeAccount.findFirst({ where: { id: data.parentId, organizationKey: principal.organizationKey } });
      if (!parent) throw new AppError("Parent account must belong to the same organization", 422, "INVALID_PARENT");
      hierarchyLevel = parent.hierarchyLevel + 1;
    }
    const created = await tx.financeAccount.create({
      data: { ...data, organizationKey: principal.organizationKey, hierarchyLevel, createdById: principal.id },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_ACCOUNT_CREATED", entityType: "FinanceAccount", entityId: created.id,
      description: `Account ${created.accountCode} — ${created.name} created`,
      next: { accountCode: created.accountCode, category: created.category, normalBalance: created.normalBalance },
    });
    return created;
  });
}

export async function updateDraftAccount(accountId: string, expectedVersion: number, input: unknown) {
  const data = financeAccountInput.partial().omit({ accountCode: true, category: true }).parse(input);
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Account");
    requireVersion(current.version, expectedVersion);
    if (current.status !== "DRAFT") throw new ConflictError("Only draft accounts may be edited directly; activated accounts require a new version through governed correction");

    const updated = await tx.financeAccount.update({
      where: { id: current.id },
      data: { ...data, updatedById: principal.id, version: { increment: 1 } },
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_ACCOUNT_UPDATED", entityType: "FinanceAccount", entityId: updated.id,
      description: `Account ${updated.accountCode} updated`,
      previous: { version: current.version }, next: { version: updated.version },
    });
    return updated;
  });
}

export async function activateAccount(accountId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Account");
    requireVersion(current.version, expectedVersion);
    assertFinanceTransition(current.status, "ACTIVE", FINANCE_ACCOUNT_TRANSITIONS);

    const updated = await tx.financeAccount.update({ where: { id: current.id }, data: { status: "ACTIVE", updatedById: principal.id, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_ACCOUNT_ACTIVATED", entityType: "FinanceAccount", entityId: updated.id,
      description: `Account ${updated.accountCode} activated`,
      previous: { status: current.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function deactivateAccount(accountId: string, expectedVersion: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Account");
    requireVersion(current.version, expectedVersion);
    if (current.isSystemAccount) throw new ConflictError("System-required accounts cannot be deactivated");
    assertFinanceTransition(current.status, "INACTIVE", FINANCE_ACCOUNT_TRANSITIONS);
    await assertDeactivationSafe(tx, principal.organizationKey, current.id);

    const updated = await tx.financeAccount.update({ where: { id: current.id }, data: { status: "INACTIVE", updatedById: principal.id, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_ACCOUNT_DEACTIVATED", entityType: "FinanceAccount", entityId: updated.id,
      description: `Account ${updated.accountCode} deactivated`,
      previous: { status: current.status }, next: { status: updated.status },
    });
    return updated;
  });
}

export async function assignAccountParent(accountId: string, expectedVersion: number, parentId: string | null) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  if (parentId === accountId) throw new AppError("An account cannot be its own parent", 422, "SELF_PARENT");
  return enterpriseTransaction(async (tx) => {
    const current = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Account");
    requireVersion(current.version, expectedVersion);

    let hierarchyLevel = 1;
    if (parentId) {
      const parent = await tx.financeAccount.findFirst({ where: { id: parentId, organizationKey: principal.organizationKey } });
      if (!parent) throw new AppError("Parent account must belong to the same organization", 422, "INVALID_PARENT");
      const findChildren = async (nodeId: string) => {
        const children = await tx.financeAccount.findMany({ where: { organizationKey: principal.organizationKey, parentId: nodeId }, select: { id: true } });
        return children.map((row) => row.id);
      };
      if (await wouldCreateHierarchyCycle(findChildren, parentId, accountId)) throw new ConflictError("This would create a hierarchy cycle");
      hierarchyLevel = parent.hierarchyLevel + 1;
    }

    const updated = await tx.financeAccount.update({ where: { id: current.id }, data: { parentId, hierarchyLevel, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "FINANCE_ACCOUNT_REPARENTED", entityType: "FinanceAccount", entityId: updated.id,
      description: `Account ${updated.accountCode} reparented`,
      previous: { parentId: current.parentId }, next: { parentId: updated.parentId },
    });
    return updated;
  });
}

/** Summary accounts (accounts with children) cannot receive direct
 * postings even if `postingEnabled` is set — enforced here so Wave 2's
 * posting engine can call this one function rather than re-implementing
 * the rule. */
export async function validateAccountForPosting(accountId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const account = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!account) throw new NotFoundError("Account");
    assertPostingEnabled(account);
    const childCount = await tx.financeAccount.count({ where: { organizationKey: principal.organizationKey, parentId: account.id } });
    if (childCount > 0) throw new AppError("Summary accounts cannot receive direct postings", 422, "SUMMARY_ACCOUNT_NOT_POSTABLE");
    return account;
  });
}

export async function listAccountAncestors(accountId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const start = await tx.financeAccount.findFirst({ where: { id: accountId, organizationKey: principal.organizationKey } });
    if (!start) throw new NotFoundError("Account");
    const ancestors: (typeof start)[] = [];
    let parentId = start.parentId;
    while (parentId) {
      const parent = await tx.financeAccount.findFirst({ where: { id: parentId, organizationKey: principal.organizationKey } });
      if (!parent) break;
      ancestors.push(parent);
      parentId = parent.parentId;
    }
    return ancestors;
  });
}

export async function listAccountDescendants(accountId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const descendants: Awaited<ReturnType<typeof tx.financeAccount.findMany>> = [];
    const queue = [accountId];
    while (queue.length) {
      const parentId = queue.shift()!;
      const children = await tx.financeAccount.findMany({ where: { organizationKey: principal.organizationKey, parentId } });
      descendants.push(...children);
      queue.push(...children.map((child) => child.id));
    }
    return descendants;
  });
}

export async function exportChartOfAccounts() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const accounts = await tx.financeAccount.findMany({
      where: { organizationKey: principal.organizationKey },
      orderBy: [{ accountCode: "asc" }],
      take: 5000, // bounded export — Section 37 "no unbounded exports"
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_finance", action: "CHART_OF_ACCOUNTS_EXPORTED", entityType: "FinanceAccount", entityId: principal.organizationKey,
      description: `Chart of accounts exported (${accounts.length} accounts)`, notify: false,
    });
    return accounts;
  });
}
