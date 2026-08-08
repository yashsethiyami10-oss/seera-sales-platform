import { Prisma } from "@prisma/client";
import type { EnterpriseTx } from "@/lib/enterprise/context";
import { AppError } from "@/lib/errors";
import {
  assertJournalBalances, assertPeriodAcceptsPosting, assertValidJournalLines, type FinanceJournalType,
} from "./domain";

/**
 * Enterprise Finance Platform (Part 3C, Stage A) — one reusable, structured
 * journal validation engine (Section 12). Used by both the standalone
 * `validateJournal` Business Service (returns findings for UI/API display,
 * never throws) and the Posting Engine (re-runs this unconditionally before
 * every post, then throws on any finding — "never silently repair invalid
 * accounting data").
 *
 * Batches every account/dimension lookup into one query each rather than
 * looking each line up individually, per Section 29's "avoid N+1 queries."
 */

export type JournalValidationFinding = { code: string; message: string; lineNumber?: number };

export type JournalValidationLineInput = {
  lineNumber: number;
  accountId: string;
  debitAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  currency: string;
  costCenterId?: string | null;
  profitCenterId?: string | null;
};

export type JournalValidationInput = {
  journalType: FinanceJournalType | string;
  postingDate: Date;
  documentDate: Date;
  currency: string;
  sourceType?: string | null;
  sourceId?: string | null;
  excludeJournalId?: string; // when re-validating an existing draft, exclude it from the duplicate-source check
};

const CONTROL_ACCOUNT_DEPENDENT_TYPES = new Set(["AR_INVOICE", "AR_CREDIT_NOTE", "AR_RECEIPT", "AP_BILL", "AP_CREDIT", "AP_PAYMENT", "EXPENSE", "BANK_ADJUSTMENT"]);

