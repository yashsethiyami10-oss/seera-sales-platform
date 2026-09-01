import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { createExpense, submitExpense, postExpense } from "./expense-service";
import { resolveExecutiveOperationalScope } from "@/lib/sales-distribution/scope";
import { EXTERNAL_PARTY_PORTAL_ROLE_CODES } from "@/lib/foundation/rbac-catalog";

// SEERA FINANCE OS — QUICK ENTRY: a single, simple entry point ("choose what
// this is for -> amount -> optional receipt -> Save") that still goes
// through the REAL governed lifecycle (createExpense -> submitExpense ->
// postExpense) — this is deliberately NOT a parallel/simplified accounting
// path. What Quick Entry actually removes is everything the everyday user
// shouldn't have to think about: which account a category maps to, which
// treasury account a payment mode resolves to, and whether/when the three
// separate governed steps get chained — never the approval policy itself.

export const QUICK_ENTRY_TYPES = ["EXPENSE", "ADVANCE", "REIMBURSEMENT", "SALARY", "PAYMENT", "OTHER"] as const;
export type QuickEntryType = (typeof QUICK_ENTRY_TYPES)[number];

export async function quickEntryCategories(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  return db.seeraExpenseCategory.findMany({ where: { isActive: true }, orderBy: [{ parentGroup: "asc" }, { name: "asc" }] });
}

// Employee picker (spec Part 8/10) — no Employee master exists (see the
// architecture note at the top of this file's PR), so this searches the SAME
// canonical `User` identity every other Finance record already references by
// id, filtered to active users with at least one active role assignment
// (i.e. someone the app actually treats as staff), never creating or
// duplicating an identity.
export async function searchEmployees(db: PrismaClient, actorId: string, q: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  const query = q.trim();
  if (query.length < 2) return [];
  // Real production bug found via Founder UAT (25-Aug): "at least one active role assignment" also
  // matches Retailer/Distributor/S.S. portal-login accounts (their only role IS that portal role),
  // so a retailer's shop name could be picked as an "employee" for Salary/expense entry. Excludes
  // every external-party portal role; see EXTERNAL_PARTY_PORTAL_ROLE_CODES.
  return db.user.findMany({
    where: {
      status: "ACTIVE",
      roleAssignments: { some: { status: "ACTIVE", role: { code: { notIn: [...EXTERNAL_PARTY_PORTAL_ROLE_CODES] } } } },
      OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }],
    },
    select: { id: true, name: true, email: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { name: true } } }, take: 1, orderBy: { assignedAt: "asc" } } },
    take: 15,
    orderBy: { name: "asc" },
  });
}

async function resolveCategory(db: PrismaClient, actorId: string, input: { categoryId?: string; manualCategoryName?: string; saveManualCategory?: boolean; idempotencyKey: string }) {
  if (input.categoryId) return db.seeraExpenseCategory.findUniqueOrThrow({ where: { id: input.categoryId } });
  const name = input.manualCategoryName?.trim();
  if (!name) throw new FoundationError("CATEGORY_REQUIRED", "Choose a category or type one", 400);
  const existing = await db.seeraExpenseCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return existing;
  // A brand-new manual category always succeeds (never blocks the entry —
  // spec Part 3/25 Test 2) and always posts to the real "5230 Miscellaneous"
  // account, a deliberate, named default — never an invented/random one.
  // Only a Founder/Admin's explicit "save as reusable" request (spec Part 3)
  // makes it visible in future pickers (`isActive: true`); anyone else's
  // manual category still creates the row (so its own ledger/label works —
  // spec Part 5) but stays hidden from the shared picker until promoted.
  const misc = await db.seeraExpenseCategory.findFirstOrThrow({ where: { code: "5230" } });
  let makeReusable = false;
  if (input.saveManualCategory) {
    const permissions = await effectivePermissions(db, actorId);
    makeReusable = permissions.has("coa:manage") || permissions.has("system:super_admin");
  }
  return db.seeraExpenseCategory.create({
    data: {
      code: `MANUAL-${createHash("sha256").update(`${name}:${input.idempotencyKey}`).digest("hex").slice(0, 10).toUpperCase()}`,
      name,
      chartOfAccountId: misc.chartOfAccountId,
      parentGroup: "OTHER",
      isActive: makeReusable,
    },
  });
}

