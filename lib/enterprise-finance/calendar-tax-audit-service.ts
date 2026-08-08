import { z } from "zod";
import { AppError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";

/**
 * Milestone 8 — Financial Calendar, Compliance-ready Tax Framework, Internal
 * Audit. Fiscal Year/Period/soft-close/hard-close/reopen are Part 3C's own
 * frozen period-service.ts, reused unchanged; this file adds only what was
 * genuinely missing: a holiday calendar (business-day support) and
 * FinanceFiscalPeriod.postingCutoffDate (both additive, disclosed schema
 * extensions — see schema.prisma's Milestone 8 block header).
 */

// --- Financial Calendar ---

export async function addHoliday(date: Date, name: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  return prisma.financeHolidayCalendar.create({ data: { organizationKey: principal.organizationKey, date, name } });
}

export async function listHolidays(year?: number) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeHolidayCalendar.findMany({
    where: { organizationKey: principal.organizationKey, active: true, ...(year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}) },
    orderBy: { date: "asc" },
  });
}

export async function isBusinessDay(date: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  if (date.getUTCDay() === 0) return false; // Sunday
  const holiday = await prisma.financeHolidayCalendar.findFirst({ where: { organizationKey: principal.organizationKey, active: true, date } });
  return !holiday;
}

export async function setPeriodPostingCutoff(fiscalPeriodId: string, cutoffDate: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PERIODS_CLOSE);
  const period = await prisma.financeFiscalPeriod.findFirst({ where: { id: fiscalPeriodId, organizationKey: principal.organizationKey } });
  if (!period) throw new NotFoundError("Fiscal period");
  return prisma.financeFiscalPeriod.update({ where: { id: fiscalPeriodId }, data: { postingCutoffDate: cutoffDate, version: { increment: 1 } } });
}

/** Backdated transaction control — a posting date earlier than the period's own cutoff is rejected, even inside an otherwise-open period. */
export async function assertWithinPostingCutoff(fiscalPeriodId: string, postingDate: Date) {
  const period = await prisma.financeFiscalPeriod.findUniqueOrThrow({ where: { id: fiscalPeriodId } });
  if (period.postingCutoffDate && postingDate < period.postingCutoffDate) {
    throw new AppError(`Posting date is before this period's cutoff (${period.postingCutoffDate.toISOString().slice(0, 10)})`, 422, "BEFORE_POSTING_CUTOFF");
  }
}

// --- Compliance-ready Tax Framework (structural only — no filing) ---

export async function createTaxJurisdiction(input: { code: string; name: string; country: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_TAX_MANAGE);
  return prisma.financeTaxJurisdiction.create({ data: { organizationKey: principal.organizationKey, ...input } });
}

export async function createTaxType(input: { code: string; name: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_TAX_MANAGE);
  return prisma.financeTaxType.create({ data: { organizationKey: principal.organizationKey, ...input } });
}

const taxRateInput = z.object({
  taxTypeId: z.string().cuid(), jurisdictionId: z.string().cuid(), code: z.string().min(1).max(40), ratePercent: z.coerce.number().nonnegative(),
  isInclusive: z.boolean().default(false), isReverseCharge: z.boolean().default(false), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional(),
});

export async function createTaxRate(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_TAX_MANAGE);
  const data = taxRateInput.parse(input);
  return prisma.financeTaxRate.create({ data: { organizationKey: principal.organizationKey, ...data } });
}

export async function listTaxRates() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeTaxRate.findMany({ where: { organizationKey: principal.organizationKey, active: true }, include: { taxType: true, jurisdiction: true } });
}

/** GST-ready computation: tax-inclusive or tax-exclusive, never hardcoded to one country's logic — the rate itself is fully org-configured (FinanceTaxRate), this function only does the arithmetic. */
export function computeTax(amount: number, ratePercent: number, isInclusive: boolean) {
  if (isInclusive) {
    const base = amount / (1 + ratePercent / 100);
    return { baseAmount: base, taxAmount: amount - base };
  }
  return { baseAmount: amount, taxAmount: (amount * ratePercent) / 100 };
}

