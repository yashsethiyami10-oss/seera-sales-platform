import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// The governed baseline Chart of Accounts from the Finance OS spec (section 8).
// isSystemAccount rows are the control accounts every auto-posting journal in
// this module targets by code — they can be renamed but never deleted/retyped.
// Everything else (additional expense categories etc.) is Founder/Accounts
// configurable via createAccount() without touching posting logic, per the
// "accounts configurable, business logic must not depend on labels" rule.
const DEFAULT_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"; system?: boolean; parentCode?: string }[] = [
  // ASSETS
  { code: "1000", name: "Bank", type: "ASSET", system: true },
  { code: "1010", name: "Cash", type: "ASSET", system: true },
  { code: "1100", name: "Trade Receivables", type: "ASSET", system: true },
  { code: "1300", name: "Advances (Employee/Vendor)", type: "ASSET", system: true },
  { code: "1310", name: "Deposits", type: "ASSET" },
  { code: "1401", name: "Input CGST", type: "ASSET", system: true },
  { code: "1402", name: "Input SGST", type: "ASSET", system: true },
  { code: "1403", name: "Input IGST", type: "ASSET", system: true },
  { code: "1500", name: "Other Current Assets", type: "ASSET" },
  { code: "1600", name: "Fixed Assets", type: "ASSET", system: true },
  { code: "1610", name: "Accumulated Depreciation", type: "ASSET", system: true },
  { code: "1700", name: "Other Assets", type: "ASSET" },
  // LIABILITIES
  { code: "2000", name: "Trade Payables", type: "LIABILITY", system: true },
  { code: "2010", name: "Customer Advances", type: "LIABILITY", system: true },
  { code: "2021", name: "Output CGST Payable", type: "LIABILITY", system: true },
  { code: "2022", name: "Output SGST Payable", type: "LIABILITY", system: true },
  { code: "2023", name: "Output IGST Payable", type: "LIABILITY", system: true },
  { code: "2030", name: "Salary Payable", type: "LIABILITY", system: true },
  { code: "2040", name: "Expense Payable", type: "LIABILITY", system: true },
  { code: "2050", name: "Loans", type: "LIABILITY", system: true },
  { code: "2060", name: "Accrued Liabilities", type: "LIABILITY" },
  { code: "2070", name: "Other Liabilities", type: "LIABILITY" },
  // EQUITY
  { code: "3000", name: "Founder / Owner Capital", type: "EQUITY", system: true },
  { code: "3010", name: "Drawings", type: "EQUITY", system: true },
  { code: "3020", name: "Retained Earnings", type: "EQUITY", system: true },
  // INCOME
  { code: "4000", name: "Company Sales", type: "INCOME", system: true },
  { code: "4010", name: "Other Operating Revenue", type: "INCOME" },
  { code: "4020", name: "Other Income", type: "INCOME", system: true },
  // EXPENSE
  { code: "5000", name: "Raw Material", type: "EXPENSE" },
  { code: "5010", name: "Packaging Material", type: "EXPENSE" },
  { code: "5020", name: "Freight", type: "EXPENSE" },
  { code: "5030", name: "Warehousing", type: "EXPENSE" },
  { code: "5040", name: "Salary", type: "EXPENSE", system: true },
  { code: "5050", name: "Incentives", type: "EXPENSE" },
  { code: "5060", name: "TA/DA", type: "EXPENSE", system: true },
  { code: "5070", name: "Marketing", type: "EXPENSE" },
  { code: "5080", name: "Advertising", type: "EXPENSE" },
  { code: "5090", name: "Influencer", type: "EXPENSE" },
  { code: "5100", name: "Sampling", type: "EXPENSE" },
  { code: "5110", name: "Marketplace", type: "EXPENSE" },
  { code: "5120", name: "Software", type: "EXPENSE" },
  { code: "5130", name: "Rent", type: "EXPENSE" },
  { code: "5140", name: "Electricity", type: "EXPENSE" },
  { code: "5150", name: "Internet/Phone", type: "EXPENSE" },
  { code: "5160", name: "Professional Fees", type: "EXPENSE" },
  { code: "5170", name: "Banking Charges", type: "EXPENSE" },
  { code: "5180", name: "Interest", type: "EXPENSE", system: true },
  { code: "5190", name: "Repairs", type: "EXPENSE" },
  { code: "5200", name: "Logistics", type: "EXPENSE" },
  { code: "5210", name: "Travel", type: "EXPENSE" },
  { code: "5220", name: "Office/Admin", type: "EXPENSE" },
  { code: "5230", name: "Miscellaneous", type: "EXPENSE", system: true },
];

