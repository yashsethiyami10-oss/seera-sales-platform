"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError, ForbiddenError } from "@/lib/errors";
import { requirePermission, requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { submitExpenseSchema, decideExpenseSchema, listExpensesQuerySchema } from "@/lib/validations/inst-sales";

function serializeExpense<T extends { amount: unknown }>(row: T) {
  return { ...row, amount: Number(row.amount) };
}

/** Module 12 — Approval Workflow: Officer submits → Manager approves/rejects → Founder Visibility (a read scope, not a third state — see schema note near InstExpense). */
export async function submitExpense(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_EXPENSES_SUBMIT);
    const data = submitExpenseSchema.parse(input);
    const expense = await prisma.instExpense.create({ data: { ...data, officerId: principal.id } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "EXPENSE_SUBMITTED", recordType: "InstExpense", recordId: expense.id, newValue: { category: expense.category, amount: Number(expense.amount) } });
    revalidatePath("/os/sales/expenses");
    return { success: true as const, data: serializeExpense(expense) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function decideExpense(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_EXPENSES_APPROVE);
    const data = decideExpenseSchema.parse(input);
    const existing = await prisma.instExpense.findUnique({ where: { id: data.id } });
    if (!existing) throw new NotFoundError("Expense");
    if (existing.status !== "PENDING_MANAGER") throw new ForbiddenError("This expense has already been decided");

    const updated = await prisma.instExpense.update({
      where: { id: data.id },
      data: {
        status: data.approve ? "APPROVED" : "REJECTED",
        approvedById: principal.id, approvedAt: new Date(),
        rejectionReason: data.approve ? null : data.rejectionReason,
      },
    });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: data.approve ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED", recordType: "InstExpense", recordId: data.id });
    revalidatePath("/os/sales/expenses");
    return { success: true as const, data: serializeExpense(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listExpenses(input?: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.INST_EXPENSES_SUBMIT, PERMISSIONS.INST_EXPENSES_APPROVE, PERMISSIONS.INST_EXPENSES_VIEW_ALL);
    const query = listExpensesQuerySchema.parse(input ?? {});
    const canViewAll = principal.isFounder || principal.permissions.has(PERMISSIONS.INST_EXPENSES_VIEW_ALL) || principal.permissions.has(PERMISSIONS.INST_EXPENSES_APPROVE);
    const where = {
      AND: [
        query.officerId ? { officerId: query.officerId } : canViewAll ? {} : { officerId: principal.id },
        query.status ? { status: query.status } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.instExpense.findMany({
        where, orderBy: { expenseDate: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { officer: { select: { name: true } }, approvedBy: { select: { name: true } } },
      }),
      prisma.instExpense.count({ where }),
    ]);
    return { success: true as const, data: { items: items.map(serializeExpense), total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getPendingExpenseApprovalCount() {
  try {
    await requirePermission(PERMISSIONS.INST_EXPENSES_APPROVE);
    const count = await prisma.instExpense.count({ where: { status: "PENDING_MANAGER" } });
    return { success: true as const, data: count };
  } catch (err) {
    return toErrorResponse(err);
  }
}
