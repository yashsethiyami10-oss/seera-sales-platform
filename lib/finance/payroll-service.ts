import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postJournal, postJournalInTx } from "./journal-service";
import { financeNumberFor } from "./numbering";

function parseMonth(month: string): [number, number] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new FoundationError("INVALID_MONTH", "Month must be in YYYY-MM format", 400);
  return [Number(match[1]), Number(match[2])];
}

// approvedTaDa is pulled from SeeraTaClaim (accountsApproved/paid claims for
// this employee in this month) so it is never re-typed by Accounts — the one
// concrete "integrate, don't duplicate" requirement from spec section 23.
export async function createPayrollEntry(db: PrismaClient, actorId: string, input: { employeeId: string; month: string; basicSalary: number; allowances?: number; incentives?: number; reimbursements?: number; deductions?: number; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "expense:create" });
  const [year, monthNum] = parseMonth(input.month);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 1));
  const approvedClaims = await db.seeraTaClaim.aggregate({ where: { employeeId: input.employeeId, status: { in: ["ACCOUNTS_APPROVED", "PAID", "CLOSED"] }, claimDate: { gte: monthStart, lt: monthEnd } }, _sum: { totalApproved: true } });
  const approvedTaDa = Number(approvedClaims._sum.totalApproved ?? 0);
  const allowances = input.allowances ?? 0;
  const incentives = input.incentives ?? 0;
  const reimbursements = input.reimbursements ?? 0;
  const deductions = input.deductions ?? 0;
  const netPayable = input.basicSalary + allowances + incentives + approvedTaDa + reimbursements - deductions;
  const entry = await db.seeraPayrollEntry.upsert({
    where: { employeeId_month: { employeeId: input.employeeId, month: input.month } },
    update: { basicSalary: input.basicSalary, allowances, incentives, approvedTaDa, reimbursements, deductions, netPayable },
    create: { employeeId: input.employeeId, month: input.month, basicSalary: input.basicSalary, allowances, incentives, approvedTaDa, reimbursements, deductions, netPayable, actorId, idempotencyKey: input.idempotencyKey },
  });
  await recordAudit(db, { actorId, action: "finance.payroll.entry_created", entityType: "SeeraPayrollEntry", entityId: entry.id, afterState: { employeeId: input.employeeId, month: input.month, netPayable } });
  return entry;
}

export async function payrollRegister(db: PrismaClient, actorId: string, month: string) {
  await authorize(db, { actorId, permission: "financial_statements:view" });
  return db.seeraPayrollEntry.findMany({ where: { month }, orderBy: { employeeId: "asc" } });
}

// Class B at accrual (Dr Salary expense / Cr Salary Payable), Class C at
// actual payment (Dr Salary Payable / Cr Bank) — two separate postings so the
// expense recognises in the correct accrual month even if paid later.
export async function accruePayrollEntry(db: PrismaClient, actorId: string, entryId: string) {
  await authorize(db, { actorId, permission: "expense:post" });
  const entry = await db.seeraPayrollEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.journalId) throw new FoundationError("PAYROLL_ALREADY_ACCRUED", "This payroll entry was already accrued", 409);
  const [year, monthNum] = parseMonth(entry.month);
  return db.$transaction(async (tx) => {
    const journal = await postJournalInTx(tx, actorId, {
      date: new Date(Date.UTC(year, monthNum - 1, 28)),
      sourceType: "PAYROLL",
      sourceId: entry.id,
      narration: `Payroll accrual ${entry.month} — employee ${entry.employeeId}`,
      idempotencyKey: `${entry.idempotencyKey}:accrual`,
      lines: [
        { accountId: "5040", debit: Number(entry.netPayable), partyType: "EMPLOYEE", partyId: entry.employeeId },
        { accountId: "2030", credit: Number(entry.netPayable), partyType: "EMPLOYEE", partyId: entry.employeeId },
      ],
    });
    const updated = await tx.seeraPayrollEntry.update({ where: { id: entryId }, data: { journalId: journal.id } });
    await recordAudit(tx, { actorId, action: "finance.payroll.accrued", entityType: "SeeraPayrollEntry", entityId: entryId, afterState: { journalId: journal.id } });
    return updated;
  });
}

export async function paySalary(db: PrismaClient, actorId: string, entryId: string, input: { treasuryAccountId: string; treasuryAccountCoaCode: string; paymentDate: Date; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "money_out:record" });
  const entry = await db.seeraPayrollEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (!entry.journalId) throw new FoundationError("PAYROLL_NOT_ACCRUED", "Accrue this payroll entry before paying it", 409);
  if (entry.status === "PAID") throw new FoundationError("PAYROLL_ALREADY_PAID", "This payroll entry is already paid", 409);
  return db.$transaction(async (tx) => {
    await postJournalInTx(tx, actorId, {
      date: input.paymentDate,
      sourceType: "PAYROLL",
      sourceId: entry.id,
      narration: `Salary paid ${entry.month} — employee ${entry.employeeId}`,
      idempotencyKey: input.idempotencyKey,
      lines: [
        { accountId: "2030", debit: Number(entry.netPayable), partyType: "EMPLOYEE", partyId: entry.employeeId },
        { accountId: input.treasuryAccountCoaCode, credit: Number(entry.netPayable), treasuryAccountId: input.treasuryAccountId },
      ],
    });
    const updated = await tx.seeraPayrollEntry.update({ where: { id: entryId }, data: { status: "PAID", paymentDate: input.paymentDate, treasuryAccountId: input.treasuryAccountId } });
    await recordAudit(tx, { actorId, action: "finance.payroll.paid", entityType: "SeeraPayrollEntry", entityId: entryId, afterState: { paymentDate: input.paymentDate } });
    return updated;
  });
}

export const payrollNumber = financeNumberFor;
