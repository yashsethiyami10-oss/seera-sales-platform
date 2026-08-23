import type { ExpenseStatus, Prisma, PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal, postJournalInTx } from "./journal-service";
import { financeNumberFor } from "./numbering";
import { requestFinanceApproval } from "./approval-policy-service";

export async function createExpenseCategory(db: PrismaClient, actorId: string, input: { code: string; name: string; chartOfAccountId: string }) {
  await authorize(db, { actorId, permission: "coa:manage" });
  return db.seeraExpenseCategory.create({ data: input });
}

export async function listExpenseCategories(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  return db.seeraExpenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

// DRAFT -> SUBMITTED -> APPROVED -> POSTED (paidNow decides whether POSTED
// happens immediately after approval or leaves an Expense Payable liability
// for a later Money Out / Vendor-style payment) -> REVERSED. Matches the
// Class B/C distinction from spec section 3: submission/approval is non-cash
// governance, posting is the accounting effect, payment is the cash effect.
export async function createExpense(
  db: PrismaClient,
  actorId: string,
  input: { date: Date; amount: number; payeeType: string; payeeId?: string; payeeName?: string; categoryId: string; dimensionId?: string; territoryId?: string; paymentMode: string; treasuryAccountId?: string; gstTreatment?: string; description?: string; documentFileId?: string; isReimbursable?: boolean; employeeId?: string; entryType?: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "expense:create" });
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  const expense = await db.seeraExpense.create({
    data: { expenseNumber: financeNumberFor("EXP", input.idempotencyKey), date: input.date, amount: input.amount, payeeType: input.payeeType, payeeId: input.payeeId, payeeName: input.payeeName, categoryId: input.categoryId, dimensionId: input.dimensionId, territoryId: input.territoryId, paymentMode: input.paymentMode, treasuryAccountId: input.treasuryAccountId, gstTreatment: input.gstTreatment ?? "NONE", description: input.description, documentFileId: input.documentFileId, isReimbursable: input.isReimbursable ?? false, employeeId: input.employeeId, entryType: input.entryType ?? "EXPENSE", status: "DRAFT", requestedById: actorId, idempotencyKey: input.idempotencyKey },
  });
  await recordAudit(db, { actorId, action: "finance.expense.created", entityType: "SeeraExpense", entityId: expense.id, afterState: { amount: input.amount, categoryId: input.categoryId } });
  return expense;
}

export async function submitExpense(db: PrismaClient, actorId: string, expenseId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  const expense = await db.seeraExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.status !== "DRAFT") throw new FoundationError("EXPENSE_NOT_DRAFT", "Only a draft expense can be submitted", 409);
  const requiresApproval = await requestFinanceApproval(db, actorId, { category: "EXPENSE", entityType: "SeeraExpense", entityId: expense.id, amount: Number(expense.amount), reason: expense.description ?? expense.expenseNumber });
  const updated = await db.seeraExpense.update({ where: { id: expenseId }, data: { status: requiresApproval ? "SUBMITTED" : "APPROVED" } });
  await recordAudit(db, { actorId, action: "finance.expense.submitted", entityType: "SeeraExpense", entityId: expenseId, afterState: { status: updated.status, requiresApproval } });
  return updated;
}

export async function decideExpense(db: PrismaClient, actorId: string, expenseId: string, input: { decision: "APPROVED" | "REJECTED"; reason: string }) {
  await authorize(db, { actorId, permission: "expense:approve" });
  const expense = await db.seeraExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.status !== "SUBMITTED") throw new FoundationError("EXPENSE_NOT_SUBMITTED", "Only a submitted expense can be decided", 409);
  const status: ExpenseStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  return db.$transaction(async (tx) => {
    const updated = await tx.seeraExpense.update({ where: { id: expenseId }, data: { status, approvedById: actorId, approvalReason: input.reason } });
    // Resolve the matching approval-queue entry (created by submitExpense's
    // requestFinanceApproval) so it never sits PENDING forever after the
    // expense itself has already been decided — the Expense record and the
    // generic SeeraApprovalItem queue must not diverge.
    await tx.seeraApprovalItem.updateMany({
      where: { type: "FINANCE_EXPENSE", entityType: "SeeraExpense", entityId: expenseId, status: "PENDING" },
      data: { status: input.decision, decision: { decision: input.decision } as Prisma.InputJsonValue, reason: input.reason, decidedById: actorId, decidedAt: new Date() },
    });
    await recordAudit(tx, { actorId, action: "finance.expense.decided", entityType: "SeeraExpense", entityId: expenseId, afterState: { status, reason: input.reason } });
    return updated;
  });
}