async function resolveTreasuryAccount(db: PrismaClient, input: { paymentMode: string; treasuryAccountId?: string }) {
  if (input.treasuryAccountId) return db.seeraTreasuryAccount.findUniqueOrThrow({ where: { id: input.treasuryAccountId } });
  if (input.paymentMode === "CASH") {
    const cash = await db.seeraTreasuryAccount.findFirst({ where: { kind: "CASH", isActive: true } });
    if (!cash) throw new FoundationError("NO_CASH_ACCOUNT", "No active Cash account is configured — ask a Founder/Admin to set one up in Treasury", 409);
    return cash;
  }
  if (input.paymentMode === "BANK" || input.paymentMode === "UPI") {
    const banks = await db.seeraTreasuryAccount.findMany({ where: { kind: "BANK", isActive: true } });
    if (banks.length === 0) throw new FoundationError("NO_BANK_ACCOUNT", "No active Bank account is configured — ask a Founder/Admin to set one up in Treasury", 409);
    if (banks.length > 1) throw new FoundationError("BANK_ACCOUNT_REQUIRED", "More than one bank account exists — select which one this was paid/received via", 400);
    return banks[0]!;
  }
  throw new FoundationError("TREASURY_ACCOUNT_REQUIRED", "Select an account for this payment mode", 400);
}

// Territory auto-derivation (Money Desk maturity pass, 23-Aug): "do not ask Accounts to reselect
// information the source already knows" — when the entry names an employee and no territory was
// explicitly chosen, derive it from that employee's OWN governed Territory assignment (the SAME
// resolver Beat Planner/Manager Retailing already use — see scope.ts's comment on the Manoj/
// Bhilwara <-> Neeraj/Jhansi leak this fixed elsewhere). An explicit `territoryId` on the input
// always wins (governed override — audited via createExpense's own recordAudit afterState, same as
// every other Quick Entry field). An employee with zero/multiple/unrestricted territory scope, or
// no employee at all, correctly resolves to `undefined` — a real Corporate/central expense, never
// guessed.
async function resolveExpenseTerritory(db: PrismaClient, input: { territoryId?: string; employeeId?: string }): Promise<string | undefined> {
  if (input.territoryId) return input.territoryId;
  if (!input.employeeId) return undefined;
  const scope = await resolveExecutiveOperationalScope(db, input.employeeId);
  if (scope.unrestricted || scope.territoryIds.length !== 1) return undefined;
  return scope.territoryIds[0];
}

export async function quickEntryCreate(
  db: PrismaClient,
  actorId: string,
  input: {
    entryType: QuickEntryType;
    date: Date;
    amount: number;
    categoryId?: string;
    manualCategoryName?: string;
    saveManualCategory?: boolean;
    paymentMode: "CASH" | "BANK" | "UPI" | "OTHER";
    treasuryAccountId?: string;
    partyType?: string;
    partyId?: string;
    partyName?: string;
    employeeId?: string;
    territoryId?: string;
    remark?: string;
    documentFileId?: string;
    // Internal-only Money Desk flag. Honored only for an actor with system:super_admin;
    // the public quick-entry API does not expose this as a policy bypass.
    finalizeForFounder?: boolean;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "expense:create" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);

  const category = await resolveCategory(db, actorId, input);
  if (category.requiresParty && !input.partyName && !input.partyId && !input.employeeId)
    throw new FoundationError("PARTY_REQUIRED", `"${category.name}" requires a party/person`, 400);
  if (category.receiptPolicy === "REQUIRED" && !input.documentFileId)
    throw new FoundationError("RECEIPT_REQUIRED", `"${category.name}" requires a receipt/document`, 400);

  const treasuryAccount = await resolveTreasuryAccount(db, input);
  const treasuryCoa = await db.seeraChartOfAccount.findUniqueOrThrow({ where: { id: treasuryAccount.chartOfAccountId } });
  const territoryId = await resolveExpenseTerritory(db, input);

  const label = ENTRY_TYPE_LABEL[input.entryType];
  const expense = await createExpense(db, actorId, {
    date: input.date,
    amount: input.amount,
    payeeType: input.partyType ?? (input.employeeId ? "EMPLOYEE" : "OTHER"),
    payeeId: input.partyId ?? input.employeeId,
    payeeName: input.partyName,
    categoryId: category.id,
    territoryId,
    paymentMode: input.paymentMode,
    treasuryAccountId: treasuryAccount.id,
    description: [label, category.name, input.remark].filter(Boolean).join(" — "),
    documentFileId: input.documentFileId,
    isReimbursable: input.entryType === "REIMBURSEMENT",
    employeeId: input.employeeId,
    entryType: input.entryType,
    idempotencyKey: input.idempotencyKey,
  });

  const permissions = await effectivePermissions(db, actorId);
  // A Founder is the final authority. Money Desk may explicitly request Founder-finalization,
  // but only the system:super_admin permission can activate it. Normal Quick Entry continues
  // through the existing approval-policy engine unchanged.
  const submitted = input.finalizeForFounder && permissions.has("system:super_admin")
    ? await db.seeraExpense.update({ where: { id: expense.id }, data: { status: "APPROVED" } }).then(async (updated) => {
        await recordAudit(db, {
          actorId,
          action: "finance.expense.founder_finalized",
          entityType: "SeeraExpense",
          entityId: expense.id,
          afterState: { status: "APPROVED", approvalBypass: "FOUNDER_FINAL_AUTHORITY" },
        });
        return updated;
      })
    : await submitExpense(db, actorId, expense.id);
  if (submitted.status !== "APPROVED") return { expense: submitted, category, treasuryAccount };
  if (!permissions.has("expense:post") && !permissions.has("system:super_admin")) return { expense: submitted, category, treasuryAccount };

  const posted = await postExpense(db, actorId, expense.id, { paidNow: true, treasuryAccountId: treasuryAccount.id, treasuryAccountCoaCode: treasuryCoa.code });
  return { expense: posted, category, treasuryAccount };
}

