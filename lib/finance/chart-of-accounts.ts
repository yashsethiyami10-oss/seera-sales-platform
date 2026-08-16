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
  { code: "1210", name: "Raw Material Inventory", type: "ASSET", system: true },
  { code: "1220", name: "Packaging Inventory", type: "ASSET", system: true },
  { code: "1230", name: "WIP / Finished Goods Inventory", type: "ASSET", system: true },
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
  // Deliberately its own dedicated account (not folded into "5000 Raw
  // Material") — profitAndLoss() in statements-service.ts special-cases this
  // exact code to compute a real Gross Profit line, per Manufacturing OS
  // integration spec §17.
  { code: "5001", name: "Cost of Goods Sold (COGS)", type: "EXPENSE", system: true },
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
  { code: "5240", name: "Manufacturing Variance / Wastage", type: "EXPENSE", system: true },
  // FINANCE QUICK ENTRY: a small, deliberately modest set of new accounts —
  // added only where the Founder's requested category list (spec Part 3)
  // names a genuinely distinct expense nature not already covered by an
  // existing account above. Everything else in that list maps onto an
  // account that already exists (see QUICK_ENTRY_CATEGORY_MAP below) rather
  // than growing the Chart of Accounts 1:1 with every category label.
  { code: "5021", name: "Vehicle Running & Fuel", type: "EXPENSE" },
  { code: "5022", name: "Loading, Unloading & Courier", type: "EXPENSE" },
  { code: "5032", name: "Factory Operating Expense", type: "EXPENSE" },
  { code: "5041", name: "Wages & Labour", type: "EXPENSE" },
  { code: "5053", name: "Staff Reimbursement", type: "EXPENSE" },
  { code: "5071", name: "Commission", type: "EXPENSE" },
];

