import { Prisma, type PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";
import { listAccounts } from "./chart-of-accounts";
import { listDimensions } from "./dimension-service";
import { trialBalance } from "./journal-service";
import { listTreasuryAccounts, listAllTreasuryAccounts } from "./treasury-service";
import { listVendors, payablesView } from "./vendor-service";
import { listExpenseCategories, expensesPendingApproval, listRecentExpenses } from "./expense-service";
import { listBudgets } from "./budget-service";
import { loanOutstandingReport, assetRegister } from "./loan-asset-service";
import { capitalLedger } from "./capital-service";
import { openingBalanceStatus } from "./opening-balance-service";
import { listFinanceApprovalPolicies } from "./approval-policy-service";
import { periodCloseChecklist, listPeriods } from "./period-service";
import { profitAndLoss, balanceSheet, cashFlow, cashForecast, gstControlCenter } from "./statements-service";
import { listRecurringExpensesDue, listRecurringTemplates } from "./expense-service";
import { financeApprovalQueue } from "./approval-policy-service";
import { financialIntelligenceFeed } from "./intelligence-service";

// Every capability this feeds a UI tab is independently permission-gated
// (each underlying service call still calls its own authorize()) — this just
// collects whatever the current actor is allowed to see in one round trip so
// the workspace page issues one query wave instead of one per tab. A section
// the actor lacks permission for comes back null and its tab is hidden
// client-side rather than the whole page erroring (Accounts Executive vs
// Accounts Manager see a different subset by design — spec section 53).
async function tryOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FoundationError && error.status === 403) return null;
    throw error;
  }
}

// This object crosses the Server -> Client Component boundary as a prop into
// <FinanceWorkspacePanel>. Several underlying reads (listRecentExpenses,
// listBudgets, loanOutstandingReport, listFinanceApprovalPolicies,
// openingBalanceStatus) return raw Prisma rows whose Decimal-typed columns
// are class instances, not plain objects — Next.js cannot serialize those
// across the boundary. Recursively convert every Prisma.Decimal to a plain
// number here, once, instead of hand-fixing each source function.
function serializeDecimals<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => serializeDecimals(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeDecimals(v);
    return out as T;
  }
  return value;
}

export async function financeWorkspaceData(db: PrismaClient, actorId: string) {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodCode = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const [
    chartOfAccounts,
    dimensions,
    treasuryAccounts,
    allTreasuryAccounts,
    vendors,
    payables,
    expenseCategories,
    pendingExpenseApprovals,
    recentExpenses,
    budgets,
    loans,
    fixedAssets,
    capital,
    openingBalances,
    approvalPolicies,
    periods,
    periodChecklist,
    trial,
    pnl,
    bs,
    cf,
    forecast30,
    gst,
    recurringDue,
    recurringTemplates,
    approvalQueue,
    intelligence,
  ] = await Promise.all([
    tryOrNull(() => listAccounts(db, actorId)),
    tryOrNull(() => listDimensions(db, actorId)),
    tryOrNull(() => listTreasuryAccounts(db, actorId)),
    tryOrNull(() => listAllTreasuryAccounts(db, actorId)),
    tryOrNull(() => listVendors(db, actorId)),
    tryOrNull(() => payablesView(db, actorId)),
    tryOrNull(() => listExpenseCategories(db, actorId)),
    tryOrNull(() => expensesPendingApproval(db, actorId)),
    tryOrNull(() => listRecentExpenses(db, actorId)),
    tryOrNull(() => listBudgets(db, actorId)),
    tryOrNull(() => loanOutstandingReport(db, actorId)),
    tryOrNull(() => assetRegister(db, actorId)),
    tryOrNull(() => capitalLedger(db, actorId)),
    tryOrNull(() => openingBalanceStatus(db, actorId)),
    tryOrNull(() => listFinanceApprovalPolicies(db, actorId)),
    tryOrNull(() => listPeriods(db, actorId)),
    tryOrNull(() => periodCloseChecklist(db, actorId, periodCode)),
    tryOrNull(() => trialBalance(db, actorId, now)),
    tryOrNull(() => profitAndLoss(db, actorId, yearStart, now)),
    tryOrNull(() => balanceSheet(db, actorId, now)),
    tryOrNull(() => cashFlow(db, actorId, yearStart, now)),
    tryOrNull(() => cashForecast(db, actorId, 30)),
    tryOrNull(() => gstControlCenter(db, actorId, yearStart, now)),
    tryOrNull(() => listRecurringExpensesDue(db, actorId, now)),
    tryOrNull(() => listRecurringTemplates(db, actorId)),
    tryOrNull(() => financeApprovalQueue(db, actorId)),
    tryOrNull(() => financialIntelligenceFeed(db, actorId)),
  ]);

  return serializeDecimals({ chartOfAccounts, dimensions, treasuryAccounts, allTreasuryAccounts, vendors, payables, expenseCategories, pendingExpenseApprovals, recentExpenses, budgets, loans, fixedAssets, capital, openingBalances, approvalPolicies, periods, periodChecklist, trial, pnl, bs, cf, forecast30, gst, periodCode, recurringDue, recurringTemplates, approvalQueue, intelligence });
}

export type FinanceWorkspaceData = Awaited<ReturnType<typeof financeWorkspaceData>>;
