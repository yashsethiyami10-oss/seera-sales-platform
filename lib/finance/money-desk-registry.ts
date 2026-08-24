import type { FinanceApprovalCategory } from "@prisma/client";

// SEERA MONEY DESK — TRANSACTION DEFINITION REGISTRY. The single, centralized
// source of truth for every governed purpose an operator can pick on the
// Money Desk Home screen. Nothing about accounting logic lives scattered in
// UI components — a purpose's allowed direction, required/optional fields,
// which real domain service handles it, its GST/document/approval posture,
// and which roles may even select it all live here, in one place. The
// orchestration engine (money-desk-service.ts) reads this registry; it never
// hardcodes per-purpose behavior itself.
//
// "System decides the accounting" means: an operator never sees a debit/
// credit or chart-of-accounts picker for any of these 17 codes. Every
// purpose here maps to a REAL, already-governed Finance/Manufacturing/Sales
// service call — Money Desk supplies the guided form and the lifecycle
// wrapper, never a second accounting engine.

export type MoneyDeskDirection = "CASH_IN" | "CASH_OUT" | "BANK_IN" | "BANK_OUT" | "ADJUSTMENT";
export type MoneyDeskCounterpartyType = "VENDOR" | "EMPLOYEE" | "CUSTOMER" | "RETAILER" | "NONE";
// Founder-visual-review grouping (Money Desk maturity pass, 24-Aug §6): the Money Out picker
// must render as business category cards, not one long flat vertical list. RECEIPTS is used by
// the two Money In purposes; every Money Out purpose falls into exactly one of the rest.
export type MoneyDeskPurposeGroup = "RECEIPTS" | "PROCUREMENT" | "EMPLOYEE" | "LOGISTICS" | "PREMISES_ADMIN" | "MARKETING" | "FINANCE" | "OTHER";
export type MoneyDeskFieldKey =
  | "counterpartyId" | "counterpartyName" | "vendorInvoiceNumber" | "invoiceDate" | "dueDate"
  | "materialId" | "quantity" | "unit" | "locationId" | "unitCost" | "manufactureDate" | "expiryDate"
  | "paidNow" | "billId" | "retailerId" | "skuLines" | "sourceReturnRequestId" | "adjustmentAccountCode"
  | "employeeId" | "usefulLifeMonths" | "residualValue" | "category" | "gstin" | "taxable" | "cgst" | "sgst" | "igst";

export type MoneyDeskPurposeDefinition = {
  code: string;
  label: string;
  hindiLabel: string;
  group: MoneyDeskPurposeGroup;
  allowedDirections: MoneyDeskDirection[];
  counterpartyType: MoneyDeskCounterpartyType;
  requiredFields: MoneyDeskFieldKey[];
  optionalFields: MoneyDeskFieldKey[];
  // Which orchestration handler in money-desk-service.ts's HANDLERS map runs this purpose —
  // deliberately a plain string key, not a function reference, so this file stays pure data.
  handler:
    | "RAW_MATERIAL_PURCHASE" | "VENDOR_PAYMENT" | "INSTITUTIONAL_RECEIPT" | "OFFLINE_SALE"
    | "QUICK_ENTRY_EXPENSE" | "FIXED_ASSET" | "REFUND" | "ADJUSTMENT";
  quickEntryType?: "EXPENSE" | "ADVANCE" | "REIMBURSEMENT" | "SALARY" | "PAYMENT" | "OTHER";
  quickEntryCategoryCode?: string; // SeeraExpenseCategory.code, when the handler is QUICK_ENTRY_EXPENSE with a fixed category
  inventoryEffect: boolean;
  stockDomain: "MANUFACTURING" | "SALES" | null;
  documentPolicy: "REQUIRED" | "OPTIONAL" | "NONE";
  approvalCategory: FinanceApprovalCategory;
  // Beyond the base money_desk:create/money_desk:cash/money_desk:bank gate every purpose already
  // requires, some purposes additionally require an existing Finance permission the underlying
  // domain service itself demands (e.g. asset:manage for capitalization) — enforced twice,
  // deliberately: once here (so the Home screen never offers a purpose the actor can't complete)
  // and once inside the real service call itself (the actual security boundary).
  additionalPermission?: string;
  gstApplicable: boolean;
  description: string;
};