export async function postExpense(db: PrismaClient, actorId: string, expenseId: string, input: { paidNow: boolean; treasuryAccountId?: string; treasuryAccountCoaCode?: string }) {
  await authorize(db, { actorId, permission: "expense:post" });
  const expense = await db.seeraExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.status !== "APPROVED") throw new FoundationError("EXPENSE_NOT_APPROVED", "Only an approved expense can be posted", 409);
  const category = await db.seeraExpenseCategory.findUniqueOrThrow({ where: { id: expense.categoryId } });

  return db.$transaction(async (tx) => {
    const lines = input.paidNow
      ? [
          { accountId: category.chartOfAccountId, debit: Number(expense.amount), dimensionId: expense.dimensionId ?? undefined, description: expense.description ?? undefined },
          { accountId: input.treasuryAccountCoaCode!, credit: Number(expense.amount), treasuryAccountId: input.treasuryAccountId, description: expense.description ?? undefined },
        ]
      : [
          { accountId: category.chartOfAccountId, debit: Number(expense.amount), dimensionId: expense.dimensionId ?? undefined, description: expense.description ?? undefined },
          { accountId: "2040", credit: Number(expense.amount), partyType: expense.payeeType, partyId: expense.payeeId ?? undefined, description: expense.description ?? undefined },
        ];
    const journal = await postJournalInTx(tx, actorId, { date: expense.date, sourceType: "EXPENSE", sourceId: expense.id, narration: `Expense ${expense.expenseNumber} — ${category.name}`, idempotencyKey: `${expense.idempotencyKey}:journal`, lines });
    const updated = await tx.seeraExpense.update({ where: { id: expenseId }, data: { status: "POSTED", journalId: journal.id, treasuryAccountId: input.paidNow ? input.treasuryAccountId : expense.treasuryAccountId } });
    await recordAudit(tx, { actorId, action: "finance.expense.posted", entityType: "SeeraExpense", entityId: expenseId, afterState: { paidNow: input.paidNow, journalId: journal.id } });
    return updated;
  });
}

// Settles an unpaid (Expense Payable) expense once cash actually moves —
// Class D settlement, does not touch the expense account a second time.
export async function payExpensePayable(db: PrismaClient, actorId: string, expenseId: string, input: { treasuryAccountId: string; treasuryAccountCoaCode: string; paymentDate: Date; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "money_out:record" });
  const expense = await db.seeraExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.status !== "POSTED" || expense.treasuryAccountId) throw new FoundationError("EXPENSE_NOT_PAYABLE", "Expense is not an outstanding payable", 409);
  return postJournal(db, actorId, {
    date: input.paymentDate,
    sourceType: "EXPENSE",
    sourceId: expense.id,
    narration: `Expense payable settled — ${expense.expenseNumber}`,
    idempotencyKey: input.idempotencyKey,
    lines: [
      { accountId: "2040", debit: Number(expense.amount), partyType: expense.payeeType, partyId: expense.payeeId ?? undefined },
      { accountId: input.treasuryAccountCoaCode, credit: Number(expense.amount), treasuryAccountId: input.treasuryAccountId },
    ],
  });
}

export async function reverseExpense(db: PrismaClient, actorId: string, expenseId: string, reason: string) {
  const permissions = await effectivePermissions(db, actorId);
  if (!permissions.has("expense:post") && !permissions.has("system:super_admin")) throw new FoundationError("ACCESS_DENIED", "Expense reversal authority required", 403);
  const expense = await db.seeraExpense.findUniqueOrThrow({ where: { id: expenseId } });
  if (expense.status !== "POSTED" || !expense.journalId) throw new FoundationError("EXPENSE_NOT_POSTED", "Only a posted expense can be reversed", 409);
  const { reverseJournal } = await import("./journal-service");
  await reverseJournal(db, actorId, expense.journalId, { reason, idempotencyKey: `${expense.idempotencyKey}:reversal`, approverId: actorId });
  const updated = await db.seeraExpense.update({ where: { id: expenseId }, data: { status: "REVERSED" } });
  await recordAudit(db, { actorId, action: "finance.expense.reversed", entityType: "SeeraExpense", entityId: expenseId, afterState: { reason } });
  return updated;
}

