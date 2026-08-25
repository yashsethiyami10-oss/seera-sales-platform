import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { ledgerReadModel, partyOutstanding } from "@/lib/sales-distribution/financial-service";
import { deriveCostCentre } from "./cost-centre";
import { EXTERNAL_PARTY_PORTAL_ROLE_CODES } from "@/lib/foundation/rbac-catalog";

// SEERA PROFESSIONAL LEDGER — the one shared running-balance statement engine for every party
// type (Distributor, Super Stockist, Vendor, Employee). Founder visual review (24-Aug §17):
// "do not create separate inconsistent ledger math per party type." This file is READ-ONLY — it
// never posts a financial effect of its own. Every row it renders is derived from an
// already-posted, already-governed record (SeeraFinancialEntry, SeeraVendorBill/Payment,
// SeeraExpense, SeeraTaClaim) so PDF/CSV/UI can never disagree with each other or invent a
// second accounting effect (spec §38 "exactly once").

export type LedgerPartyType = "DISTRIBUTOR" | "SUPER_STOCKIST" | "VENDOR" | "EMPLOYEE";

export type LedgerLine = { skuCode: string; product: string; pack: string; uom: string; quantity: number; rate: number; taxable: number; gst: number; lineTotal: number };

export type LedgerRow = {
  id: string;
  date: string;
  particulars: string;
  voucher: string;
  debit: number;
  credit: number;
  balance: number;
  sourceType: string;
  sourceId: string;
  reason?: string | null;
  territory?: string | null;
  costCentre?: string | null;
  treasury?: string | null;
  paymentReference?: string | null;
  createdBy?: string | null;
  postedAt: string | null;
  lines?: LedgerLine[] | null;
  // Bidirectional Ledger -> Money Desk link (Founder closure pass, 24-Aug §7). Only set when a
  // real SeeraMoneyDeskTransaction genuinely caused this row (Vendor Payment/Bill via PAY-VEN or
  // RAW_MATERIAL_PURCHASE, Expense via any quick-entry purpose) — never fabricated for rows a
  // different pathway posted (e.g. a Guided Distributor Receipt, which intentionally reuses the
  // pre-existing recordPayment/verifyPayment pipeline, not Money Desk's own transaction table).
  moneyDeskTransactionId?: string | null;
};

// Reverse-resolves "which SeeraMoneyDeskTransaction produced this downstream record", so a Ledger
// row can link back to the same Transaction Detail page its own "View Ledger" link points forward
// from. Bounded to the transactions `where` already narrows down (one vendor / one employee's
// worth), not a full-table scan.
async function moneyDeskLinksFor(db: PrismaClient, where: { counterpartyType: "VENDOR"; counterpartyId: string } | { formData: { path: string[]; equals: string } }): Promise<Map<string, string>> {
  const txns = await db.seeraMoneyDeskTransaction.findMany({ where, select: { id: true, downstreamRefs: true } });
  const linkByRefId = new Map<string, string>();
  for (const t of txns) {
    const refs = (t.downstreamRefs ?? {}) as Record<string, unknown>;
    for (const key of ["expenseId", "vendorPaymentId", "paymentId", "billId"] as const) {
      const v = refs[key];
      if (typeof v === "string") linkByRefId.set(v, t.id);
    }
  }
  return linkByRefId;
}

export type PartyLedgerStatement = {
  party: { id: string; name: string; type: LedgerPartyType; address?: string | null; mobile?: string | null; gstin?: string | null; territory?: string | null };
  period: { from: string; to: string };
  normalSide: "DEBIT" | "CREDIT";
  openingBalance: number;
  rows: LedgerRow[];
  totals: { debit: number; credit: number; closingBalance: number };
};

const FINANCIAL_ENTRY_LABEL: Record<string, string> = {
  INVOICE: "Tax Invoice",
  PAYMENT: "Payment Received",
  ADVANCE: "Advance Received",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  RETURN: "Return Adjustment",
  CLAIM_ADJUSTMENT: "Claim Adjustment",
  OPENING_BALANCE: "Opening Balance",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Adjustment",
  EXPENSE: "Expense",
  REIMBURSEMENT: "Reimbursement",
};

const EXPENSE_ENTRY_LABEL: Record<string, string> = {
  SALARY: "Salary Paid",
  ADVANCE: "Advance Paid",
  REIMBURSEMENT: "Expense Reimbursement",
  PAYMENT: "Payment",
  OTHER: "Other Payment",
  EXPENSE: "Expense Paid",
};

