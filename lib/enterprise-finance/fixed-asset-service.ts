import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";

/**
 * Milestone 8 — Fixed Assets / Depreciation. Straight-line only for this
 * pass (the approved minimum) — depreciationMethod is a plain governed
 * string on both FinanceAssetCategory and FinanceFixedAsset, matching this
 * codebase's existing "governed string, not a hardcoded enum" convention
 * throughout Part 3C, so declining-balance/units-of-production can be added
 * later without a schema change, only new branches in
 * computeStraightLineSchedule's caller.
 */

const assetCategoryInput = z.object({
  code: z.string().min(2).max(30), name: z.string().min(2).max(160), defaultUsefulLifeMonths: z.number().int().positive(),
  assetAccountCode: z.string(), depreciationExpenseAccountCode: z.string(), accumulatedDepreciationAccountCode: z.string(),
});

export async function createAssetCategory(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_ASSETS_MANAGE);
  const data = assetCategoryInput.parse(input);
  const [assetAccount, depAccount, accumAccount] = await Promise.all([
    prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: data.assetAccountCode, status: "ACTIVE" } }),
    prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: data.depreciationExpenseAccountCode, status: "ACTIVE" } }),
    prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: data.accumulatedDepreciationAccountCode, status: "ACTIVE" } }),
  ]);
  if (!assetAccount || !depAccount || !accumAccount) throw new AppError("One or more configured accounts do not exist or are inactive");
  return prisma.financeAssetCategory.create({
    data: {
      organizationKey: principal.organizationKey, code: data.code, name: data.name, defaultUsefulLifeMonths: data.defaultUsefulLifeMonths,
      assetAccountId: assetAccount.id, depreciationExpenseAccountId: depAccount.id, accumulatedDepreciationAccountId: accumAccount.id, createdById: principal.id,
    },
  });
}

const assetInput = z.object({
  assetCode: z.string().min(2).max(60), name: z.string().min(2).max(200), categoryId: z.string().cuid(),
  acquisitionDate: z.coerce.date(), cost: z.coerce.number().positive(), salvageValue: z.coerce.number().nonnegative().default(0),
  usefulLifeMonths: z.number().int().positive().optional(), locationText: z.string().max(200).optional(),
  custodianId: z.string().cuid().optional(), costCenterId: z.string().cuid().optional(), supportingDocumentRef: z.string().max(300).optional(),
});

/** Acquires and immediately capitalizes an asset — Dr Fixed Assets, Cr Accounts Payable (acquired on account; a direct-cash acquisition posts a corresponding Cash Voucher/payment separately, never merged into this one journal). */
export async function acquireAsset(input: unknown, apAccountCode = "2000") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_ASSETS_MANAGE);
  const data = assetInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const category = await tx.financeAssetCategory.findFirst({ where: { id: data.categoryId, organizationKey: principal.organizationKey } });
    if (!category) throw new NotFoundError("Asset category");
    const usefulLifeMonths = data.usefulLifeMonths ?? category.defaultUsefulLifeMonths;
    const apAccount = await tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: apAccountCode, status: "ACTIVE" } });
    if (!apAccount) throw new AppError("Accounts Payable control account is not configured");

    const assetCode = data.assetCode;
    const cost = new Prisma.Decimal(data.cost);
    const asset = await tx.financeFixedAsset.create({
      data: {
        organizationKey: principal.organizationKey, assetCode, name: data.name, categoryId: data.categoryId,
        acquisitionDate: data.acquisitionDate, capitalizationDate: data.acquisitionDate, cost, salvageValue: data.salvageValue,
        usefulLifeMonths, locationText: data.locationText, custodianId: data.custodianId, costCenterId: data.costCenterId,
        supportingDocumentRef: data.supportingDocumentRef, status: "CAPITALIZED", netBookValue: cost, createdById: principal.id,
      },
    });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "FIXED_ASSET_CAPITALIZATION", postingDate: data.acquisitionDate, description: `Asset ${assetCode} acquired and capitalized`,
      sourceType: "FinanceFixedAsset", sourceId: asset.id, idempotencyKey: `finance_fixed_asset:ACQUIRE:${asset.id}`,
      lines: [
        { accountId: category.assetAccountId, debitAmount: cost, creditAmount: new Prisma.Decimal(0) },
        { accountId: apAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: cost },
      ],
    });
    const updated = await tx.financeFixedAsset.update({ where: { id: asset.id }, data: { acquisitionJournalId: journal.id } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "ASSET_CAPITALIZED", entityType: "FinanceFixedAsset", entityId: asset.id, description: `Asset ${assetCode} capitalized at ${cost.toString()}` });

    // Straight-line depreciation schedule across every remaining open
    // fiscal period within the asset's useful life — planned, not posted;
    // each period's entry is posted independently at month-end close.
    const depreciableBase = cost.minus(data.salvageValue);
    const periods = await tx.financeFiscalPeriod.findMany({ where: { organizationKey: principal.organizationKey, startDate: { gte: data.acquisitionDate } }, orderBy: { startDate: "asc" }, take: Math.ceil(usefulLifeMonths) });
    if (periods.length > 0 && depreciableBase.greaterThan(0)) {
      const monthlyAmount = depreciableBase.dividedBy(usefulLifeMonths);
      for (const period of periods) {
        await tx.financeDepreciationEntry.create({ data: { organizationKey: principal.organizationKey, assetId: asset.id, fiscalPeriodId: period.id, plannedAmount: monthlyAmount, status: "PLANNED" } });
      }
    }
    return updated;
  });
}

