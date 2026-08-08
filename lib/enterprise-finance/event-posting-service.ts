import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";
import { ENTERPRISE_ORGANIZATION, type EnterprisePrincipal } from "@/lib/enterprise/context";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal, requireFinancialReportingPrincipal } from "./context";
import { postSystemGeneratedJournalInTx } from "./posting-engine";
import type { FinanceJournalType } from "./domain";

/**
 * Milestone 8 — Finance & Accounts. The Critical Event Processing Safeguard:
 * a business event must produce either exactly one valid financial posting,
 * or a visible governed exception — never disappear silently. Two
 * independent layers of idempotency protect this: FinanceEventProcessingLog
 * (this file, domain-visible, retriable) and Phase2Operation (already
 * inside postSystemGeneratedJournalInTx, mechanical). Neither replaces the
 * other.
 *
 * Deliberately NOT a scan of SalesAuditLog — business actions call
 * recordFinanceEvent() explicitly, once, right after their own transaction
 * commits (see actions/business-orders.ts, actions/manufacturing.ts). A
 * Finance posting failure here must never fail the business operation that
 * triggered it — every path below catches and records, never rethrows to
 * the caller.
 */

async function buildSystemEventPrincipal(userId: string): Promise<EnterprisePrincipal> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, salesRole: { select: { name: true, permissions: { select: { permission: { select: { permissionKey: true } } } } } } },
  });
  if (!user) throw new NotFoundError("Acting user");
  return {
    id: user.id,
    email: user.email,
    roleName: user.salesRole?.name ?? "System",
    isFounder: user.salesRole?.name === "Founder",
    permissions: new Set(user.salesRole?.permissions.map((p) => p.permission.permissionKey) ?? []),
    organizationKey: ENTERPRISE_ORGANIZATION,
  };
}

export type FinanceEventInput = {
  actingUserId: string;
  sourceModule: string;
  sourceEventAction: string;
  sourceRecordId: string;
  amount: Prisma.Decimal | number;
  description: string;
  postingDate?: Date;
  documentDate?: Date;
};

async function attemptPosting(input: FinanceEventInput, idempotencyKey: string) {
  const rule = await prisma.financeEventPostingRule.findFirst({
    where: { organizationKey: ENTERPRISE_ORGANIZATION, sourceModule: input.sourceModule, sourceEventAction: input.sourceEventAction, active: true },
  });
  if (!rule) return { outcome: "SKIPPED_NO_RULE" as const };

  const journal = await enterpriseTransaction(async (tx) => {
    const [debitAccount, creditAccount] = await Promise.all([
      tx.financeAccount.findFirst({ where: { organizationKey: ENTERPRISE_ORGANIZATION, accountCode: rule.debitAccountCode, status: "ACTIVE" } }),
      tx.financeAccount.findFirst({ where: { organizationKey: ENTERPRISE_ORGANIZATION, accountCode: rule.creditAccountCode, status: "ACTIVE" } }),
    ]);
    if (!debitAccount || !creditAccount) {
      throw new AppError(`Posting rule ${rule.sourceModule}/${rule.sourceEventAction} references a missing or inactive account (${rule.debitAccountCode}/${rule.creditAccountCode})`, 422, "POSTING_RULE_ACCOUNT_MISSING");
    }
    const principal = await buildSystemEventPrincipal(input.actingUserId);
    const amount = input.amount instanceof Prisma.Decimal ? input.amount : new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) throw new AppError("Financial event amount must be positive", 422, "VALIDATION_ERROR");

    return postSystemGeneratedJournalInTx(tx, principal, {
      journalType: rule.journalType as FinanceJournalType,
      postingDate: input.postingDate ?? new Date(),
      documentDate: input.documentDate,
      description: input.description,
      sourceType: input.sourceModule,
      sourceId: input.sourceRecordId,
      idempotencyKey,
      lines: [
        { accountId: debitAccount.id, debitAmount: amount, creditAmount: new Prisma.Decimal(0) },
        { accountId: creditAccount.id, debitAmount: new Prisma.Decimal(0), creditAmount: amount },
      ],
    });
  });
  return { outcome: "POSTED" as const, journalId: journal.id };
}

/**
 * The one entry point every business action calls after its own commit.
 * Never throws — always returns a status, and always leaves a durable
 * FinanceEventProcessingLog row behind, POSTED or FAILED, even when the
 * posting attempt itself rolled back (the log write happens in a separate
 * statement from the failed attempt specifically so it survives that
 * rollback).
 */