function buildLines(lineSnapshot: unknown): LedgerLine[] {
  const lines = (lineSnapshot as { skuCodeSnapshot?: string; productNameSnapshot?: string; packSnapshot?: string; uom?: { unit?: string }; quantity?: number; rate?: number; taxableValue?: number; taxAmount?: number; lineTotal?: number }[]) ?? [];
  return lines.map((l) => ({
    skuCode: l.skuCodeSnapshot ?? "",
    product: l.productNameSnapshot ?? "Unknown",
    pack: l.packSnapshot ?? "",
    uom: l.uom?.unit ?? "",
    quantity: Number(l.quantity ?? 0),
    rate: Number(l.rate ?? 0),
    taxable: Number(l.taxableValue ?? 0),
    gst: Number(l.taxAmount ?? 0),
    lineTotal: Number(l.lineTotal ?? 0),
  }));
}

function partitionAndRunningBalance(rows: Omit<LedgerRow, "balance">[], from: Date, to: Date, normalSide: "DEBIT" | "CREDIT") {
  const sorted = [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const sign = normalSide === "DEBIT" ? 1 : -1;
  let running = 0;
  for (const r of sorted) {
    if (new Date(r.date) < from) running += sign * (r.debit - r.credit);
  }
  const openingBalance = running;
  const inRange = sorted.filter((r) => { const t = new Date(r.date).getTime(); return t >= from.getTime() && t <= to.getTime(); });
  const finalRows: LedgerRow[] = [];
  let debitTotal = 0;
  let creditTotal = 0;
  for (const r of inRange) {
    running += sign * (r.debit - r.credit);
    debitTotal += r.debit;
    creditTotal += r.credit;
    finalRows.push({ ...r, balance: running });
  }
  return { openingBalance, rows: finalRows, totals: { debit: debitTotal, credit: creditTotal, closingBalance: running } };
}

export async function partyLedgerStatement(db: PrismaClient, actorId: string, input: { partyType: LedgerPartyType; partyId: string; from?: Date; to?: Date }): Promise<PartyLedgerStatement> {
  const from = input.from ?? new Date("2000-01-01");
  const to = input.to ?? new Date();
  if (input.partyType === "DISTRIBUTOR" || input.partyType === "SUPER_STOCKIST") return distributorOrSsLedger(db, actorId, input.partyType, input.partyId, from, to);
  if (input.partyType === "VENDOR") return vendorLedger(db, actorId, input.partyId, from, to);
  return employeeLedger(db, actorId, input.partyId, from, to);
}

async function distributorOrSsLedger(db: PrismaClient, actorId: string, partyType: "DISTRIBUTOR" | "SUPER_STOCKIST", partyId: string, from: Date, to: Date): Promise<PartyLedgerStatement> {
  const [partner, ledger] = await Promise.all([
    db.seeraPartner.findUniqueOrThrow({ where: { id: partyId } }),
    ledgerReadModel(db, actorId, { partyType, partyId }),
  ]);
  const documentIds = ledger.transactions.map((e) => e.documentId).filter((id): id is string => !!id);
  const actorIds = [...new Set(ledger.transactions.map((e) => e.actorId))];
  const [documents, actors, territoryNode] = await Promise.all([
    documentIds.length ? db.seeraCommercialDocument.findMany({ where: { id: { in: documentIds } } }) : Promise.resolve([]),
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    partner.territoryIds[0] ? db.seeraGeographyNode.findUnique({ where: { id: partner.territoryIds[0] }, select: { name: true } }) : Promise.resolve(null),
  ]);
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));
  const contact = partner.primaryContact as { mobile?: string; phone?: string } | null;
  const address = partner.addresses as { line1?: string; city?: string; state?: string }[] | null;
  const addressText = Array.isArray(address) && address[0] ? [address[0].line1, address[0].city, address[0].state].filter(Boolean).join(", ") : null;

  const rows: Omit<LedgerRow, "balance">[] = ledger.transactions.map((e) => {
    const isDebit = e.debitPartyId === partyId && e.debitPartyType === partyType;
    const document = e.documentId ? documentById.get(e.documentId) : undefined;
    return {
      id: e.id,
      date: (e.postedAt ?? e.createdAt).toISOString(),
      particulars: FINANCIAL_ENTRY_LABEL[e.type] ?? e.type,
      voucher: document?.documentNumber ?? e.entryNumber,
      debit: isDebit ? Number(e.amount) : 0,
      credit: isDebit ? 0 : Number(e.amount),
      sourceType: document ? "SeeraCommercialDocument" : e.taClaimId ? "SeeraTaClaim" : e.claimId ? "SeeraClaim" : "SeeraFinancialEntry",
      sourceId: document?.id ?? e.taClaimId ?? e.claimId ?? e.id,
      reason: e.reason,
      createdBy: actorNameById.get(e.actorId) ?? e.actorId,
      postedAt: e.postedAt ? e.postedAt.toISOString() : null,
      lines: document && document.type !== "PAYMENT_RECEIPT" ? buildLines(document.lineSnapshot) : null,
    };
  });

  const { openingBalance, rows: finalRows, totals } = partitionAndRunningBalance(rows, from, to, "DEBIT");
  return {
    party: { id: partner.id, name: partner.tradeName ?? partner.legalName, type: partyType, address: addressText, mobile: contact?.mobile ?? contact?.phone ?? null, gstin: partner.gstin, territory: territoryNode?.name ?? null },
    period: { from: from.toISOString(), to: to.toISOString() },
    normalSide: "DEBIT",
    openingBalance,
    rows: finalRows,
    totals,
  };
}