/** Posts one period's already-scheduled depreciation entry: Dr Depreciation Expense, Cr Accumulated Depreciation. */
export async function postDepreciationEntry(entryId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_DEPRECIATION_POST);
  return enterpriseTransaction(async (tx) => {
    const entry = await tx.financeDepreciationEntry.findFirst({ where: { id: entryId, organizationKey: principal.organizationKey } });
    if (!entry) throw new NotFoundError("Depreciation entry");
    if (entry.status !== "PLANNED") throw new AppError("Only a planned depreciation entry can be posted", 409, "INVALID_TRANSITION");
    const asset = await tx.financeFixedAsset.findUniqueOrThrow({ where: { id: entry.assetId } });
    const category = await tx.financeAssetCategory.findUniqueOrThrow({ where: { id: asset.categoryId } });
    const period = await tx.financeFiscalPeriod.findUniqueOrThrow({ where: { id: entry.fiscalPeriodId } });

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "DEPRECIATION", postingDate: period.endDate, description: `Depreciation ${asset.assetCode}: ${period.name}`,
      sourceType: "FinanceDepreciationEntry", sourceId: entry.id, idempotencyKey: `finance_depreciation:POST:${entry.id}`,
      lines: [
        { accountId: category.depreciationExpenseAccountId, debitAmount: entry.plannedAmount, creditAmount: new Prisma.Decimal(0) },
        { accountId: category.accumulatedDepreciationAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: entry.plannedAmount },
      ],
    });
    const updatedEntry = await tx.financeDepreciationEntry.update({ where: { id: entryId }, data: { status: "POSTED", postedAmount: entry.plannedAmount, journalId: journal.id, postedById: principal.id, postedAt: new Date() } });
    await tx.financeFixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: { increment: entry.plannedAmount }, netBookValue: { decrement: entry.plannedAmount }, version: { increment: 1 } } });
    return updatedEntry;
  });
}

export async function transferAsset(assetId: string, input: { toCostCenterId?: string; reason?: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_ASSETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const asset = await tx.financeFixedAsset.findFirst({ where: { id: assetId, organizationKey: principal.organizationKey } });
    if (!asset) throw new NotFoundError("Fixed asset");
    await tx.financeAssetTransfer.create({ data: { organizationKey: principal.organizationKey, assetId, fromCostCenterId: asset.costCenterId, toCostCenterId: input.toCostCenterId, transferDate: new Date(), reason: input.reason, transferredById: principal.id } });
    return tx.financeFixedAsset.update({ where: { id: assetId }, data: { costCenterId: input.toCostCenterId, version: { increment: 1 } } });
  });
}

/** Dr Accumulated Depreciation + Cr Fixed Assets (removes the asset at cost); gain/loss (proceeds - NBV) posts to a gain/loss line on the same journal. */
export async function disposeAsset(assetId: string, input: { disposalDate: Date; proceeds: number; reason?: string }, gainLossAccountCode = "6000") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_ASSETS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const asset = await tx.financeFixedAsset.findFirst({ where: { id: assetId, organizationKey: principal.organizationKey } });
    if (!asset) throw new NotFoundError("Fixed asset");
    if (asset.status !== "CAPITALIZED") throw new AppError("Only a capitalized asset can be disposed", 409, "INVALID_TRANSITION");
    const category = await tx.financeAssetCategory.findUniqueOrThrow({ where: { id: asset.categoryId } });
    const gainLossAccount = await tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: gainLossAccountCode, status: "ACTIVE" } });
    if (!gainLossAccount) throw new AppError("Gain/loss on disposal account is not configured");

    const proceeds = new Prisma.Decimal(input.proceeds);
    const netBookValueAtDisposal = asset.netBookValue;
    const gainLoss = proceeds.minus(netBookValueAtDisposal);

    const lines = [
      { accountId: category.accumulatedDepreciationAccountId, debitAmount: asset.accumulatedDepreciation, creditAmount: new Prisma.Decimal(0) },
      { accountId: category.assetAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: asset.cost },
    ];
    if (gainLoss.isNegative()) lines.push({ accountId: gainLossAccount.id, debitAmount: gainLoss.abs(), creditAmount: new Prisma.Decimal(0) });
    else if (gainLoss.isPositive()) lines.push({ accountId: gainLossAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: gainLoss });

    const disposalRecord = await tx.financeAssetDisposal.create({
      data: { organizationKey: principal.organizationKey, assetId, disposalDate: input.disposalDate, proceeds, netBookValueAtDisposal, gainLoss, reason: input.reason, approvedById: principal.id, createdById: principal.id },
    });
    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "ASSET_DISPOSAL", postingDate: input.disposalDate, description: `Disposal of asset ${asset.assetCode}`,
      sourceType: "FinanceAssetDisposal", sourceId: disposalRecord.id, idempotencyKey: `finance_asset_disposal:POST:${disposalRecord.id}`,
      lines,
    });
    await tx.financeAssetDisposal.update({ where: { id: disposalRecord.id }, data: { journalId: journal.id } });
    await tx.financeFixedAsset.update({ where: { id: assetId }, data: { status: "DISPOSED", netBookValue: new Prisma.Decimal(0), version: { increment: 1 } } });
    return disposalRecord;
  });
}

export async function listFixedAssets(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeFixedAsset.findMany({ where, include: { category: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeFixedAsset.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function getAssetRegister(assetId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeFixedAsset.findFirst({
    where: { id: assetId, organizationKey: principal.organizationKey },
    include: { category: true, depreciationEntries: { orderBy: { fiscalPeriodId: "asc" } }, transfers: true, disposal: true },
  });
}

export async function listPendingDepreciationEntries(fiscalPeriodId?: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeDepreciationEntry.findMany({
    where: { organizationKey: principal.organizationKey, status: "PLANNED", ...(fiscalPeriodId ? { fiscalPeriodId } : {}) },
    include: { asset: { select: { assetCode: true, name: true } } },
    orderBy: { fiscalPeriodId: "asc" },
  });
}