// FINANCE QUICK ENTRY: the Founder's requested everyday category list (spec
// Part 3), each mapped to an existing-or-newly-added account above. A
// category name intentionally reuses an existing account wherever one
// already fits — e.g. "Petrol" and "Vehicle Repair" both post to the same
// 5021 Vehicle Running & Fuel account, but remain distinct CATEGORY rows so
// Quick Entry's category ledgers (Part 5) still separate them. "Staff
// Advance" maps to 1300 (an ASSET, not an expense) — giving an employee an
// advance is correctly Dr Advances-to-Employee / Cr Cash, not an expense,
// exactly the same double-entry effect postExpense() already produces for
// any category regardless of the mapped account's type. "Loan Repayment"
// maps to 2050 (a LIABILITY) for the same reason — principal repayment
// reduces the loan balance, it is not a P&L expense.
const QUICK_ENTRY_CATEGORIES: { code: string; name: string; accountCode: string; parentGroup: string; requiresParty?: boolean; receiptPolicy?: "OPTIONAL" | "RECOMMENDED" | "REQUIRED" }[] = [
  // TRANSPORT / LOGISTICS
  { code: "QE-DIESEL", name: "Diesel", accountCode: "5021", parentGroup: "TRANSPORT_LOGISTICS", receiptPolicy: "RECOMMENDED" },
  { code: "QE-PETROL", name: "Petrol", accountCode: "5021", parentGroup: "TRANSPORT_LOGISTICS", receiptPolicy: "RECOMMENDED" },
  { code: "QE-VEHICLE-REPAIR", name: "Vehicle Repair", accountCode: "5021", parentGroup: "TRANSPORT_LOGISTICS", receiptPolicy: "RECOMMENDED" },
  { code: "QE-TOLL", name: "Toll", accountCode: "5021", parentGroup: "TRANSPORT_LOGISTICS" },
  { code: "QE-LOADING", name: "Loading", accountCode: "5022", parentGroup: "TRANSPORT_LOGISTICS" },
  { code: "QE-UNLOADING", name: "Unloading", accountCode: "5022", parentGroup: "TRANSPORT_LOGISTICS" },
  { code: "QE-COURIER", name: "Courier", accountCode: "5022", parentGroup: "TRANSPORT_LOGISTICS" },
  // FACTORY
  { code: "QE-FACTORY-EXPENSE", name: "Factory Expense", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-WATER", name: "Water", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-MAINTENANCE", name: "Maintenance", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-MACHINE-REPAIR", name: "Machine Repair", accountCode: "5032", parentGroup: "FACTORY", receiptPolicy: "RECOMMENDED" },
  { code: "QE-CONSUMABLES", name: "Consumables", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-CLEANING", name: "Cleaning", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-PACKING-EXPENSE", name: "Packing Expense", accountCode: "5032", parentGroup: "FACTORY" },
  { code: "QE-FACTORY-RENT", name: "Factory Rent", accountCode: "5130", parentGroup: "FACTORY", receiptPolicy: "RECOMMENDED" },
  // LABOUR / STAFF
  { code: "QE-LABOUR", name: "Labour", accountCode: "5041", parentGroup: "LABOUR_STAFF", requiresParty: true },
  { code: "QE-WAGES", name: "Wages", accountCode: "5041", parentGroup: "LABOUR_STAFF", requiresParty: true },
  { code: "QE-OVERTIME", name: "Overtime", accountCode: "5041", parentGroup: "LABOUR_STAFF", requiresParty: true },
  { code: "QE-STAFF-ADVANCE", name: "Staff Advance", accountCode: "1300", parentGroup: "LABOUR_STAFF", requiresParty: true },
  { code: "QE-STAFF-REIMBURSEMENT", name: "Staff Reimbursement", accountCode: "5053", parentGroup: "LABOUR_STAFF", requiresParty: true, receiptPolicy: "RECOMMENDED" },
  { code: "QE-BONUS", name: "Bonus", accountCode: "5050", parentGroup: "LABOUR_STAFF", requiresParty: true },
  // ADMIN / OFFICE
  { code: "QE-OFFICE-EXPENSE", name: "Office Expense", accountCode: "5220", parentGroup: "ADMIN_OFFICE" },
  { code: "QE-OFFICE-RENT", name: "Office Rent", accountCode: "5130", parentGroup: "ADMIN_OFFICE", receiptPolicy: "RECOMMENDED" },
  { code: "QE-STATIONERY", name: "Stationery", accountCode: "5220", parentGroup: "ADMIN_OFFICE" },
  { code: "QE-MOBILE", name: "Mobile", accountCode: "5150", parentGroup: "ADMIN_OFFICE" },
  // SALES / MARKETING
  { code: "QE-SALES-ALLOWANCE", name: "Sales Allowance", accountCode: "5210", parentGroup: "SALES_MARKETING", requiresParty: true },
  { code: "QE-SAMPLE-EXPENSE", name: "Sample Expense", accountCode: "5100", parentGroup: "SALES_MARKETING" },
  { code: "QE-PROMOTION", name: "Promotion", accountCode: "5070", parentGroup: "SALES_MARKETING" },
  { code: "QE-COMMISSION", name: "Commission", accountCode: "5071", parentGroup: "SALES_MARKETING", requiresParty: true },
  // PURCHASE / OPERATIONS
  { code: "QE-REPAIR", name: "Repair", accountCode: "5190", parentGroup: "PURCHASE_OPERATIONS" },
  { code: "QE-MISC-PURCHASE", name: "Miscellaneous Purchase", accountCode: "5230", parentGroup: "PURCHASE_OPERATIONS" },
  // FINANCE
  { code: "QE-LOAN-REPAYMENT", name: "Loan Repayment", accountCode: "2050", parentGroup: "FINANCE", receiptPolicy: "REQUIRED" },
  { code: "QE-OTHER-FINANCE-COST", name: "Other Finance Cost", accountCode: "5230", parentGroup: "FINANCE" },
];

// Applies parentGroup/requiresParty/receiptPolicy to the DEFAULT_ACCOUNTS-derived
// categories that directly correspond to a Founder-named category (Freight,
// Salary, Marketing, Rent, Electricity, etc.) — reusing the SAME category row
// EXPENSE_CATEGORY_MAP already creates rather than duplicating it.
const EXISTING_CATEGORY_GROUPING: Record<string, { parentGroup: string; requiresParty?: boolean; receiptPolicy?: "OPTIONAL" | "RECOMMENDED" | "REQUIRED" }> = {
  "5020": { parentGroup: "TRANSPORT_LOGISTICS", receiptPolicy: "RECOMMENDED" }, // Freight
  "5040": { parentGroup: "LABOUR_STAFF", requiresParty: true, receiptPolicy: "OPTIONAL" }, // Salary
  "5050": { parentGroup: "LABOUR_STAFF", requiresParty: true }, // Incentives
  "5140": { parentGroup: "FACTORY" }, // Electricity
  "5150": { parentGroup: "ADMIN_OFFICE" }, // Internet/Phone
  "5160": { parentGroup: "ADMIN_OFFICE", receiptPolicy: "RECOMMENDED" }, // Professional Fees
  "5170": { parentGroup: "FINANCE", receiptPolicy: "RECOMMENDED" }, // Banking Charges
  "5180": { parentGroup: "FINANCE" }, // Interest
  "5070": { parentGroup: "SALES_MARKETING" }, // Marketing
  "5080": { parentGroup: "SALES_MARKETING", receiptPolicy: "RECOMMENDED" }, // Advertising
  "5100": { parentGroup: "SALES_MARKETING" }, // Sampling
  "5120": { parentGroup: "ADMIN_OFFICE", receiptPolicy: "RECOMMENDED" }, // Software
  "5130": { parentGroup: "ADMIN_OFFICE", receiptPolicy: "RECOMMENDED" }, // Rent
  "5210": { parentGroup: "SALES_MARKETING", requiresParty: true }, // Travel
  "5000": { parentGroup: "PURCHASE_OPERATIONS", receiptPolicy: "RECOMMENDED" }, // Raw Material
  "5010": { parentGroup: "PURCHASE_OPERATIONS", receiptPolicy: "RECOMMENDED" }, // Packaging Material
  "5230": { parentGroup: "OTHER" }, // Miscellaneous
};

// Idempotent (upsert-by-code, same pattern as seedDefaultChartOfAccounts) —
// safe to call again after new categories are added to the lists above.
export async function seedQuickEntryCategoryMaster(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "coa:manage" });
  for (const [code, grouping] of Object.entries(EXISTING_CATEGORY_GROUPING)) {
    await db.seeraExpenseCategory.updateMany({ where: { code }, data: grouping });
  }
  const created = [];
  for (const category of QUICK_ENTRY_CATEGORIES) {
    created.push(
      await db.seeraExpenseCategory.upsert({
        where: { code: category.code },
        update: { parentGroup: category.parentGroup, requiresParty: category.requiresParty ?? false, receiptPolicy: category.receiptPolicy ?? "OPTIONAL" },
        create: { code: category.code, name: category.name, chartOfAccountId: category.accountCode, parentGroup: category.parentGroup, requiresParty: category.requiresParty ?? false, receiptPolicy: category.receiptPolicy ?? "OPTIONAL" },
      }),
    );
  }
  await recordAudit(db, { actorId, action: "finance.quick_entry_categories.seeded", entityType: "SeeraExpenseCategory", entityId: "bulk", afterState: { created: created.length, regrouped: Object.keys(EXISTING_CATEGORY_GROUPING).length } });
  return created;
}

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
