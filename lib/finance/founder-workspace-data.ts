import { Prisma, type PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";
import { listAccounts } from "./chart-of-accounts";
import { listDimensions } from "./dimension-service";
import { trialBalance } from "./journal-service";
import { listTreasuryAccounts, listAllTreasuryAccounts, treasuryCurrentBalances } from "./treasury-service";
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
import { moneyDeskHome } from "./money-desk-service";
import { listProductionOrders } from "@/lib/manufacturing/production-order-service";

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
    moneyDeskPendingApprovals,
    productionOrdersPendingApproval,
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
    // Founder Approval Hub (Final Integration mission, Part A) — reuses the SAME canonical reads
    // Money Desk's own Approvals tab and Manufacturing's own order list already use; never a second
    // approval engine. moneyDeskPendingApprovals pulls the full moneyDeskHome() result (a real,
    // known cost, accepted here since this is a Founder-only, low-traffic screen) purely for its
    // .pendingApprovals slice — the KPIs/recent-transactions it also computes are simply unused by
    // this caller, not recomputed differently.
    tryOrNull(() => moneyDeskHome(db, actorId).then((h) => h.pendingApprovals)),
    tryOrNull(() => listProductionOrders(db, actorId, { status: "DRAFT" })),
  ]);

  // §6/§7 — the real, canonical current balance per Treasury Account (POSTED journal lines only,
  // the exact same computation moneyDeskHome's own cashBankToday already uses), so the Treasury
  // Accounts management screen can show a real Current Balance next to the static Opening Balance
  // reference field, instead of only ever showing the opening figure. A second round trip because
  // it genuinely depends on allTreasuryAccounts having resolved first (needs the real id list).
  const treasuryBalances = allTreasuryAccounts
    ? Object.fromEntries(await treasuryCurrentBalances(db, allTreasuryAccounts.map((a) => a.id)))
    : {};

  // Same "never show a raw id as the primary label" rule, applied to Money Desk's own pending-
  // approvals list — moneyDeskHome() itself never resolves requestedById to a name for this list
  // (only its single-transaction detail view does), so the Approval Hub would otherwise show a bare
  // cuid here too.
  const moneyDeskPendingApprovalsWithNames = moneyDeskPendingApprovals
    ? await (async () => {
        const requesterIds = [...new Set(moneyDeskPendingApprovals.map((t) => t.requestedById))];
        const requesters = requesterIds.length ? await db.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } }) : [];
        const nameById = new Map(requesters.map((u) => [u.id, u.name ?? u.email]));
        return moneyDeskPendingApprovals.map((t) => ({ ...t, requestedByName: nameById.get(t.requestedById) ?? t.requestedById }));
      })()
    : null;

  // Part A/§9 (same "never show a raw id as the primary label" rule applied to requestedByName
  // above) — resolve each pending Production Order's SKU id to its real product name/code for the
  // Approval Hub, instead of the hub showing a bare cuid.
  const productionOrdersWithProductNames = productionOrdersPendingApproval
    ? await (async () => {
        const skuIds = [...new Set(productionOrdersPendingApproval.map((o) => o.productSkuId))];
        const creatorIds = [...new Set(productionOrdersPendingApproval.map((o) => o.createdById))];
        const [skus, creators] = await Promise.all([
          skuIds.length ? db.seeraSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, productName: true, code: true } }) : Promise.resolve([]),
          creatorIds.length ? db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
        ]);
        const skuById = new Map(skus.map((s) => [s.id, s]));
        const creatorById = new Map(creators.map((u) => [u.id, u.name ?? u.email]));
        return productionOrdersPendingApproval.map((o) => ({ ...o, productName: skuById.get(o.productSkuId)?.productName ?? o.productSkuId, productCode: skuById.get(o.productSkuId)?.code ?? null, createdByName: creatorById.get(o.createdById) ?? o.createdById }));
      })()
    : null;

  return serializeDecimals({ chartOfAccounts, dimensions, treasuryAccounts, allTreasuryAccounts, treasuryBalances, vendors, payables, expenseCategories, pendingExpenseApprovals, recentExpenses, budgets, loans, fixedAssets, capital, openingBalances, approvalPolicies, periods, periodChecklist, trial, pnl, bs, cf, forecast30, gst, periodCode, recurringDue, recurringTemplates, approvalQueue, intelligence, moneyDeskPendingApprovals: moneyDeskPendingApprovalsWithNames, productionOrdersPendingApproval: productionOrdersWithProductNames });
}

export type FinanceWorkspaceData = Awaited<ReturnType<typeof financeWorkspaceData>>;