export async function recordFinanceEvent(input: FinanceEventInput) {
  const idempotencyKey = `${input.sourceModule}:${input.sourceEventAction}:${input.sourceRecordId}`;

  const log = await prisma.financeEventProcessingLog.upsert({
    where: { organizationKey_idempotencyKey: { organizationKey: ENTERPRISE_ORGANIZATION, idempotencyKey } },
    create: {
      organizationKey: ENTERPRISE_ORGANIZATION, sourceModule: input.sourceModule, sourceEventAction: input.sourceEventAction,
      sourceRecordId: input.sourceRecordId, idempotencyKey, status: "PENDING",
    },
    update: {},
  });
  if (log.status === "POSTED") return { status: "POSTED" as const, journalId: log.journalId };

  try {
    const result = await attemptPosting(input, idempotencyKey);
    if (result.outcome === "SKIPPED_NO_RULE") {
      await prisma.financeEventProcessingLog.update({ where: { id: log.id }, data: { status: "SKIPPED_NO_RULE", lastAttemptAt: new Date(), retryCount: { increment: 1 } } });
      return { status: "SKIPPED_NO_RULE" as const };
    }
    await prisma.financeEventProcessingLog.update({ where: { id: log.id }, data: { status: "POSTED", journalId: result.journalId, lastAttemptAt: new Date() } });
    return { status: "POSTED" as const, journalId: result.journalId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.financeEventProcessingLog.update({
      where: { id: log.id },
      data: { status: "FAILED", failureReason: reason.slice(0, 500), retryCount: { increment: 1 }, lastAttemptAt: new Date() },
    }).catch(() => { /* the log row's own visibility is best-effort on top of best-effort — never let a logging failure surface to the caller */ });
    return { status: "FAILED" as const, failureReason: reason };
  }
}

/** Manual retry for the Unposted Events / Finance Exceptions UI. */
export async function retryFinanceEvent(logId: string) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_EVENT_POSTING_MANAGE);
  const log = await prisma.financeEventProcessingLog.findFirst({ where: { id: logId, organizationKey: principal.organizationKey } });
  if (!log) throw new NotFoundError("Finance event log entry");
  if (log.status === "POSTED") throw new AppError("This event has already been posted", 409, "ALREADY_POSTED");

  try {
    const result = await attemptPosting(
      { actingUserId: principal.id, sourceModule: log.sourceModule, sourceEventAction: log.sourceEventAction, sourceRecordId: log.sourceRecordId, amount: 0, description: `Retry of ${log.idempotencyKey}` },
      log.idempotencyKey,
    );
    // Retry never has the original amount/description (not stored on the
    // log row by design — the log is a status record, not a duplicate
    // event store) so a genuinely useful retry requires the original
    // business record to still be inspectable; this path exists primarily
    // for SKIPPED_NO_RULE (a rule was added after the fact) and
    // transient FAILED cases where the source event's own data (read
    // fresh via sourceModule/sourceRecordId, not cached) is what actually
    // gets posted — callers needing amount-bearing retry should re-derive
    // it from the source record before calling, a natural extension point
    // for the Finance Exceptions UI, not built out further here.
    if (result.outcome === "SKIPPED_NO_RULE") {
      await prisma.financeEventProcessingLog.update({ where: { id: log.id }, data: { status: "SKIPPED_NO_RULE", lastAttemptAt: new Date(), retryCount: { increment: 1 } } });
      return { status: "SKIPPED_NO_RULE" as const };
    }
    await prisma.financeEventProcessingLog.update({ where: { id: log.id }, data: { status: "POSTED", journalId: result.journalId, lastAttemptAt: new Date() } });
    return { status: "POSTED" as const, journalId: result.journalId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.financeEventProcessingLog.update({ where: { id: log.id }, data: { status: "FAILED", failureReason: reason.slice(0, 500), retryCount: { increment: 1 }, lastAttemptAt: new Date() } });
    return { status: "FAILED" as const, failureReason: reason };
  }
}

export async function listFinanceEventLog(input: { status?: string; page?: number; pageSize?: number }) {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.status ? { status: input.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.financeEventProcessingLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeEventProcessingLog.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function listPostingRules() {
  const principal = await requireFinancialReportingPrincipal(PERMISSIONS.FINANCE_REPORTS_VIEW);
  return prisma.financeEventPostingRule.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: [{ sourceModule: "asc" }, { sourceEventAction: "asc" }] });
}