export async function seedDefaultChartOfAccounts(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const results = [];
  for (const account of DEFAULT_ACCOUNTS) {
    results.push(
      await db.seeraChartOfAccount.upsert({
        where: { code: account.code },
        update: {},
        create: { code: account.code, name: account.name, type: account.type, isSystemAccount: account.system ?? false, parentCode: account.parentCode },
      }),
    );
  }
  const categoryResults = [];
  for (const category of EXPENSE_CATEGORY_MAP) {
    categoryResults.push(
      await db.seeraExpenseCategory.upsert({ where: { code: category.code }, update: {}, create: category }),
    );
  }
  await recordAudit(db, { actorId, action: "finance.coa.seeded", entityType: "SeeraChartOfAccount", entityId: "bulk", afterState: { accounts: results.length, categories: categoryResults.length } });
  return { accounts: results, categories: categoryResults };
}

// One category per default expense account so Expense entry always has a
// ready-made category->account mapping (spec section 8/21) without forcing a
// second manual setup step before Accounts can record their first expense.
const EXPENSE_CATEGORY_MAP = DEFAULT_ACCOUNTS.filter((a) => a.type === "EXPENSE").map((a) => ({ code: a.code, name: a.name, chartOfAccountId: a.code }));

export async function createAccount(db: PrismaClient, actorId: string, input: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"; parentCode?: string }) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const existing = await db.seeraChartOfAccount.findUnique({ where: { code: input.code } });
  if (existing) throw new FoundationError("ACCOUNT_CODE_EXISTS", "An account with this code already exists", 409);
  const account = await db.seeraChartOfAccount.create({ data: { code: input.code, name: input.name, type: input.type, parentCode: input.parentCode } });
  await recordAudit(db, { actorId, action: "finance.coa.created", entityType: "SeeraChartOfAccount", entityId: account.id, afterState: { code: account.code, name: account.name, type: account.type } });
  return account;
}

export async function updateAccount(db: PrismaClient, actorId: string, accountId: string, input: { name?: string; isActive?: boolean; parentCode?: string }) {
  await authorize(db, { actorId, permission: "coa:manage" });
  const before = await db.seeraChartOfAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (before.isSystemAccount && input.isActive === false) throw new FoundationError("SYSTEM_ACCOUNT_PROTECTED", "A system control account cannot be deactivated", 409);
  const after = await db.seeraChartOfAccount.update({ where: { id: accountId }, data: input });
  await recordAudit(db, { actorId, action: "finance.coa.updated", entityType: "SeeraChartOfAccount", entityId: accountId, beforeState: { name: before.name, isActive: before.isActive }, afterState: { name: after.name, isActive: after.isActive } });
  return after;
}

export async function listAccounts(db: PrismaClient, actorId: string, input?: { type?: string; activeOnly?: boolean }) {
  await authorize(db, { actorId, permission: "gl:view" });
  return db.seeraChartOfAccount.findMany({ where: { type: input?.type as never, isActive: input?.activeOnly ? true : undefined }, orderBy: { code: "asc" } });
}

export async function accountByCode(db: PrismaClient, code: string) {
  const account = await db.seeraChartOfAccount.findUnique({ where: { code } });
  if (!account) throw new FoundationError("SYSTEM_ACCOUNT_MISSING", `Required control account ${code} is not configured — run Chart of Accounts setup`, 500);
  return account;
}
