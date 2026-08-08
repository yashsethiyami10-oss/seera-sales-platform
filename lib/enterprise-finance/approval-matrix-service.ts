import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";

/**
 * Milestone 8 — Configurable Approval Matrix. Read by any approval gate
 * (Expense Claim, Purchase Order, Journal above a threshold) instead of
 * each hardcoding its own amount thresholds in a UI component (§2: "must
 * not be hardcoded into UI components"). resolveRequiredRole is the one
 * function callers use; the rules themselves are managed here.
 */

const ruleInput = z.object({
  transactionType: z.string().min(2).max(60), minAmount: z.coerce.number().nonnegative().default(0), maxAmount: z.coerce.number().positive().optional(),
  costCenterId: z.string().cuid().optional(), profitCenterId: z.string().cuid().optional(), dimensionCode: z.string().max(60).optional(),
  requiredRole: z.string().min(2).max(80), riskLevel: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"), sequence: z.number().int().positive().default(1),
});

export async function createApprovalRule(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_APPROVAL_MATRIX_MANAGE);
  const data = ruleInput.parse(input);
  return prisma.financeApprovalRule.create({ data: { organizationKey: principal.organizationKey, ...data, createdById: principal.id } });
}

export async function deactivateApprovalRule(id: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_APPROVAL_MATRIX_MANAGE);
  const rule = await prisma.financeApprovalRule.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!rule) throw new NotFoundError("Approval rule");
  return prisma.financeApprovalRule.update({ where: { id }, data: { active: false, version: { increment: 1 } } });
}

export async function listApprovalRules(transactionType?: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeApprovalRule.findMany({ where: { organizationKey: principal.organizationKey, ...(transactionType ? { transactionType } : {}), active: true }, orderBy: [{ transactionType: "asc" }, { minAmount: "asc" }] });
}

/**
 * Resolves which role must approve a transaction of this type/amount
 * (+ optional cost center/dimension) — the single source of truth every
 * approval gate should call rather than hardcoding a threshold. Returns
 * null (no matching rule = no matrix constraint configured) rather than
 * silently defaulting to "anyone" — a caller with no matching rule should
 * fall back to its own existing default authorization, not treat this as
 * "no approval required."
 */
export async function resolveRequiredRole(input: { transactionType: string; amount: number; costCenterId?: string; dimensionCode?: string }) {
  const rules = await prisma.financeApprovalRule.findMany({
    where: { transactionType: input.transactionType, active: true, minAmount: { lte: input.amount }, OR: [{ maxAmount: null }, { maxAmount: { gte: input.amount } }] },
    orderBy: { sequence: "asc" },
  });
  const matching = rules.find((r) => (!r.costCenterId || r.costCenterId === input.costCenterId) && (!r.dimensionCode || r.dimensionCode === input.dimensionCode));
  return matching ?? null;
}

// --- Payment Terms ---

const paymentTermInput = z.object({
  code: z.string().min(2).max(30), name: z.string().min(2).max(160),
  termType: z.enum(["FULL_ADVANCE", "PARTIAL_ADVANCE", "ON_DELIVERY", "IMMEDIATE", "CREDIT", "INSTALLMENTS", "MILESTONE"]),
  creditPeriodDays: z.number().int().nonnegative().optional(),
  installments: z.array(z.object({ percent: z.number().positive(), daysAfterInvoice: z.number().int().nonnegative() })).optional(),
  earlyPaymentDiscountPercent: z.coerce.number().nonnegative().optional(), earlyPaymentDiscountDays: z.number().int().positive().optional(),
  latePaymentChargePercent: z.coerce.number().nonnegative().optional(),
});

export async function createPaymentTermTemplate(input: unknown) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_MASTERS_MANAGE);
  const data = paymentTermInput.parse(input);
  return prisma.financePaymentTermTemplate.create({ data: { organizationKey: principal.organizationKey, ...data, installments: data.installments ?? undefined, createdById: principal.id } });
}

export async function listPaymentTermTemplates() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financePaymentTermTemplate.findMany({ where: { organizationKey: principal.organizationKey, active: true } });
}

export async function assignCustomerPaymentTerm(customerAccountId: string, paymentTermTemplateId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_RECEIVABLES_MANAGE);
  const template = await prisma.financePaymentTermTemplate.findFirst({ where: { id: paymentTermTemplateId, organizationKey: principal.organizationKey } });
  if (!template) throw new NotFoundError("Payment term template");
  return prisma.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { paymentTermTemplateId, paymentTermsDays: template.creditPeriodDays ?? 30, version: { increment: 1 } } });
}

export async function assignVendorPaymentTerm(vendorAccountId: string, paymentTermTemplateId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_PAYABLES_MANAGE);
  const template = await prisma.financePaymentTermTemplate.findFirst({ where: { id: paymentTermTemplateId, organizationKey: principal.organizationKey } });
  if (!template) throw new NotFoundError("Payment term template");
  return prisma.financeVendorAccount.update({ where: { id: vendorAccountId }, data: { paymentTermTemplateId, paymentTermsDays: template.creditPeriodDays ?? 30, version: { increment: 1 } } });
}

/** Computes a due date from a payment term's credit period — the connection point AR/AP invoice creation should use instead of a hardcoded 30-day default. */
export function computeDueDate(invoiceDate: Date, creditPeriodDays: number | null | undefined) {
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + (creditPeriodDays ?? 30));
  return due;
}

/** Early-payment discount / late-payment charge — computed, never auto-posted (a human decision at receipt time, matching this codebase's "never silently modify a financial amount" rule). */
export function computePaymentAdjustment(term: { earlyPaymentDiscountPercent: number | null; earlyPaymentDiscountDays: number | null; latePaymentChargePercent: number | null }, invoiceAmount: number, daysFromInvoice: number) {
  if (term.earlyPaymentDiscountPercent && term.earlyPaymentDiscountDays && daysFromInvoice <= term.earlyPaymentDiscountDays) {
    return { type: "EARLY_PAYMENT_DISCOUNT" as const, amount: (invoiceAmount * term.earlyPaymentDiscountPercent) / 100 };
  }
  if (term.latePaymentChargePercent && daysFromInvoice > 0) {
    return { type: "LATE_PAYMENT_CHARGE" as const, amount: (invoiceAmount * term.latePaymentChargePercent) / 100 };
  }
  return null;
}