/** Tax Reconciliation report — output tax collected (from posted AR journals) vs input tax paid (from posted AP journals), by tax rate control account. */
export async function getTaxReconciliation(fiscalPeriodId: string, outputTaxAccountCode = "2100", inputTaxAccountCode = "1300") {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_TAX_MANAGE);
  const [outputAccount, inputAccount] = await Promise.all([
    prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: outputTaxAccountCode } }),
    prisma.financeAccount.findFirst({ where: { organizationKey: principal.organizationKey, accountCode: inputTaxAccountCode } }),
  ]);
  const [outputAgg, inputAgg] = await Promise.all([
    outputAccount ? prisma.financeLedgerEntry.aggregate({ where: { organizationKey: principal.organizationKey, accountId: outputAccount.id, fiscalPeriodId }, _sum: { creditAmount: true, debitAmount: true } }) : null,
    inputAccount ? prisma.financeLedgerEntry.aggregate({ where: { organizationKey: principal.organizationKey, accountId: inputAccount.id, fiscalPeriodId }, _sum: { creditAmount: true, debitAmount: true } }) : null,
  ]);
  const outputTaxCollected = Number(outputAgg?._sum.creditAmount ?? 0) - Number(outputAgg?._sum.debitAmount ?? 0);
  const inputTaxPaid = Number(inputAgg?._sum.debitAmount ?? 0) - Number(inputAgg?._sum.creditAmount ?? 0);
  return { outputTaxCollected, inputTaxPaid, netTaxPosition: outputTaxCollected - inputTaxPaid };
}

// --- Internal Audit and Exception Management ---

export async function createAuditPlan(input: { title: string; periodText: string }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_MANAGE);
  const planNumber = `AUD-${Date.now()}`;
  return prisma.financeAuditPlan.create({ data: { organizationKey: principal.organizationKey, planNumber, ...input, createdById: principal.id } });
}

const findingInput = z.object({
  planId: z.string().cuid().optional(), area: z.string().min(2).max(120), procedureText: z.string().max(2000).optional(), description: z.string().min(2).max(2000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), financialImpact: z.coerce.number().optional(), responsibleOwnerId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional(), repeatFinding: z.boolean().default(false), controlFailure: z.boolean().default(false),
  policyDeviation: z.boolean().default(false), fraudRiskFlag: z.boolean().default(false), evidenceRef: z.string().max(300).optional(),
});

export async function createAuditFinding(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_MANAGE);
  const data = findingInput.parse(input);
  const findingNumber = `FND-${Date.now()}`;
  return prisma.financeAuditFinding.create({ data: { organizationKey: principal.organizationKey, findingNumber, ...data, createdById: principal.id } });
}

export async function addCorrectiveAction(findingId: string, input: { description: string; ownerId: string; dueDate?: Date }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_MANAGE);
  const finding = await prisma.financeAuditFinding.findFirst({ where: { id: findingId, organizationKey: principal.organizationKey } });
  if (!finding) throw new NotFoundError("Audit finding");
  return prisma.financeCorrectiveAction.create({ data: { organizationKey: principal.organizationKey, findingId, ...input } });
}

export async function closeAuditFinding(findingId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_MANAGE);
  const finding = await prisma.financeAuditFinding.findFirst({ where: { id: findingId, organizationKey: principal.organizationKey } });
  if (!finding) throw new NotFoundError("Audit finding");
  const openActions = await prisma.financeCorrectiveAction.count({ where: { findingId, status: { not: "COMPLETED" } } });
  if (openActions > 0) throw new AppError("All corrective actions must be completed before closure", 409, "OPEN_CORRECTIVE_ACTIONS");
  return prisma.financeAuditFinding.update({ where: { id: findingId }, data: { status: "CLOSED", closureApprovedById: principal.id, closedAt: new Date() } });
}

export async function reopenAuditFinding(findingId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_MANAGE);
  return prisma.financeAuditFinding.update({ where: { id: findingId }, data: { status: "OPEN", repeatFinding: true, closedAt: null } });
}

export async function listAuditFindings(input: { status?: string; severity?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_AUDIT_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}), ...(input.severity ? { severity: input.severity } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeAuditFinding.findMany({ where, include: { correctiveActions: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeAuditFinding.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