export async function expensesPendingApproval(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "expense:approve" });
  return db.seeraExpense.findMany({ where: { status: "SUBMITTED" }, orderBy: { date: "asc" } });
}

export async function listRecentExpenses(db: PrismaClient, actorId: string, limit = 50) {
  await authorize(db, { actorId, permission: "expense:create" });
  return db.seeraExpense.findMany({ orderBy: { date: "desc" }, take: limit });
}

// --- Recurring expense templates (spec section 22) --------------------------

export async function createRecurringExpenseTemplate(db: PrismaClient, actorId: string, input: { name: string; categoryId: string; payeeName?: string; expectedAmount: number; frequency: string; nextDueDate: Date }) {
  await authorize(db, { actorId, permission: "expense:create" });
  const template = await db.seeraRecurringExpenseTemplate.create({ data: input });
  await recordAudit(db, { actorId, action: "finance.recurring_expense.created", entityType: "SeeraRecurringExpenseTemplate", entityId: template.id, afterState: input });
  return template;
}

export async function listRecurringExpensesDue(db: PrismaClient, actorId: string, asOf: Date) {
  await authorize(db, { actorId, permission: "expense:create" });
  return db.seeraRecurringExpenseTemplate.findMany({ where: { isActive: true, nextDueDate: { lte: asOf } }, orderBy: { nextDueDate: "asc" } });
}

// Recurring templates never silently post (spec section 22) — this only
// creates the DRAFT expense for a human to review/submit, and advances the
// template's next due date so the same reminder doesn't repeat.
export async function generateExpenseFromRecurringTemplate(db: PrismaClient, actorId: string, templateId: string, idempotencyKey: string) {
  const template = await db.seeraRecurringExpenseTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const expense = await createExpense(db, actorId, { date: template.nextDueDate, amount: Number(template.expectedAmount), payeeType: "VENDOR", payeeName: template.payeeName ?? undefined, categoryId: template.categoryId, paymentMode: "BANK_TRANSFER", description: `Recurring: ${template.name}`, idempotencyKey });
  const nextDueDate = advanceByFrequency(template.nextDueDate, template.frequency);
  await db.seeraRecurringExpenseTemplate.update({ where: { id: templateId }, data: { nextDueDate } });
  return expense;
}

export async function skipRecurringOccurrence(db: PrismaClient, actorId: string, templateId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  const template = await db.seeraRecurringExpenseTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const nextDueDate = advanceByFrequency(template.nextDueDate, template.frequency);
  const updated = await db.seeraRecurringExpenseTemplate.update({ where: { id: templateId }, data: { nextDueDate } });
  await recordAudit(db, { actorId, action: "finance.recurring_expense.skipped", entityType: "SeeraRecurringExpenseTemplate", entityId: templateId, afterState: { nextDueDate } });
  return updated;
}

export async function setRecurringTemplateActive(db: PrismaClient, actorId: string, templateId: string, isActive: boolean) {
  await authorize(db, { actorId, permission: "expense:create" });
  const updated = await db.seeraRecurringExpenseTemplate.update({ where: { id: templateId }, data: { isActive } });
  await recordAudit(db, { actorId, action: isActive ? "finance.recurring_expense.reactivated" : "finance.recurring_expense.deactivated", entityType: "SeeraRecurringExpenseTemplate", entityId: templateId, afterState: { isActive } });
  return updated;
}

export async function listRecurringTemplates(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "expense:create" });
  return db.seeraRecurringExpenseTemplate.findMany({ orderBy: { nextDueDate: "asc" } });
}

function advanceByFrequency(date: Date, frequency: string): Date {
  const next = new Date(date);
  if (frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === "QUARTERLY") next.setUTCMonth(next.getUTCMonth() + 3);
  else if (frequency === "ANNUAL") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1); // MONTHLY default
  return next;
}
