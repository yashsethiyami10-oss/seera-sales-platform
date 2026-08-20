import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { financeNumberFor } from "./numbering";
import { purposeDefinition, type MoneyDeskDirection } from "./money-desk-registry";
import { recordMoneyIn, recordMoneyOut } from "./treasury-service";
import { createVendorBill, recordVendorPayment } from "./vendor-service";
import { createFixedAsset } from "./loan-asset-service";
import { postJournal } from "./journal-service";
import { createGrn, postGrn } from "@/lib/manufacturing/grn-service";
import { createRetailer } from "@/lib/sales-distribution/field-portal-service";
import { placeRetailerOrder } from "@/lib/sales-distribution/workflow-service";

// SEERA MONEY DESK — ORCHESTRATION ENGINE. "User enters the business
// transaction. System decides the accounting." This file is the ONLY place a
// Money Desk purpose is turned into real Finance/Manufacturing/Sales calls —
// every handler below CALLS an existing, already-governed service function;
// none of them reproduces a service's effects by hand. money-desk-registry.ts
// owns which purpose maps to which handler and its field/approval/document
// posture; this file owns the governed lifecycle (DRAFT -> PENDING_APPROVAL
// -> POSTING -> POSTED / REJECTED / VOIDED) and durable idempotency around
// those calls.
//
// Approval reuses the SAME SeeraFinanceApprovalPolicy thresholds Finance OS
// already uses (never invented rupee limits) but is decided through Money
// Desk's OWN money_desk:approve permission and its OWN PENDING_APPROVAL
// state, not the generic SeeraApprovalItem queue — that queue is gated by
// approval:decide/manager_approval:decide, a different permission set than
// the Money Desk RBAC the spec asked for, and cross-wiring the two would
// blur which permission actually controls Money Desk approvals.
//
// Multi-step handlers (Raw Material Purchase, Offline Sale) are NOT wrapped
// in one giant cross-domain database transaction — GRN/VendorBill/Order
// creation are each already their own governed, independently-transactional
// service. Instead: every downstream call's idempotencyKey is deterministically
// derived from this transaction's own idempotencyKey, so re-invoking
// processMoneyDeskTransaction after a partial failure safely RESUMES (already
// -completed steps short-circuit on their own idempotency check) rather than
// double-posting. This is the "explicit workflow state + retry + audit"
// fallback the spec allows when true single-transaction atomicity isn't
// possible across module boundaries.

function requireDirectionAllowed(direction: MoneyDeskDirection, allowed: MoneyDeskDirection[]) {
  if (!allowed.includes(direction)) throw new FoundationError("MONEY_DESK_DIRECTION_NOT_ALLOWED", `${direction} is not valid for this purpose`, 400);
}

async function requireCashOrBankPermission(db: PrismaClient, actorId: string, direction: MoneyDeskDirection) {
  const permissions = await effectivePermissions(db, actorId);
  const isCash = direction === "CASH_IN" || direction === "CASH_OUT";
  const needed = isCash ? "money_desk:cash" : direction === "ADJUSTMENT" ? "money_desk:cash" : "money_desk:bank";
  if (!permissions.has(needed) && !permissions.has("system:super_admin"))
    throw new FoundationError("ACCESS_DENIED", `${needed} permission required`, 403);
}

export type MoneyDeskCreateInput = {
  purposeCode: string;
  direction: MoneyDeskDirection;
  amount: number;
  date: Date;
  treasuryAccountId?: string;
  counterpartyType?: string;
  counterpartyId?: string;
  counterpartyName?: string;
  description?: string;
  documentFileId?: string;
  formData: Record<string, unknown>;
  idempotencyKey: string;
};