async function vendorLedger(db: PrismaClient, actorId: string, vendorId: string, from: Date, to: Date): Promise<PartyLedgerStatement> {
  await authorize(db, { actorId, permission: "vendor:manage" });
  const [vendor, bills, payments, moneyDeskLinks] = await Promise.all([
    db.seeraVendor.findUniqueOrThrow({ where: { id: vendorId } }),
    db.seeraVendorBill.findMany({ where: { vendorId, status: { not: "CANCELLED" } } }),
    db.seeraVendorPayment.findMany({ where: { vendorId } }),
    moneyDeskLinksFor(db, { counterpartyType: "VENDOR", counterpartyId: vendorId }),
  ]);
  const treasuryIds = [...new Set(payments.map((p) => p.treasuryAccountId))];
  const treasuries = treasuryIds.length ? await db.seeraTreasuryAccount.findMany({ where: { id: { in: treasuryIds } }, select: { id: true, name: true } }) : [];
  const treasuryNameById = new Map(treasuries.map((t) => [t.id, t.name]));
  const address = vendor.address as { line1?: string; city?: string; state?: string } | null;
  const addressText = address ? [address.line1, address.city, address.state].filter(Boolean).join(", ") : null;

  const billRows: Omit<LedgerRow, "balance">[] = bills.map((b) => ({
    id: b.id,
    date: b.invoiceDate.toISOString(),
    particulars: "Vendor Bill",
    voucher: b.vendorInvoiceNumber,
    debit: 0,
    credit: Number(b.grossAmount),
    sourceType: "SeeraVendorBill",
    sourceId: b.id,
    reason: b.description,
    postedAt: b.createdAt.toISOString(),
    lines: null,
    moneyDeskTransactionId: moneyDeskLinks.get(b.id) ?? null,
  }));
  const paymentRows: Omit<LedgerRow, "balance">[] = payments.map((p) => ({
    id: p.id,
    date: p.paymentDate.toISOString(),
    particulars: "Vendor Payment",
    voucher: p.paymentNumber,
    debit: Number(p.amount),
    credit: 0,
    sourceType: "SeeraVendorPayment",
    sourceId: p.id,
    paymentReference: p.reference,
    treasury: treasuryNameById.get(p.treasuryAccountId) ?? null,
    postedAt: p.createdAt.toISOString(),
    lines: null,
    moneyDeskTransactionId: moneyDeskLinks.get(p.id) ?? null,
  }));

  const { openingBalance, rows, totals } = partitionAndRunningBalance([...billRows, ...paymentRows], from, to, "CREDIT");
  return {
    party: { id: vendor.id, name: vendor.tradeName ?? vendor.legalName, type: "VENDOR", address: addressText, mobile: vendor.phone, gstin: vendor.gstin, territory: null },
    period: { from: from.toISOString(), to: to.toISOString() },
    normalSide: "CREDIT",
    openingBalance,
    rows,
    totals,
  };
}