export const MONEY_DESK_PURPOSES: Record<string, MoneyDeskPurposeDefinition> = {
  "PUR-RM": {
    code: "PUR-RM",
    label: "Raw Material Purchase",
    hindiLabel: "कच्चा माल खरीद",
    group: "PROCUREMENT",
    allowedDirections: ["CASH_OUT", "BANK_OUT", "ADJUSTMENT"],
    counterpartyType: "VENDOR",
    requiredFields: ["counterpartyId", "counterpartyName", "materialId", "quantity", "unit", "locationId", "vendorInvoiceNumber", "invoiceDate", "dueDate", "taxable"],
    optionalFields: ["unitCost", "manufactureDate", "expiryDate", "paidNow", "cgst", "sgst", "igst"],
    handler: "RAW_MATERIAL_PURCHASE",
    inventoryEffect: true,
    stockDomain: "MANUFACTURING",
    documentPolicy: "REQUIRED",
    approvalCategory: "VENDOR_BILL",
    additionalPermission: "mfg_grn:manage",
    gstApplicable: true,
    description: "CRITICAL: raw material received from a vendor — paid now, on credit, or paying an existing bill. Always creates a real GRN (Manufacturing) and a real Vendor Bill/Payment (Finance), linked to each other — never a finance-only journal.",
  },
  "PAY-VEN": {
    code: "PAY-VEN",
    label: "Vendor Payment",
    hindiLabel: "विक्रेता भुगतान",
    group: "PROCUREMENT",
    allowedDirections: ["CASH_OUT", "BANK_OUT"],
    counterpartyType: "VENDOR",
    requiredFields: ["counterpartyId", "billId"],
    optionalFields: [],
    handler: "VENDOR_PAYMENT",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "OPTIONAL",
    approvalCategory: "PAYMENT",
    gstApplicable: false,
    description: "Payment against an existing, already-recorded Vendor Bill. Over-allocation beyond the bill's due amount is rejected by the underlying service, not just the UI.",
  },
  "REC-INS": {
    code: "REC-INS",
    label: "Institutional Receipt",
    hindiLabel: "संस्थागत प्राप्ति",
    group: "RECEIPTS",
    allowedDirections: ["CASH_IN", "BANK_IN"],
    counterpartyType: "CUSTOMER",
    requiredFields: ["counterpartyName"],
    optionalFields: ["counterpartyId"],
    handler: "INSTITUTIONAL_RECEIPT",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "OPTIONAL",
    approvalCategory: "PAYMENT",
    gstApplicable: false,
    description: "Money received from an institutional customer. When a specific customer/invoice is known, posts as a real receivable receipt; when it isn't, posts as an unallocated customer advance — never a fabricated invoice match.",
  },
  "SALE-OFF": {
    code: "SALE-OFF",
    label: "Factory / Offline Sale",
    hindiLabel: "फैक्ट्री / ऑफलाइन बिक्री",
    group: "RECEIPTS",
    allowedDirections: ["CASH_IN", "BANK_IN"],
    counterpartyType: "CUSTOMER",
    requiredFields: ["counterpartyName", "skuLines"],
    optionalFields: ["retailerId"],
    handler: "OFFLINE_SALE",
    inventoryEffect: true,
    stockDomain: "SALES",
    documentPolicy: "OPTIONAL",
    approvalCategory: "PAYMENT",
    // Real Sales authority, not a Money Desk-only permission — placeRetailerOrder itself requires
    // retailer:order regardless of what Money Desk grants, by design (Money Desk cannot bypass it).
    // In practice only an actor who holds BOTH a money_desk permission AND retailer:order (e.g. a
    // Sales Manager or Founder also given Money Desk access) can complete this purpose today.
    additionalPermission: "retailer:order",
    gstApplicable: true,
    description: "A walk-in / counter / factory-gate cash sale. Always goes through the real Sales/Inventory order path (a governed walk-in customer record + a real order) — never a finance-only journal.",
  },
  "SAL-EMP": {
    code: "SAL-EMP",
    label: "Salary",
    hindiLabel: "वेतन",
    group: "EMPLOYEE",
    allowedDirections: ["CASH_OUT", "BANK_OUT"],
    counterpartyType: "EMPLOYEE",
    requiredFields: ["employeeId"],
    optionalFields: [],
    handler: "QUICK_ENTRY_EXPENSE",
    quickEntryType: "SALARY",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "NONE",
    approvalCategory: "EXPENSE",
    gstApplicable: false,
    description: "Salary paid to an employee — reuses the existing Payroll-adjacent Quick Entry path, not a new payroll engine.",
  },
  // categoryCode values below are real seeded SeeraExpenseCategory.code values
  // (chart-of-accounts.ts's DEFAULT_QUICK_ENTRY_CATEGORIES) — resolved to a
  // categoryId at call time, never guessed COA account codes. Where no
  // pre-seeded category is an exact, unambiguous match (Travel, Utility),
  // categoryCode is left undefined so the handler falls through to
  // quickEntryCreate's own existing manual-category mechanism (lands safely
  // on 5230 Miscellaneous, never force-mapped to the wrong account).
  "EXP-FUEL": expenseDef("EXP-FUEL", "Diesel / Fuel", "ईंधन", "QE-DIESEL", "LOGISTICS"),
  "EXP-FREIGHT": expenseDef("EXP-FREIGHT", "Freight", "भाड़ा", "5020", "LOGISTICS"),
  "EXP-VEHICLE": expenseDef("EXP-VEHICLE", "Vehicle Maintenance", "वाहन रखरखाव", "QE-VEHICLE-REPAIR", "LOGISTICS"),
  "EXP-RENT": expenseDef("EXP-RENT", "Rent", "किराया", "QE-OFFICE-RENT", "PREMISES_ADMIN"),
  "EXP-ELECTRICITY": expenseDef("EXP-ELECTRICITY", "Electricity", "बिजली", "5140", "PREMISES_ADMIN"),
  "EXP-WAREHOUSE": expenseDef("EXP-WAREHOUSE", "Warehouse", "गोदाम", "5030", "PREMISES_ADMIN"),
  "EXP-COURIER": expenseDef("EXP-COURIER", "Courier / Delivery", "कूरियर", "QE-COURIER", "LOGISTICS"),
  "EXP-PACK": { ...expenseDef("EXP-PACK", "Packaging", "पैकेजिंग", "QE-PACKING-EXPENSE", "OTHER"), description: "Packaging expense. If Manufacturing treats this specific packaging as stocked material, it must be entered through Raw Material Purchase / GRN instead — flagged for the operator, not silently guessed." },
  "EXP-MKT": expenseDef("EXP-MKT", "Marketing", "मार्केटिंग", "QE-PROMOTION", "MARKETING"),
  "EXP-ADVERTISEMENT": expenseDef("EXP-ADVERTISEMENT", "Advertisement", "विज्ञापन", "5080", "MARKETING"),
  // EMI (spec §9): "If Loan Repayment already exists, map it into Money Desk EMI category without
  // duplicate posting" — QE-LOAN-REPAYMENT (chart-of-accounts.ts) already exists and posts the
  // correct Dr Loans(2050)/Cr Cash-or-Bank effect; this purpose is only a friendlier guided front
  // door onto that same category, never a second loan/EMI accounting path.
  "EXP-EMI": expenseDef("EXP-EMI", "EMI / Loan Repayment", "ईएमआई / ऋण चुकौती", "QE-LOAN-REPAYMENT", "FINANCE"),
  "EXP-REIMBURSEMENT": { ...expenseDef("EXP-REIMBURSEMENT", "Employee Expense Reimbursement", "कर्मचारी व्यय प्रतिपूर्ति", "QE-STAFF-REIMBURSEMENT", "EMPLOYEE"), quickEntryType: "REIMBURSEMENT", requiredFields: ["counterpartyName"], optionalFields: [] },
  "AST-MCH": {
    code: "AST-MCH",
    label: "Machinery / Fixed Asset",
    hindiLabel: "मशीनरी / स्थायी संपत्ति",
    group: "OTHER",
    allowedDirections: ["CASH_OUT", "BANK_OUT"],
    counterpartyType: "VENDOR",
    requiredFields: ["counterpartyName", "category"],
    optionalFields: ["counterpartyId", "usefulLifeMonths", "residualValue"],
    handler: "FIXED_ASSET",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "REQUIRED",
    approvalCategory: "EXPENSE",
    additionalPermission: "asset:manage",
    gstApplicable: true,
    description: "Machinery or other capital asset purchase — always capitalized as a real Fixed Asset, never blindly expensed.",
  },
  "EXP-OFFICE": expenseDef("EXP-OFFICE", "Office Expense", "कार्यालय व्यय", "QE-OFFICE-EXPENSE", "PREMISES_ADMIN"),
  "EXP-TRAVEL": expenseDef("EXP-TRAVEL", "Travel (Other)", "यात्रा", undefined, "OTHER"),
  "EXP-UTILITY": expenseDef("EXP-UTILITY", "Utility", "उपयोगिता", undefined, "PREMISES_ADMIN"),
  "REFUND": {
    code: "REFUND",
    label: "Refund",
    hindiLabel: "धनवापसी",
    group: "OTHER",
    allowedDirections: ["CASH_OUT", "BANK_OUT"],
    counterpartyType: "CUSTOMER",
    requiredFields: ["counterpartyName", "sourceReturnRequestId"],
    optionalFields: [],
    handler: "REFUND",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "REQUIRED",
    approvalCategory: "PAYMENT",
    gstApplicable: false,
    description: "Money paid back against an already-approved, credit-note-requested Return Request — never a generic blind negative-revenue entry.",
  },
  "ADJ-GOV": {
    code: "ADJ-GOV",
    label: "Governed Adjustment",
    hindiLabel: "नियंत्रित समायोजन",
    group: "OTHER",
    allowedDirections: ["ADJUSTMENT"],
    counterpartyType: "NONE",
    requiredFields: ["adjustmentAccountCode"],
    optionalFields: [],
    handler: "ADJUSTMENT",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "REQUIRED",
    approvalCategory: "MANUAL_JOURNAL",
    additionalPermission: "coa:manage",
    gstApplicable: false,
    description: "A correcting entry between two real, named accounts — restricted to actors who already hold Chart-of-Accounts authority (coa:manage), always reason-required and always approval-gated regardless of amount. Never exposed as a free debit/credit picker to a normal operator.",
  },
  "OTHER": {
    code: "OTHER",
    label: "Misc / Manual Entry",
    hindiLabel: "विविध / मैन्युअल प्रविष्टि",
    group: "OTHER",
    allowedDirections: ["CASH_IN", "CASH_OUT", "BANK_IN", "BANK_OUT"],
    counterpartyType: "NONE",
    requiredFields: [],
    optionalFields: ["counterpartyName"],
    handler: "QUICK_ENTRY_EXPENSE",
    quickEntryType: "OTHER",
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "OPTIONAL",
    approvalCategory: "EXPENSE",
    gstApplicable: false,
    description: "Anything that genuinely doesn't fit another purpose — still goes through the same governed Quick Entry path, never a free-form journal.",
  },
};