export async function validateJournalForPosting(
  tx: EnterpriseTx,
  organizationKey: string,
  journal: JournalValidationInput,
  lines: readonly JournalValidationLineInput[],
): Promise<{ findings: JournalValidationFinding[]; valid: boolean; totalDebit: Prisma.Decimal; totalCredit: Prisma.Decimal; fiscalPeriodId: string | null }> {
  const findings: JournalValidationFinding[] = [];

  try {
    assertValidJournalLines(lines);
  } catch (err) {
    findings.push(toFinding(err));
  }

  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  try {
    const totals = assertJournalBalances(lines);
    totalDebit = totals.totalDebit;
    totalCredit = totals.totalCredit;
  } catch (err) {
    findings.push(toFinding(err));
  }

  if (lines.some((line) => line.currency !== journal.currency)) {
    findings.push({ code: "JOURNAL_CURRENCY_MISMATCH", message: "Every line's currency must match the journal's currency" });
  }

  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await tx.financeAccount.findMany({ where: { id: { in: accountIds } } });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const childCounts = accountIds.length
    ? await tx.financeAccount.groupBy({ by: ["parentId"], where: { organizationKey, parentId: { in: accountIds } }, _count: true })
    : [];
  const childCountByParent = new Map(childCounts.map((row) => [row.parentId, row._count]));

  for (const line of lines) {
    const account = accountById.get(line.accountId);
    if (!account || account.organizationKey !== organizationKey) {
      findings.push({ code: "ACCOUNT_NOT_FOUND", message: "Referenced account was not found in this organization", lineNumber: line.lineNumber });
      continue;
    }
    if (account.status !== "ACTIVE") {
      findings.push({ code: "ACCOUNT_INACTIVE", message: `Account ${account.accountCode} is not active`, lineNumber: line.lineNumber });
    }
    if (!account.postingEnabled) {
      findings.push({ code: "ACCOUNT_NOT_POSTING_ENABLED", message: `Account ${account.accountCode} does not accept direct postings`, lineNumber: line.lineNumber });
    }
    if ((childCountByParent.get(account.id) ?? 0) > 0) {
      findings.push({ code: "ACCOUNT_IS_SUMMARY", message: `Account ${account.accountCode} is a summary account and cannot receive direct postings`, lineNumber: line.lineNumber });
    }
  }

  const costCenterIds = [...new Set(lines.map((line) => line.costCenterId).filter((id): id is string => Boolean(id)))];
  const profitCenterIds = [...new Set(lines.map((line) => line.profitCenterId).filter((id): id is string => Boolean(id)))];
  const [costCenters, profitCenters] = await Promise.all([
    costCenterIds.length ? tx.financeCostCenter.findMany({ where: { id: { in: costCenterIds } } }) : Promise.resolve([]),
    profitCenterIds.length ? tx.financeProfitCenter.findMany({ where: { id: { in: profitCenterIds } } }) : Promise.resolve([]),
  ]);
  const costCenterById = new Map(costCenters.map((row) => [row.id, row]));
  const profitCenterById = new Map(profitCenters.map((row) => [row.id, row]));

  for (const line of lines) {
    if (line.costCenterId) {
      const cc = costCenterById.get(line.costCenterId);
      if (!cc || cc.organizationKey !== organizationKey) {
        findings.push({ code: "COST_CENTER_NOT_FOUND", message: "Referenced cost center was not found in this organization", lineNumber: line.lineNumber });
      } else if (cc.status !== "ACTIVE") {
        findings.push({ code: "COST_CENTER_INACTIVE", message: `Cost center ${cc.code} is not active`, lineNumber: line.lineNumber });
      }
    }
    if (line.profitCenterId) {
      const pc = profitCenterById.get(line.profitCenterId);
      if (!pc || pc.organizationKey !== organizationKey) {
        findings.push({ code: "PROFIT_CENTER_NOT_FOUND", message: "Referenced profit center was not found in this organization", lineNumber: line.lineNumber });
      } else if (pc.status !== "ACTIVE") {
        findings.push({ code: "PROFIT_CENTER_INACTIVE", message: `Profit center ${pc.code} is not active`, lineNumber: line.lineNumber });
      }
    }
  }

  if (journal.documentDate > journal.postingDate) {
    findings.push({ code: "DOCUMENT_DATE_AFTER_POSTING_DATE", message: "Document date cannot be after the posting date" });
  }

  let fiscalPeriodId: string | null = null;
  const period = await tx.financeFiscalPeriod.findFirst({
    where: { organizationKey, startDate: { lte: journal.postingDate }, endDate: { gt: journal.postingDate } },
  });
  if (!period) {
    findings.push({ code: "NO_FISCAL_PERIOD", message: "No fiscal period covers this posting date" });
  } else {
    fiscalPeriodId = period.id;
    try {
      assertPeriodAcceptsPosting(period, journal.journalType as FinanceJournalType);
    } catch (err) {
      findings.push(toFinding(err));
    }
  }

  if (journal.sourceType && journal.sourceId) {
    const duplicate = await tx.financeJournal.findFirst({
      where: {
        organizationKey, sourceType: journal.sourceType, sourceId: journal.sourceId,
        status: { in: ["APPROVED", "POSTED"] },
        id: journal.excludeJournalId ? { not: journal.excludeJournalId } : undefined,
      },
    });
    if (duplicate) {
      findings.push({ code: "DUPLICATE_SOURCE_POSTING", message: `Source ${journal.sourceType}:${journal.sourceId} is already referenced by journal ${duplicate.journalNumber}` });
    }
  }

  if (CONTROL_ACCOUNT_DEPENDENT_TYPES.has(journal.journalType)) {
    const configuration = await tx.financeConfiguration.findUnique({ where: { organizationKey } });
    if (!configuration || configuration.status !== "ACTIVE") {
      findings.push({ code: "FINANCE_CONFIGURATION_NOT_READY", message: "Finance configuration must be active before posting this journal type" });
    }
  }

  return { findings, valid: findings.length === 0, totalDebit, totalCredit, fiscalPeriodId };
}

export async function assertJournalValidForPosting(
  tx: EnterpriseTx,
  organizationKey: string,
  journal: JournalValidationInput,
  lines: readonly JournalValidationLineInput[],
) {
  const result = await validateJournalForPosting(tx, organizationKey, journal, lines);
  if (!result.valid) {
    const summary = result.findings.map((finding) => finding.message).join("; ");
    throw new AppError(`Journal failed validation: ${summary}`, 422, "JOURNAL_VALIDATION_FAILED");
  }
  return result;
}

function toFinding(err: unknown): JournalValidationFinding {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: "VALIDATION_ERROR", message: err instanceof Error ? err.message : "Validation failed" };
}