const ENTRY_TYPE_LABEL: Record<QuickEntryType, string> = {
  EXPENSE: "Expense",
  ADVANCE: "Advance",
  REIMBURSEMENT: "Reimbursement",
  SALARY: "Salary",
  PAYMENT: "Payment",
  OTHER: "Other",
};

// Category ledger (spec Part 5/6): every entry under one category, with the
// period totals the Founder asked for. `period` is resolved by the caller
// (API route) into an explicit {from, to} so this stays a pure query.
export async function categoryLedger(
  db: PrismaClient,
  actorId: string,
  input: { categoryId: string; from?: Date; to?: Date; entryType?: string; employeeId?: string; paymentMode?: string; entered_by?: string },
) {
  await authorize(db, { actorId, permission: "expense:create" });
  const where = {
    categoryId: input.categoryId,
    ...(input.from || input.to ? { date: { gte: input.from, lte: input.to } } : {}),
    ...(input.entryType ? { entryType: input.entryType } : {}),
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
    ...(input.entered_by ? { requestedById: input.entered_by } : {}),
    status: { not: "REJECTED" as const },
  };
  const [category, entries, totalToday, totalMonth, totalYear] = await Promise.all([
    db.seeraExpenseCategory.findUniqueOrThrow({ where: { id: input.categoryId } }),
    db.seeraExpense.findMany({ where, orderBy: { date: "desc" }, take: 200 }),
    sumExpenses(db, input.categoryId, startOfDay(new Date())),
    sumExpenses(db, input.categoryId, startOfMonth(new Date())),
    sumExpenses(db, input.categoryId, startOfYear(new Date())),
  ]);
  return { category, entries, totals: { today: totalToday, thisMonth: totalMonth, thisYear: totalYear } };
}
async function sumExpenses(db: PrismaClient, categoryId: string, from: Date) {
  const result = await db.seeraExpense.aggregate({ where: { categoryId, date: { gte: from }, status: { not: "REJECTED" } }, _sum: { amount: true } });
  return Number(result._sum.amount ?? 0);
}
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1); }

// Employee Financial 360 (spec Part 8): every Expense-family entry
// (Salary/Advance/Reimbursement/Incentive/Bonus/etc., anything with this
// employeeId) plus the Payroll register, in one read — the "one click" view.
export async function employeeFinancial360(db: PrismaClient, actorId: string, employeeId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  const [employee, entries, payroll] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, name: true, email: true, status: true, roleAssignments: { where: { status: "ACTIVE" }, select: { role: { select: { name: true, code: true } } }, orderBy: { assignedAt: "asc" }, take: 1 } } }),
    db.seeraExpense.findMany({ where: { employeeId, status: { not: "REJECTED" } }, orderBy: { date: "desc" }, take: 200 }),
    db.seeraPayrollEntry.findMany({ where: { employeeId }, orderBy: { month: "desc" }, take: 24 }),
  ]);
  const startOfThisMonth = startOfMonth(new Date());
  const sumBy = (type: string, since?: Date) =>
    entries.filter((e) => e.entryType === type && (!since || e.date >= since)).reduce((sum, e) => sum + Number(e.amount), 0);
  const summary = {
    salaryPaidThisMonth: entries.filter((e) => e.entryType === "SALARY" && e.status === "POSTED" && e.date >= startOfThisMonth).reduce((s, e) => s + Number(e.amount), 0),
    advanceBalance: sumBy("ADVANCE") - sumBy("REIMBURSEMENT"), // simple net-outstanding view for the summary card, not a formal ledger reconciliation
    reimbursementPending: entries.filter((e) => e.entryType === "REIMBURSEMENT" && (e.status === "DRAFT" || e.status === "SUBMITTED" || e.status === "APPROVED")).reduce((s, e) => s + Number(e.amount), 0),
    reimbursementPaid: entries.filter((e) => e.entryType === "REIMBURSEMENT" && e.status === "POSTED").reduce((s, e) => s + Number(e.amount), 0),
    incentiveThisYear: sumBy("OTHER", startOfYear(new Date())), // incentives/bonus currently land under manual categories mapped to 5050 — grouped by category name at the UI layer, not a distinct entryType
    otherPaymentsThisMonth: entries.filter((e) => !["SALARY", "ADVANCE", "REIMBURSEMENT"].includes(e.entryType) && e.date >= startOfThisMonth).reduce((s, e) => s + Number(e.amount), 0),
  };
  return { employee, entries, payroll, summary };
}
