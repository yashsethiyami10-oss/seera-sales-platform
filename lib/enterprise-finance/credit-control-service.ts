import { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireFinancePrincipal } from "./context";

/**
 * Milestone 8 — Customer and Supplier Credit Control. getCustomerCreditStatus
 * is read by both the Finance UI and, critically, assertCustomerCreditOk —
 * the one enforcement function a sales transaction must call before
 * committing (§4: "must not silently bypass the applicable credit-control
 * rule"). Wired into createDirectBusinessOrder (actions/business-orders.ts)
 * as this milestone's concrete proof of enforcement; every other
 * order-creation path can call the same function.
 */

/**
 * Lazily creates the customer's FinanceCustomerAccount if it doesn't exist
 * yet, without requiring the caller to hold a Finance permission — mirrors
 * postSystemGeneratedJournalInTx's own reasoning (a sales action's own
 * domain permission is the real authorization gate; this is a system-level
 * integrity check triggered by that action, not a direct Finance mutation
 * a Sales Officer is performing). Used by assertCustomerCreditOkForSale,
 * the one call sales actions make.
 */
async function getOrCreateCustomerAccountForCreditCheck(customerId: string, actingUserId: string) {
  const existing = await prisma.financeCustomerAccount.findUnique({ where: { organizationKey_customerId: { organizationKey: "MUV", customerId } } });
  if (existing) return existing;
  return prisma.financeCustomerAccount.create({ data: { organizationKey: "MUV", customerId, createdById: actingUserId } });
}

/** The call site for a sales action (e.g. createDirectBusinessOrder) — never requires the acting Sales user to hold any Finance permission. No creditLimit set (0/unset) means unrestricted, matching "not every customer needs a governed limit" rather than silently blocking every order until Finance configures one. */
export async function assertCustomerCreditOkForSale(customerId: string, actingUserId: string, additionalExposure: number) {
  const account = await getOrCreateCustomerAccountForCreditCheck(customerId, actingUserId);
  if (!account.creditHold && !account.creditLimit) return;
  await assertCustomerCreditOk(account.id, additionalExposure);
}

export async function getCustomerCreditStatus(customerAccountId: string) {
  const account = await prisma.financeCustomerAccount.findUniqueOrThrow({ where: { id: customerAccountId } });
  const [outstandingAgg, overdueAgg] = await Promise.all([
    prisma.financeReceivableInvoice.aggregate({ where: { customerAccountId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { outstandingAmount: true } }),
    prisma.financeReceivableInvoice.aggregate({ where: { customerAccountId, status: "OVERDUE" }, _sum: { outstandingAmount: true } }),
  ]);
  const currentExposure = outstandingAgg._sum.outstandingAmount ?? new Prisma.Decimal(0);
  const overdueExposure = overdueAgg._sum.outstandingAmount ?? new Prisma.Decimal(0);
  const temporaryStillValid = account.temporaryCreditLimit && account.temporaryCreditLimitExpiresAt && account.temporaryCreditLimitExpiresAt > new Date();
  const effectiveLimit = (account.creditLimit ?? new Prisma.Decimal(0)).plus(temporaryStillValid ? account.temporaryCreditLimit! : new Prisma.Decimal(0));
  const availableCredit = effectiveLimit.minus(currentExposure);
  const overrideStillValid = account.creditHoldOverrideById && (!account.creditHoldOverrideExpiresAt || account.creditHoldOverrideExpiresAt > new Date());
  return {
    customerAccountId, creditLimit: Number(account.creditLimit ?? 0), temporaryCreditLimit: temporaryStillValid ? Number(account.temporaryCreditLimit) : 0,
    effectiveLimit: Number(effectiveLimit), currentExposure: Number(currentExposure), overdueExposure: Number(overdueExposure),
    availableCredit: Number(availableCredit), creditHold: account.creditHold, creditHoldReason: account.creditHoldReason,
    overrideActive: !!overrideStillValid, riskRating: account.riskRating,
  };
}

/** The enforcement point. Throws ForbiddenError, never a silent pass, unless an active override exists. */
export async function assertCustomerCreditOk(customerAccountId: string, additionalExposure: number) {
  const status = await getCustomerCreditStatus(customerAccountId);
  if (status.creditHold && !status.overrideActive) {
    throw new ForbiddenError(`Customer is on credit hold (${status.creditHoldReason ?? "no reason recorded"}) — a Founder/Finance Controller override is required`);
  }
  if (status.effectiveLimit > 0 && additionalExposure > status.availableCredit) {
    throw new ForbiddenError(`This transaction (₹${additionalExposure}) would exceed available credit (₹${status.availableCredit} of ₹${status.effectiveLimit})`);
  }
}

export async function setCreditHold(customerAccountId: string, reason: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_CONTROL_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const account = await tx.financeCustomerAccount.findFirst({ where: { id: customerAccountId, organizationKey: principal.organizationKey } });
    if (!account) throw new NotFoundError("Customer account");
    const updated = await tx.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { creditHold: true, creditHoldReason: reason, creditHoldSetAt: new Date(), creditHoldOverrideById: null, creditHoldOverrideReason: null, creditHoldOverrideExpiresAt: null, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_HOLD_SET", entityType: "FinanceCustomerAccount", entityId: customerAccountId, description: `Credit hold set: ${reason}` });
    return updated;
  });
}

export async function releaseCreditHold(customerAccountId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_CONTROL_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const updated = await tx.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { creditHold: false, creditHoldReason: null, creditHoldSetAt: null, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_HOLD_RELEASED", entityType: "FinanceCustomerAccount", entityId: customerAccountId, description: "Credit hold released" });
    return updated;
  });
}

/** Manual override with reason — Founder/Finance Controller only, always time-bound if expiresAt is given, always audited. */
export async function overrideCreditHold(customerAccountId: string, reason: string, expiresAt?: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_CONTROL_OVERRIDE);
  return enterpriseTransaction(async (tx) => {
    const updated = await tx.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { creditHoldOverrideById: principal.id, creditHoldOverrideReason: reason, creditHoldOverrideExpiresAt: expiresAt, version: { increment: 1 } } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_finance", action: "CREDIT_HOLD_OVERRIDDEN", entityType: "FinanceCustomerAccount", entityId: customerAccountId, description: `Credit hold overridden: ${reason}${expiresAt ? ` (expires ${expiresAt.toISOString()})` : ""}` });
    return updated;
  });
}

export async function setTemporaryCreditLimit(customerAccountId: string, amount: number, expiresAt: Date) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_CONTROL_MANAGE);
  return prisma.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { temporaryCreditLimit: amount, temporaryCreditLimitExpiresAt: expiresAt, version: { increment: 1 } } });
}

export async function setPermanentCreditLimit(customerAccountId: string, amount: number, riskRating?: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_CREDIT_CONTROL_MANAGE);
  return prisma.financeCustomerAccount.update({ where: { id: customerAccountId }, data: { creditLimit: amount, riskRating, version: { increment: 1 } } });
}

export async function listCreditHolds() {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeCustomerAccount.findMany({ where: { organizationKey: principal.organizationKey, creditHold: true }, include: { customer: { select: { name: true } } } });
}