function expenseDef(code: string, label: string, hindiLabel: string, categoryCode: string | undefined, group: MoneyDeskPurposeGroup): MoneyDeskPurposeDefinition {
  return {
    code,
    label,
    hindiLabel,
    group,
    allowedDirections: ["CASH_OUT", "BANK_OUT"],
    counterpartyType: "NONE",
    requiredFields: [],
    optionalFields: ["counterpartyName"],
    handler: "QUICK_ENTRY_EXPENSE",
    quickEntryType: "EXPENSE",
    quickEntryCategoryCode: categoryCode,
    inventoryEffect: false,
    stockDomain: null,
    documentPolicy: "OPTIONAL",
    approvalCategory: "EXPENSE",
    gstApplicable: false,
    description: categoryCode
      ? `${label} — no inventory effect, routed through the existing governed Quick Entry expense path (category ${categoryCode}).`
      : `${label} — no pre-seeded exact-match expense category exists yet; routed through Quick Entry's own manual-category mechanism (lands safely on Miscellaneous, never force-mapped to the wrong account).`,
  };
}

export const MONEY_DESK_PURPOSE_CODES = Object.keys(MONEY_DESK_PURPOSES);

export function purposeDefinition(code: string): MoneyDeskPurposeDefinition {
  const def = MONEY_DESK_PURPOSES[code];
  if (!def) throw new Error(`Unknown Money Desk purpose code: ${code}`);
  return def;
}