async function employeeLedger(db: PrismaClient, actorId: string, employeeId: string, from: Date, to: Date): Promise<PartyLedgerStatement> {
  await authorize(db, { actorId, permission: "expense:create" });
  const [employee, expenses, claims, moneyDeskLinks] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, name: true, email: true } }),
    db.seeraExpense.findMany({ where: { employeeId, status: "POSTED" } }),
    db.seeraTaClaim.findMany({ where: { employeeId, totalApproved: { not: null } } }),
    moneyDeskLinksFor(db, { formData: { path: ["employeeId"], equals: employeeId } }),
  ]);
  const territoryIds = [...new Set(expenses.map((e) => e.territoryId).filter((id): id is string => !!id))];
  const treasuryIds = [...new Set(expenses.map((e) => e.treasuryAccountId).filter((id): id is string => !!id))];
  const categoryIds = [...new Set(expenses.map((e) => e.categoryId))];
  const [territories, treasuries, categories] = await Promise.all([
    territoryIds.length ? db.seeraGeographyNode.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    treasuryIds.length ? db.seeraTreasuryAccount.findMany({ where: { id: { in: treasuryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    categoryIds.length ? db.seeraExpenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, chartOfAccountId: true, parentGroup: true } }) : Promise.resolve([]),
  ]);
  const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
  const treasuryNameById = new Map(treasuries.map((t) => [t.id, t.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Immediate cash items (Salary/Advance/Reimbursement/Other) are already fully settled at
  // posting time in this schema — no separate payable record exists for them. Shown as a
  // debit=credit=amount row so they appear in the employee's full financial history without
  // fabricating an "outstanding payable" that was never real (spec §24's "no artificial unpaid
  // payable" rule, applied the same way here as it does for Vendor).
  const expenseRows: Omit<LedgerRow, "balance">[] = expenses.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    particulars: EXPENSE_ENTRY_LABEL[e.entryType] ?? e.entryType,
    voucher: e.expenseNumber,
    debit: Number(e.amount),
    credit: Number(e.amount),
    sourceType: "SeeraExpense",
    sourceId: e.id,
    reason: e.description,
    territory: e.territoryId ? (territoryNameById.get(e.territoryId) ?? null) : null,
    costCentre: deriveCostCentre(categoryById.get(e.categoryId), Boolean(e.territoryId)),
    treasury: e.treasuryAccountId ? (treasuryNameById.get(e.treasuryAccountId) ?? null) : null,
    postedAt: e.createdAt.toISOString(),
    lines: null,
    moneyDeskTransactionId: moneyDeskLinks.get(e.id) ?? null,
  }));

  // TA/DA claims genuinely have a payable->payment gap (approved, then paid later) — a real
  // credit (payable) row when approved, and a real debit (payment) row only once actually paid.
  // The two amounts (totalApproved vs amountPaid) are never assumed equal or split by ratio; an
  // unpaid claim correctly leaves an outstanding credit balance on the ledger.
  //
  // TA vs DA presentation (Founder closure pass, 24-Aug §10): "do not display one confusing
  // combined TA/DA line" — DA policy is still pending (daEligible/daAmount are null/false for
  // essentially every real claim today), so the common case renders a single, correctly-named "TA
  // Reimbursement Payable" line. Only when a claim genuinely carries a real, eligible daAmount does
  // a SEPARATE "DA Reimbursement Payable" row appear — sized so the two rows always sum to exactly
  // totalApproved (never a fabricated ratio split of unrelated hotel/toll/other components). The
  // existing ₹2/km TA rate computation itself is untouched — this only changes how the already-
  // computed totalApproved is presented on the ledger.
  const claimRows: Omit<LedgerRow, "balance">[] = [];
  for (const c of claims) {
    const approvedDate = c.approvedAt ?? c.sentToAccountsAt ?? c.claimDate;
    const totalApproved = Number(c.totalApproved ?? 0);
    const hasRealDa = c.daEligible === true && Number(c.daAmount ?? 0) > 0;
    const daAmount = hasRealDa ? Number(c.daAmount) : 0;
    const taAmount = totalApproved - daAmount;
    claimRows.push({
      id: `${c.id}:ta-payable`,
      date: approvedDate.toISOString(),
      particulars: "TA Reimbursement Payable",
      voucher: c.claimNumber,
      debit: 0,
      credit: taAmount,
      sourceType: "SeeraTaClaim",
      sourceId: c.id,
      reason: c.purpose,
      postedAt: approvedDate.toISOString(),
      lines: null,
    });
    if (hasRealDa) {
      claimRows.push({
        id: `${c.id}:da-payable`,
        date: approvedDate.toISOString(),
        particulars: "DA Reimbursement Payable",
        voucher: c.claimNumber,
        debit: 0,
        credit: daAmount,
        sourceType: "SeeraTaClaim",
        sourceId: c.id,
        reason: c.purpose,
        postedAt: approvedDate.toISOString(),
        lines: null,
      });
    }
    if (c.paidAt && c.amountPaid) {
      claimRows.push({
        id: `${c.id}:payment`,
        date: c.paidAt.toISOString(),
        particulars: hasRealDa ? "TA & DA Reimbursement Payment" : "TA Reimbursement Payment",
        voucher: c.claimNumber,
        debit: Number(c.amountPaid),
        credit: 0,
        sourceType: "SeeraTaClaim",
        sourceId: c.id,
        paymentReference: c.paymentReference,
        postedAt: c.paidAt.toISOString(),
        lines: null,
      });
    }
  }

  const { openingBalance, rows, totals } = partitionAndRunningBalance([...expenseRows, ...claimRows], from, to, "CREDIT");
  return {
    party: { id: employee.id, name: employee.name ?? employee.email, type: "EMPLOYEE", address: null, mobile: null, gstin: null, territory: null },
    period: { from: from.toISOString(), to: to.toISOString() },
    normalSide: "CREDIT",
    openingBalance,
    rows,
    totals,
  };
}

