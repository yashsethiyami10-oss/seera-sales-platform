import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";

/** Milestone 8 — Cash & Petty Cash. Every voucher posts through the same journal engine as everything else — no separate cash ledger. */

export async function createCashAccount(input: { name: string; accountCode: string; isPettyCash?: boolean; custodianId?: string; openingBalance?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CASH_MANAGE);
  const account = await prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: input.accountCode, status: "ACTIVE" } });
  if (!account) throw new AppError("Configured GL account does not exist or is inactive");
  return prisma.financeCashAccount.create({
    data: {
      organizationKey: principal.organizationKey, name: input.name, accountId: account.id, isPettyCash: input.isPettyCash ?? false,
      custodianId: input.custodianId, openingBalance: input.openingBalance ?? 0, currentBalance: input.openingBalance ?? 0, createdById: principal.id,
    },
  });
}

const voucherInput = z.object({
  cashAccountId: z.string().cuid(), voucherType: z.enum(["RECEIPT", "PAYMENT", "TRANSFER", "CONTRA"]),
  amount: z.coerce.number().positive(), partyType: z.string().max(40).optional(), partyId: z.string().max(191).optional(),
  description: z.string().min(1).max(300), supportingDocumentRef: z.string().max(300).optional(), contraAccountCode: z.string().optional(),
});

export async function createCashVoucherDraft(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CASH_MANAGE);
  const data = voucherInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const cashAccount = await tx.financeCashAccount.findFirst({ where: { id: data.cashAccountId, organizationKey: principal.organizationKey } });
    if (!cashAccount) throw new NotFoundError("Cash account");
    const voucherNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "CASH_VOUCHER", "CV");
    const entity = await tx.financeCashVoucher.create({
      data: {
        organizationKey: principal.organizationKey, voucherNumber, cashAccountId: data.cashAccountId, voucherType: data.voucherType,
        amount: data.amount, partyType: data.partyType, partyId: data.partyId, description: data.description,
        supportingDocumentRef: data.supportingDocumentRef, createdById: principal.id,
      },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CASH_VOUCHER_CREATED", entityType: "FinanceCashVoucher", entityId: entity.id, description: `Cash voucher ${voucherNumber} (${data.voucherType}) drafted` });
    return entity;
  });
}

export async function approveAndPostCashVoucher(id: string, expectedVersion: number, contraAccountCode: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYMENTS_APPROVE);
  return enterpriseTransaction(async (tx) => {
    const voucher = await tx.financeCashVoucher.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!voucher) throw new NotFoundError("Cash voucher");
    if (voucher.version !== expectedVersion) throw new ConflictError("Record changed; refresh and retry");
    if (voucher.status !== "DRAFT") throw new AppError("Only a draft cash voucher can be approved and posted", 409, "INVALID_TRANSITION");
    const cashAccount = await tx.financeCashAccount.findUniqueOrThrow({ where: { id: voucher.cashAccountId } });
    const contraAccount = await tx.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: contraAccountCode, status: "ACTIVE" } });
    if (!contraAccount) throw new AppError("Contra account is not configured or inactive");

    const isInflow = voucher.voucherType === "RECEIPT";
    const lines = isInflow
      ? [{ accountId: cashAccount.accountId, debitAmount: voucher.amount, creditAmount: new Prisma.Decimal(0) }, { accountId: contraAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: voucher.amount }]
      : [{ accountId: contraAccount.id, debitAmount: voucher.amount, creditAmount: new Prisma.Decimal(0) }, { accountId: cashAccount.accountId, debitAmount: new Prisma.Decimal(0), creditAmount: voucher.amount }];

    const journal = await postSystemGeneratedJournalInTx(tx, principal, {
      journalType: "CASH_VOUCHER", postingDate: new Date(), description: voucher.description,
      sourceType: "FinanceCashVoucher", sourceId: voucher.id, idempotencyKey: `finance_cash_voucher:POST:${voucher.id}`, lines,
    });
    const entity = await tx.financeCashVoucher.update({ where: { id }, data: { status: "POSTED", journalId: journal.id, approvedById: principal.id, approvedAt: new Date(), version: { increment: 1 } } });
    await tx.financeCashAccount.update({ where: { id: cashAccount.id }, data: { currentBalance: isInflow ? { increment: voucher.amount } : { decrement: voucher.amount } } });
    return entity;
  });
}

export async function recordCashVerification(input: { cashAccountId: string; verificationDate: Date; physicalCount: number; notes?: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CASH_MANAGE);
  const cashAccount = await prisma.financeCashAccount.findFirst({ where: { id: input.cashAccountId, organizationKey: principal.organizationKey } });
  if (!cashAccount) throw new NotFoundError("Cash account");
  const shortExcess = new Prisma.Decimal(input.physicalCount).minus(cashAccount.currentBalance);
  const record = await prisma.financeCashVerification.create({
    data: { organizationKey: principal.organizationKey, cashAccountId: input.cashAccountId, verificationDate: input.verificationDate, physicalCount: input.physicalCount, bookBalance: cashAccount.currentBalance, shortExcess, verifiedById: principal.id, notes: input.notes },
  });
  return record;
}

export async function listCashAccounts() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeCashAccount.findMany({ where: { organizationKey: principal.organizationKey } });
}

export async function listCashVouchers(input: { cashAccountId?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.cashAccountId ? { cashAccountId: input.cashAccountId } : {}), ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeCashVoucher.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeCashVoucher.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Cash Book report — running balance of vouchers for one cash account. */
export async function getCashBook(cashAccountId: string, from?: Date, to?: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const cashAccount = await prisma.financeCashAccount.findFirst({ where: { id: cashAccountId, organizationKey: principal.organizationKey } });
  if (!cashAccount) throw new NotFoundError("Cash account");
  const vouchers = await prisma.financeCashVoucher.findMany({
    where: { organizationKey: principal.organizationKey, cashAccountId, status: "POSTED", ...(from || to ? { createdAt: { gte: from, lte: to } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  let running = Number(cashAccount.openingBalance);
  const rows = vouchers.map((v) => {
    running += v.voucherType === "RECEIPT" ? Number(v.amount) : -Number(v.amount);
    return { voucherNumber: v.voucherNumber, voucherType: v.voucherType, amount: Number(v.amount), description: v.description, runningBalance: running, date: v.createdAt };
  });
  return { cashAccount: { name: cashAccount.name, openingBalance: Number(cashAccount.openingBalance), currentBalance: Number(cashAccount.currentBalance) }, rows };
}