// STEP 1 — DRAFT creation + immediate submit decision. Deliberately ONE call
// (not a separate create-then-submit round trip) so the operator's "Save"
// button gets its <=200ms ack from a single small write, matching the spec's
// performance target — the potentially-slow real posting work only happens
// afterward, inside processMoneyDeskTransaction, which the caller can await
// or (for the auto-approved common case) the API route awaits once more
// before returning, since most simple transactions clear instantly anyway.
export async function createMoneyDeskTransaction(db: PrismaClient, actorId: string, input: MoneyDeskCreateInput) {
  await authorize(db, { actorId, permission: "money_desk:create" });
  const def = purposeDefinition(input.purposeCode);
  requireDirectionAllowed(input.direction, def.allowedDirections);
  await requireCashOrBankPermission(db, actorId, input.direction);
  if (def.additionalPermission) {
    const permissions = await effectivePermissions(db, actorId);
    if (!permissions.has(def.additionalPermission) && !permissions.has("system:super_admin"))
      throw new FoundationError("ACCESS_DENIED", `${def.additionalPermission} permission required for ${def.label}`, 403);
  }
  if (input.amount <= 0) throw new FoundationError("INVALID_AMOUNT", "Amount must be positive", 400);
  // counterpartyId/counterpartyName are top-level MoneyDeskCreateInput fields (not part of the
  // purpose-specific formData blob) — the registry's requiredFields list treats them as ordinary
  // field keys, so check both places rather than only formData.
  const topLevelByField: Record<string, unknown> = { counterpartyId: input.counterpartyId, counterpartyName: input.counterpartyName };
  for (const field of def.requiredFields) {
    const value = field in topLevelByField ? topLevelByField[field] : input.formData[field];
    if (value == null || value === "")
      throw new FoundationError("MONEY_DESK_FIELD_REQUIRED", `"${field}" is required for ${def.label}`, 400);
  }
  if (def.documentPolicy === "REQUIRED" && !input.documentFileId)
    throw new FoundationError("MONEY_DESK_DOCUMENT_REQUIRED", `${def.label} requires a supporting document`, 400);

  const existing = await db.seeraMoneyDeskTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  // QUICK_ENTRY_EXPENSE purposes (Salary/Fuel/Rent/.../Other) reuse quickEntryCreate, which already
  // runs its OWN threshold-based approval gate internally via submitExpense — checking
  // SeeraFinanceApprovalPolicy["EXPENSE"] here TOO would double-gate the same money movement behind
  // two separate, redundant approval steps. Money Desk skips its own pre-check for these and always
  // proceeds to POSTING; if the underlying Expense still needs its own separate clearance, the
  // handler's own status check (below) surfaces that honestly via Needs Attention rather than a
  // second Money-Desk-level approval screen.
  const policy = await db.seeraFinanceApprovalPolicy.findUnique({ where: { category: def.approvalCategory } });
  const requiresApproval =
    def.handler === "QUICK_ENTRY_EXPENSE" ? false : def.code === "ADJ-GOV" ? true : policy ? policy.requiresApproval && input.amount >= Number(policy.thresholdAmount) : true;

  const created = await db.seeraMoneyDeskTransaction.create({
    data: {
      transactionNumber: financeNumberFor("MD", input.idempotencyKey),
      purposeCode: def.code,
      direction: input.direction,
      status: requiresApproval ? "PENDING_APPROVAL" : "POSTING",
      amount: input.amount,
      date: input.date,
      treasuryAccountId: input.treasuryAccountId,
      counterpartyType: input.counterpartyType,
      counterpartyId: input.counterpartyId,
      counterpartyName: input.counterpartyName,
      description: input.description,
      documentFileId: input.documentFileId,
      formData: input.formData as never,
      requestedById: actorId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordAudit(db, { actorId, action: "money_desk.transaction.created", entityType: "SeeraMoneyDeskTransaction", entityId: created.id, afterState: { purposeCode: def.code, amount: input.amount, status: created.status } });

  if (created.status === "PENDING_APPROVAL") return created;
  return processMoneyDeskTransaction(db, actorId, created.id);
}

export async function decideMoneyDeskApproval(db: PrismaClient, actorId: string, transactionId: string, input: { decision: "APPROVED" | "REJECTED"; reason: string }) {
  await authorize(db, { actorId, permission: "money_desk:approve" });
  if (!input.reason.trim()) throw new FoundationError("MONEY_DESK_APPROVAL_REASON_REQUIRED", "A reason is required", 400);
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (txn.status !== "PENDING_APPROVAL") throw new FoundationError("MONEY_DESK_NOT_PENDING_APPROVAL", "This transaction is not awaiting approval", 409);
  // Maker-checker (same convention as journal reversal / claim settlement elsewhere in this
  // codebase): the person who entered the transaction cannot also be the one who approves it.
  if (txn.requestedById === actorId) throw new FoundationError("MONEY_DESK_SELF_APPROVAL_DENIED", "Independent approval is required", 403);

  if (input.decision === "REJECTED") {
    const rejected = await db.seeraMoneyDeskTransaction.update({ where: { id: transactionId }, data: { status: "REJECTED", failureReason: input.reason } });
    await recordAudit(db, { actorId, action: "money_desk.transaction.rejected", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, reason: input.reason });
    return rejected;
  }
  await db.seeraMoneyDeskTransaction.update({ where: { id: transactionId }, data: { status: "POSTING", approvedById: actorId, approvedAt: new Date() } });
  await recordAudit(db, { actorId, action: "money_desk.transaction.approved", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId });
  return processMoneyDeskTransaction(db, actorId, transactionId);
}

// STEP 2 — turns an approved/auto-cleared transaction into real downstream
// records by calling the handler its purpose maps to. Safe to call more than
// once on the same transaction (e.g. a retry after a transient failure) —
// every handler derives its own downstream idempotencyKeys from this
// transaction's idempotencyKey, so already-completed steps short-circuit.
export async function processMoneyDeskTransaction(db: PrismaClient, actorId: string, transactionId: string) {
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (txn.status === "POSTED") return txn;
  if (txn.status !== "POSTING") throw new FoundationError("MONEY_DESK_NOT_POSTABLE", `Transaction is ${txn.status}, not ready to post`, 409);
  const def = purposeDefinition(txn.purposeCode);
  const formData = txn.formData as Record<string, unknown>;
  const handler = HANDLERS[def.handler];
  if (!handler) throw new FoundationError("MONEY_DESK_HANDLER_MISSING", `No handler registered for ${def.handler}`, 500);
  try {
    const downstreamRefs = await handler(db, actorId, txn, formData, def.code);
    const posted = await db.seeraMoneyDeskTransaction.update({ where: { id: transactionId }, data: { status: "POSTED", downstreamRefs: downstreamRefs as never, failureReason: null } });
    await recordAudit(db, { actorId, action: "money_desk.transaction.posted", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, afterState: downstreamRefs as never });
    return posted;
  } catch (error) {
    const message = error instanceof FoundationError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : "Unknown error";
    await db.seeraMoneyDeskTransaction.update({ where: { id: transactionId }, data: { failureReason: message } });
    await recordAudit(db, { actorId, action: "money_desk.transaction.posting_failed", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, reason: message });
    throw error;
  }
}

// Void/reverse a POSTED transaction. V1 scope, deliberately: only purposes
// whose handler produced exactly one journal directly (the journal-only
// purposes — expenses, salary, institutional receipt, adjustment, fixed
// asset, refund) can be auto-reversed here, reusing journal-service's own
// reverseJournal (which already enforces poster != reverser and posted-only).
// GRN/VendorBill/Order-based purposes (Raw Material Purchase, Offline Sale)
// are NOT auto-reversible from Money Desk in V1 — voiding those requires
// reversing each real domain record through Finance/Manufacturing/Sales
// directly, which already have their own correct reversal mechanics; Money
// Desk deliberately does not invent a shortcut across module boundaries.
export async function voidMoneyDeskTransaction(db: PrismaClient, actorId: string, transactionId: string, input: { reason: string }) {
  await authorize(db, { actorId, permission: "money_desk:reverse" });
  if (!input.reason.trim()) throw new FoundationError("MONEY_DESK_VOID_REASON_REQUIRED", "A reason is required", 400);
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (txn.status !== "POSTED") throw new FoundationError("MONEY_DESK_NOT_VOIDABLE", "Only a posted transaction can be voided", 409);
  if (txn.requestedById === actorId) throw new FoundationError("MONEY_DESK_SELF_VOID_DENIED", "Independent approval is required to void your own transaction", 403);
  const refs = (txn.downstreamRefs ?? {}) as { journalId?: string };
  if (!refs.journalId)
    throw new FoundationError(
      "MONEY_DESK_VOID_NOT_SUPPORTED",
      "This transaction type must be reversed through Finance/Manufacturing/Sales directly — Money Desk does not auto-reverse GRN/Order-based transactions",
      409,
    );
  const { reverseJournal } = await import("./journal-service");
  await reverseJournal(db, actorId, refs.journalId, { reason: input.reason, idempotencyKey: `${txn.idempotencyKey}:void`, approverId: actorId });
  const voided = await db.seeraMoneyDeskTransaction.update({ where: { id: transactionId }, data: { status: "VOIDED", voidedById: actorId, voidedAt: new Date(), voidReason: input.reason } });
  await recordAudit(db, { actorId, action: "money_desk.transaction.voided", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, reason: input.reason });
  return voided;
}

type Handler = (
  db: PrismaClient,
  actorId: string,
  txn: { id: string; idempotencyKey: string; amount: unknown; date: Date; treasuryAccountId: string | null; counterpartyId: string | null; counterpartyName: string | null; description: string | null; documentFileId: string | null; requestedById: string },
  formData: Record<string, unknown>,
  purposeCode: string,
) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, Handler> = {
  QUICK_ENTRY_EXPENSE: async (db, actorId, txn, formData, purposeCode) => {
    const { quickEntryCreate } = await import("./quick-entry-service");
    const def = purposeDefinition(purposeCode);
    let categoryId: string | undefined;
    if (def.quickEntryCategoryCode) {
      const category = await db.seeraExpenseCategory.findFirst({ where: { code: def.quickEntryCategoryCode } });
      categoryId = category?.id;
    }
    const result = await quickEntryCreate(db, actorId, {
      entryType: def.quickEntryType ?? "OTHER",
      date: txn.date,
      amount: Number(txn.amount),
      categoryId,
      manualCategoryName: categoryId ? undefined : def.label,
      paymentMode: (formData.paymentMode as "CASH" | "BANK" | "UPI" | "OTHER") ?? "CASH",
      treasuryAccountId: txn.treasuryAccountId ?? undefined,
      partyName: txn.counterpartyName ?? undefined,
      employeeId: (formData.employeeId as string) ?? undefined,
      remark: txn.description ?? undefined,
      documentFileId: txn.documentFileId ?? undefined,
      idempotencyKey: txn.idempotencyKey,
    });
    // quickEntryCreate has its OWN internal governance (submitExpense's approval-policy check,
    // postExpense requiring expense:post) — if the actor's authority stops short of full posting,
    // the expense correctly sits at SUBMITTED/APPROVED rather than POSTED. Money Desk must not
    // silently claim POSTED over that — surfacing it as a posting failure (with the real expense id
    // preserved for follow-up) is honest; someone with the remaining authority completes it directly
    // in Finance OS, and Money Desk's own status stays truthful rather than double-gating approval.
    if (result.expense.status !== "POSTED")
      throw new FoundationError("MONEY_DESK_UNDERLYING_EXPENSE_NOT_POSTED", `Expense ${result.expense.expenseNumber} is ${result.expense.status}, not yet posted — complete it in Finance OS (expense:post authority required)`, 409);
    return { expenseId: result.expense.id, journalId: result.expense.journalId ?? undefined };
  },

  VENDOR_PAYMENT: async (db, actorId, txn, formData) => {
    const payment = await recordVendorPayment(db, actorId, {
      vendorId: txn.counterpartyId!,
      billId: formData.billId as string,
      amount: Number(txn.amount),
      treasuryAccountId: txn.treasuryAccountId!,
      treasuryAccountCoaCode: formData.treasuryAccountCoaCode as string,
      paymentMode: (formData.paymentMode as string) ?? "BANK",
      reference: txn.description ?? undefined,
      paymentDate: txn.date,
      idempotencyKey: txn.idempotencyKey,
    });
    // recordVendorPayment returns the pre-journal-link row (existing behavior, not Money Desk's to
    // change) — re-read for the real journalId so voidMoneyDeskTransaction can find it later.
    const withJournal = await db.seeraVendorPayment.findUniqueOrThrow({ where: { id: payment.id } });
    return { vendorPaymentId: payment.id, journalId: withJournal.journalId ?? undefined };
  },

  INSTITUTIONAL_RECEIPT: async (db, actorId, txn, formData) => {
    const hasKnownParty = Boolean(txn.counterpartyId);
    const journal = await recordMoneyIn(db, actorId, {
      type: hasKnownParty ? "INVOICE_RECEIPT" : "CUSTOMER_ADVANCE",
      date: txn.date,
      amount: Number(txn.amount),
      treasuryAccountId: txn.treasuryAccountId!,
      partyType: hasKnownParty ? "CUSTOMER" : undefined,
      partyId: txn.counterpartyId ?? undefined,
      mode: (formData.paymentMode as string) ?? "BANK",
      reference: txn.description ?? txn.counterpartyName ?? undefined,
      idempotencyKey: txn.idempotencyKey,
    });
    return { journalId: journal.id, unallocated: !hasKnownParty };
  },

  FIXED_ASSET: async (db, actorId, txn, formData) => {
    const asset = await createFixedAsset(db, actorId, {
      name: txn.counterpartyName ?? "Fixed asset",
      category: (formData.category as string) ?? "MACHINERY",
      purchaseDate: txn.date,
      cost: Number(txn.amount),
      vendorId: txn.counterpartyId ?? undefined,
      documentFileId: txn.documentFileId ?? undefined,
      usefulLifeMonths: formData.usefulLifeMonths ? Number(formData.usefulLifeMonths) : undefined,
      residualValue: formData.residualValue ? Number(formData.residualValue) : undefined,
      treasuryAccountId: txn.treasuryAccountId!,
      treasuryAccountCoaCode: formData.treasuryAccountCoaCode as string,
      idempotencyKey: txn.idempotencyKey,
    });
    return { fixedAssetId: asset.id, journalId: asset.journalId ?? undefined };
  },

  REFUND: async (db, actorId, txn, formData) => {
    const returnRequestId = formData.sourceReturnRequestId as string;
    const returnRequest = await db.seeraReturnRequest.findUniqueOrThrow({ where: { id: returnRequestId } });
    if (returnRequest.status !== "APPROVED") throw new FoundationError("MONEY_DESK_REFUND_SOURCE_NOT_APPROVED", "The source Return Request must be APPROVED before a refund can be paid", 409);
    if (!returnRequest.creditNoteRequested) throw new FoundationError("MONEY_DESK_REFUND_NOT_REQUESTED", "This Return Request did not request a credit note/refund", 409);
    if (returnRequest.refundJournalId) return { journalId: returnRequest.refundJournalId, sourceReturnRequestId: returnRequestId };
    const journal = await recordMoneyOut(db, actorId, {
      type: "REFUND",
      date: txn.date,
      amount: Number(txn.amount),
      treasuryAccountId: txn.treasuryAccountId!,
      partyType: "CUSTOMER",
      partyId: returnRequest.retailerId ?? undefined,
      mode: (formData.paymentMode as string) ?? "BANK",
      reference: `Refund for return ${returnRequest.requestNumber}`,
      idempotencyKey: txn.idempotencyKey,
    });
    await db.seeraReturnRequest.update({ where: { id: returnRequestId }, data: { refundJournalId: journal.id } });
    return { journalId: journal.id, sourceReturnRequestId: returnRequestId };
  },

  ADJUSTMENT: async (db, actorId, txn, formData) => {
    const accountCode = formData.adjustmentAccountCode as string;
    const treasuryCoaCode = formData.treasuryAccountCoaCode as string;
    const isCredit = txn.description?.startsWith("CREDIT:") ?? false;
    const journal = await postJournal(db, actorId, {
      date: txn.date,
      sourceType: "MANUAL",
      narration: `Money Desk adjustment — ${txn.description ?? accountCode}`,
      idempotencyKey: txn.idempotencyKey,
      lines: isCredit
        ? [
            { accountId: treasuryCoaCode, debit: Number(txn.amount), treasuryAccountId: txn.treasuryAccountId ?? undefined },
            { accountId: accountCode, credit: Number(txn.amount) },
          ]
        : [
            { accountId: accountCode, debit: Number(txn.amount) },
            { accountId: treasuryCoaCode, credit: Number(txn.amount), treasuryAccountId: txn.treasuryAccountId ?? undefined },
          ],
    });
    return { journalId: journal.id };
  },

  RAW_MATERIAL_PURCHASE: async (db, actorId, txn, formData) => {
    const vendorId = txn.counterpartyId!;
    const grn = await createGrn(db, actorId, {
      date: txn.date,
      vendorId,
      purchaseRef: formData.vendorInvoiceNumber as string,
      idempotencyKey: `${txn.idempotencyKey}:grn`,
      lines: [
        {
          materialId: formData.materialId as string,
          quantity: Number(formData.quantity),
          unit: formData.unit as never,
          canonicalQuantity: Number(formData.quantity),
          acceptedQuantity: Number(formData.quantity),
          unitCost: formData.unitCost != null ? Number(formData.unitCost) : undefined,
          manufactureDate: formData.manufactureDate ? new Date(formData.manufactureDate as string) : undefined,
          expiryDate: formData.expiryDate ? new Date(formData.expiryDate as string) : undefined,
          locationId: formData.locationId as string,
          documentFileId: txn.documentFileId ?? undefined,
        },
      ],
    });
    const postedGrn = grn.status === "DRAFT" ? await postGrn(db, actorId, grn.id) : grn;

    const existingBill = await db.seeraVendorBill.findFirst({ where: { idempotencyKey: `${txn.idempotencyKey}:bill` } });
    const bill =
      existingBill ??
      (await createVendorBill(db, actorId, {
        vendorId,
        vendorInvoiceNumber: formData.vendorInvoiceNumber as string,
        invoiceDate: (formData.invoiceDate ? new Date(formData.invoiceDate as string) : txn.date),
        dueDate: new Date(formData.dueDate as string),
        category: "5000",
        description: txn.description ?? undefined,
        taxable: Number(formData.taxable ?? txn.amount),
        cgst: formData.cgst != null ? Number(formData.cgst) : undefined,
        sgst: formData.sgst != null ? Number(formData.sgst) : undefined,
        igst: formData.igst != null ? Number(formData.igst) : undefined,
        documentFileId: txn.documentFileId ?? undefined,
        idempotencyKey: `${txn.idempotencyKey}:bill`,
      }));
    if (!existingBill || !bill.sourceGrnId) await db.seeraVendorBill.update({ where: { id: bill.id }, data: { sourceGrnId: postedGrn.id } }).catch(() => {});

    const paidNow = Boolean(formData.paidNow);
    let paymentId: string | undefined;
    if (paidNow) {
      const existingPayment = await db.seeraVendorPayment.findFirst({ where: { idempotencyKey: `${txn.idempotencyKey}:payment` } });
      const payment =
        existingPayment ??
        (await recordVendorPayment(db, actorId, {
          vendorId,
          billId: bill.id,
          amount: Number(bill.grossAmount) - Number(bill.paidAmount),
          treasuryAccountId: txn.treasuryAccountId!,
          treasuryAccountCoaCode: formData.treasuryAccountCoaCode as string,
          paymentMode: (formData.paymentMode as string) ?? "BANK",
          reference: `Raw material purchase ${bill.billNumber}`,
          paymentDate: txn.date,
          idempotencyKey: `${txn.idempotencyKey}:payment`,
        }));
      paymentId = payment.id;
    }
    return { grnId: postedGrn.id, vendorId, billId: bill.id, paymentId, paidNow };
  },

  OFFLINE_SALE: async (db, actorId, txn, formData) => {
    const retailer = await createRetailer(db, actorId, {
      businessName: txn.counterpartyName ?? "Walk-in / Counter Sale",
      address: { line: "Counter sale — no fixed address" },
      customerType: "INSTITUTIONAL_OTHER",
      idempotencyKey: `${txn.idempotencyKey}:retailer`,
    });
    const lines = (formData.skuLines as { skuId: string; quantity: number; rate?: number }[]) ?? [];
    const order = await placeRetailerOrder(
      db,
      { actorId, sourcePortal: "sales-manager", commercialPartyType: "DISTRIBUTOR", commercialPartyId: "" },
      { retailerId: retailer.id, idempotencyKey: `${txn.idempotencyKey}:order`, lines, source: "OTHER" },
    );
    return { retailerId: retailer.id, orderId: order.id };
  },
};

// Money Desk HOME screen read model. Today's Cash/Bank is deliberately
// computed from the REAL SeeraJournalLine ledger (POSTED journals only, per
// treasury account) — never from SeeraMoneyDeskTransaction's own rows, which
// would let a Money-Desk-only view of cash drift from what Finance OS itself
// shows. Needs Attention surfaces exceptions explicitly rather than hiding
// them: transactions stuck in POSTING with a recorded failure (safe to
// retry), and approvals waiting more than a day.
export async function moneyDeskHome(db: PrismaClient, actorId: string) {
  const { permissions } = await authorize(db, { actorId, permission: "money_desk:view" });
  const viewAll = permissions.has("money_desk:view_all") || permissions.has("system:super_admin");
  const scope = viewAll ? {} : { requestedById: actorId };

  const [recent, pendingApproval, stuckPosting, treasuryAccounts, todayLines] = await Promise.all([
    db.seeraMoneyDeskTransaction.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 25 }),
    db.seeraMoneyDeskTransaction.findMany({ where: { ...scope, status: "PENDING_APPROVAL" }, orderBy: { createdAt: "asc" } }),
    db.seeraMoneyDeskTransaction.findMany({ where: { ...scope, status: "POSTING", failureReason: { not: null } }, orderBy: { createdAt: "asc" } }),
    db.seeraTreasuryAccount.findMany({ where: { isActive: true } }),
    db.seeraJournalLine.groupBy({
      by: ["treasuryAccountId"],
      where: { treasuryAccountId: { not: null }, journal: { status: "POSTED", date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
      _sum: { debit: true, credit: true },
    }),
  ]);

  // Opening-today + today's net movement, per treasury account — a real, if
  // slightly simplified (no explicit opening-balance carry-forward beyond
  // what's already posted historically), running balance straight off the
  // ledger. allTimeLines gives the true balance as of right now; todayLines
  // is only used to label how much of it moved today.
  const allTimeLines = await db.seeraJournalLine.groupBy({
    by: ["treasuryAccountId"],
    where: { treasuryAccountId: { not: null }, journal: { status: "POSTED" } },
    _sum: { debit: true, credit: true },
  });
  const balanceByAccount = new Map(allTimeLines.map((l) => [l.treasuryAccountId, Number(l._sum.debit ?? 0) - Number(l._sum.credit ?? 0)]));
  const todayMovementByAccount = new Map(todayLines.map((l) => [l.treasuryAccountId, Number(l._sum.debit ?? 0) - Number(l._sum.credit ?? 0)]));

  const cashBankToday = treasuryAccounts.map((account) => ({
    treasuryAccountId: account.id,
    name: account.name,
    kind: account.kind,
    balance: balanceByAccount.get(account.id) ?? 0,
    movedToday: todayMovementByAccount.get(account.id) ?? 0,
  }));

  return {
    recentTransactions: recent,
    pendingApprovals: pendingApproval,
    needsAttention: stuckPosting.map((t) => ({ id: t.id, transactionNumber: t.transactionNumber, purposeCode: t.purposeCode, amount: t.amount, failureReason: t.failureReason })),
    cashBankToday,
    canApprove: permissions.has("money_desk:approve") || permissions.has("system:super_admin"),
    canVoid: permissions.has("money_desk:reverse") || permissions.has("system:super_admin"),
  };
}

// Picker data for the dynamic forms — deliberately gated on ONLY
// money_desk:view (not vendor:manage/mfg_grn:manage/etc.), so a plain Money
// Desk operator can see the choices for a purpose they're allowed to select;
// actually completing a gated purpose (e.g. Raw Material Purchase without
// mfg_grn:manage) still fails at submit time inside the real handler — this
// is convenience data, never the security boundary.
export async function moneyDeskSupportingData(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "money_desk:view" });
  const [treasuryAccounts, vendors, materials, locations, pendingReturnRequests, openVendorBills] = await Promise.all([
    db.seeraTreasuryAccount.findMany({ where: { isActive: true }, select: { id: true, name: true, kind: true, chartOfAccountId: true } }),
    db.seeraVendor.findMany({ where: { isActive: true }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" }, take: 200 }),
    db.seeraManufacturingMaterial.findMany({ select: { id: true, code: true, name: true, baseUnit: true }, orderBy: { name: "asc" }, take: 500 }),
    db.seeraManufacturingLocation.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.seeraReturnRequest.findMany({ where: { status: "APPROVED", creditNoteRequested: true, refundJournalId: null }, select: { id: true, requestNumber: true, reason: true, retailerId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.seeraVendorBill.findMany({ where: { status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, select: { id: true, billNumber: true, vendorId: true, grossAmount: true, paidAmount: true }, orderBy: { dueDate: "asc" }, take: 200 }),
  ]);
  const treasuryCoaIds = treasuryAccounts.map((t) => t.chartOfAccountId);
  const treasuryCoas = await db.seeraChartOfAccount.findMany({ where: { id: { in: treasuryCoaIds } }, select: { id: true, code: true } });
  const coaCodeByAccountId = new Map(treasuryCoas.map((c) => [c.id, c.code]));
  return {
    treasuryAccounts: treasuryAccounts.map((t) => ({ id: t.id, name: t.name, kind: t.kind, coaCode: coaCodeByAccountId.get(t.chartOfAccountId) ?? "" })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.tradeName ?? v.legalName })),
    materials,
    locations,
    pendingReturnRequests,
    openVendorBills: openVendorBills.map((b) => ({ id: b.id, billNumber: b.billNumber, vendorId: b.vendorId, due: Number(b.grossAmount) - Number(b.paidAmount) })),
  };
}