export async function ledgerPartyOptions(db: PrismaClient, actorId: string, partyType: LedgerPartyType) {
  if (partyType === "DISTRIBUTOR" || partyType === "SUPER_STOCKIST") {
    // Deliberately the broader oversight permission, NOT "ledger:view" — DISTRIBUTOR_OWNER/
    // SUPER_STOCKIST_OWNER also hold "ledger:view", but only scoped to their OWN party (the P0
    // fix in ledgerReadModel). This function lists EVERY party of the type, which only a real
    // Finance/Founder oversight actor may do — reusing the narrower permission here would let any
    // Distributor/S.S. portal user enumerate every other party's name over the API directly.
    await authorize(db, { actorId, permission: "finance_dashboard:view" });
    const partners = await db.seeraPartner.findMany({ where: { type: partyType }, orderBy: { legalName: "asc" }, select: { id: true, legalName: true, tradeName: true } });
    return partners.map((p) => ({ id: p.id, name: p.tradeName ?? p.legalName }));
  }
  if (partyType === "VENDOR") {
    await authorize(db, { actorId, permission: "vendor:manage" });
    const vendors = await db.seeraVendor.findMany({ orderBy: { legalName: "asc" }, select: { id: true, legalName: true, tradeName: true } });
    return vendors.map((v) => ({ id: v.id, name: v.tradeName ?? v.legalName }));
  }
  await authorize(db, { actorId, permission: "expense:create" });
  // Real production bug found via Founder UAT (25-Aug): querying every ACTIVE user with no role
  // filter pulled in Retailer/Distributor/S.S. portal-login accounts too — a retailer's shop name
  // (e.g. "Aadi Stationery") showed up as an "employee". Excludes every external-party portal role;
  // see EXTERNAL_PARTY_PORTAL_ROLE_CODES.
  const employees = await db.user.findMany({
    where: { status: "ACTIVE", roleAssignments: { some: { status: "ACTIVE", role: { code: { notIn: [...EXTERNAL_PARTY_PORTAL_ROLE_CODES] } } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
    take: 500,
  });
  return employees.map((e) => ({ id: e.id, name: e.name ?? e.email }));
}

// Guided Money In (Founder closure pass, 24-Aug §4) — Step 3 needs "what does this party still
// owe" to offer Outstanding Invoices for allocation. Reuses the SAME partyOutstanding() the party's
// own Ledger/Credit screens already read, just gated to the Accounts/Founder oversight permission
// instead of self-scope (this endpoint is for Accounts picking ANY party while recording a
// receipt, not a party viewing its own position).
export async function partyOutstandingForGuidedReceipt(db: PrismaClient, actorId: string, input: { partyType: "DISTRIBUTOR" | "SUPER_STOCKIST"; partyId: string }) {
  await authorize(db, { actorId, permission: "finance_dashboard:view" });
  return partyOutstanding(db, input.partyType, input.partyId, new Date());
}

export function assertKnownPartyType(value: string | null): LedgerPartyType {
  if (value === "DISTRIBUTOR" || value === "SUPER_STOCKIST" || value === "VENDOR" || value === "EMPLOYEE") return value;
  throw new FoundationError("UNKNOWN_PARTY_TYPE", "Unknown ledger party type", 400);
}
