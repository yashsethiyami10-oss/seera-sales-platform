import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { financeNumberFor } from "./numbering";
import { purposeDefinition, type MoneyDeskDirection } from "./money-desk-registry";
import { recordMoneyIn, recordMoneyOut } from "./treasury-service";
import { createVendor, createVendorBill, recordVendorPayment } from "./vendor-service";
import { createFixedAsset } from "./loan-asset-service";
import { postJournal } from "./journal-service";
import { createGrn, postGrn } from "@/lib/manufacturing/grn-service";
import { createRetailer } from "@/lib/sales-distribution/field-portal-service";
import { placeRetailerOrder } from "@/lib/sales-distribution/workflow-service";
import { deriveCostCentre } from "./cost-centre";

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

// P0 Money Desk architecture correction: origin is a SERVER fact, derived from the actor's ACTUAL
// effective permissions/role at the moment of creation — never trusted from anything the client
// sends. system:super_admin is the SAME signal already established elsewhere in this file
// (finalizeForFounder) for "this actor has genuine Founder authority" — reused here rather than
// inventing a second, weaker check. The other buckets are informational (who/what created this,
// for the transaction detail/audit trail) and do not themselves grant any bypass — only
// FOUNDER_PORTAL does, and only because it's tied to the same permission the rest of this codebase
// already treats as Founder-final-authority.
async function resolveMoneyDeskSource(db: PrismaClient, actorId: string): Promise<"FOUNDER_PORTAL" | "ACCOUNTS_PORTAL" | "MANAGER_PORTAL" | "OTHER_OPERATOR"> {
  const permissions = await effectivePermissions(db, actorId);
  if (permissions.has("system:super_admin")) return "FOUNDER_PORTAL";
  const roles = await db.userRoleAssignment.findMany({ where: { userId: actorId, status: "ACTIVE" }, select: { role: { select: { code: true } } } });
  const codes = new Set(roles.map((r) => r.role.code));
  if (codes.has("ACCOUNTS_MANAGER") || codes.has("ACCOUNTS_EXECUTIVE")) return "ACCOUNTS_PORTAL";
  if (codes.has("SALES_MANAGER")) return "MANAGER_PORTAL";
  return "OTHER_OPERATOR";
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
  // Idempotency is checked BEFORE any master-data side effect. A replay must be a pure read,
  // not create/re-resolve a Vendor a second time.
  const existing = await db.seeraMoneyDeskTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  // counterpartyId/counterpartyName are top-level MoneyDeskCreateInput fields (not part of the
  // purpose-specific formData blob) — the registry's requiredFields list treats them as ordinary
  // field keys, so check both places rather than only formData.
  // Procurement-party convenience: Money Desk should not force the Founder to leave the
  // transaction to create master data first. If a vendor ID is supplied, it remains authoritative.
  // If only a vendor name is supplied, reuse an exact existing legal/trade name; otherwise create
  // one through the real Vendor service (and therefore its normal vendor:manage authorization).
  // This is intentionally limited to vendor counterparties; it never fabricates customer/retailer
  // identities and never changes the accounting engine.
  let resolvedCounterpartyId = input.counterpartyId;
  if (def.counterpartyType === "VENDOR" && !resolvedCounterpartyId && input.counterpartyName?.trim()) {
    const existingVendor = await db.seeraVendor.findFirst({
      where: {
        OR: [
          { legalName: { equals: input.counterpartyName.trim(), mode: "insensitive" } },
          { tradeName: { equals: input.counterpartyName.trim(), mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (existingVendor) {
      resolvedCounterpartyId = existingVendor.id;
    } else {
      const vendorPermissions = await effectivePermissions(db, actorId);
      if (!vendorPermissions.has("vendor:manage") && !vendorPermissions.has("system:super_admin"))
        throw new FoundationError("VENDOR_MASTER_ACCESS_REQUIRED", "Select an existing Vendor or use an account with Vendor master access to create a new procurement party", 403);
      const code = `MD-${input.counterpartyName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}`;
      const vendor = await createVendor(db, actorId, {
        code: code || `MD-${input.idempotencyKey.slice(0, 12).toUpperCase()}`,
        legalName: input.counterpartyName.trim(),
        tradeName: input.counterpartyName.trim(),
      });
      resolvedCounterpartyId = vendor.id;
    }
    await recordAudit(db, {
      actorId,
      action: "money_desk.counterparty.resolved",
      entityType: "SeeraVendor",
      entityId: resolvedCounterpartyId,
      afterState: { sourceName: input.counterpartyName.trim(), reused: Boolean(existingVendor) },
    });
  }
  const topLevelByField: Record<string, unknown> = { counterpartyId: resolvedCounterpartyId, counterpartyName: input.counterpartyName };
  for (const field of def.requiredFields) {
    const value = field in topLevelByField ? topLevelByField[field] : input.formData[field];
    if (value == null || value === "")
      throw new FoundationError("MONEY_DESK_FIELD_REQUIRED", `"${field}" is required for ${def.label}`, 400);
  }
  if (def.documentPolicy === "REQUIRED" && !input.documentFileId)
    throw new FoundationError("MONEY_DESK_DOCUMENT_REQUIRED", `${def.label} requires a supporting document`, 400);

  // QUICK_ENTRY_EXPENSE purposes (Salary/Fuel/Rent/.../Other) reuse quickEntryCreate, which already
  // runs its OWN threshold-based approval gate internally via submitExpense — checking
  // SeeraFinanceApprovalPolicy["EXPENSE"] here TOO would double-gate the same money movement behind
  // two separate, redundant approval steps. Money Desk skips its own pre-check for these and always
  // proceeds to POSTING; if the underlying Expense still needs its own separate clearance, the
  // handler's own status check (below) surfaces that honestly via Needs Attention rather than a
  // second Money-Desk-level approval screen.
  const policy = await db.seeraFinanceApprovalPolicy.findUnique({ where: { category: def.approvalCategory } });
  const source = await resolveMoneyDeskSource(db, actorId);
  // P0 architecture correction: a Founder-Portal-originated entry is authoritative — it must not
  // sit in PENDING_APPROVAL waiting for someone else's sign-off on the Founder's own action. This
  // is the ONLY thing FOUNDER_PORTAL grants; every other purpose/policy/threshold rule below is
  // otherwise unchanged, and normal operators (ACCOUNTS_PORTAL/MANAGER_PORTAL/OTHER_OPERATOR) still
  // go through the exact same policy-threshold gate as before.
  const requiresApproval =
    source === "FOUNDER_PORTAL"
      ? false
      : def.handler === "QUICK_ENTRY_EXPENSE"
        ? false
        : def.code === "ADJ-GOV"
          ? true
          : policy
            ? policy.requiresApproval && input.amount >= Number(policy.thresholdAmount)
            : true;

  const created = await db.seeraMoneyDeskTransaction.create({
    data: {
      transactionNumber: financeNumberFor("MD", input.idempotencyKey),
      purposeCode: def.code,
      direction: input.direction,
      status: requiresApproval ? "PENDING_APPROVAL" : "POSTING",
      source,
      amount: input.amount,
      date: input.date,
      treasuryAccountId: input.treasuryAccountId,
      counterpartyType: def.counterpartyType === "NONE" ? input.counterpartyType : def.counterpartyType,
      counterpartyId: resolvedCounterpartyId,
      counterpartyName: input.counterpartyName,
      description: input.description,
      documentFileId: input.documentFileId,
      formData: input.formData as never,
      requestedById: actorId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordAudit(db, { actorId, action: "money_desk.transaction.created", entityType: "SeeraMoneyDeskTransaction", entityId: created.id, afterState: { purposeCode: def.code, amount: input.amount, status: created.status, source } });

  if (created.status === "PENDING_APPROVAL") return created;
  return processMoneyDeskTransaction(db, actorId, created.id);
}

export async function decideMoneyDeskApproval(db: PrismaClient, actorId: string, transactionId: string, input: { decision: "APPROVED" | "REJECTED"; reason: string }) {
  await authorize(db, { actorId, permission: "money_desk:approve" });
  if (!input.reason.trim()) throw new FoundationError("MONEY_DESK_APPROVAL_REASON_REQUIRED", "A reason is required", 400);
  // Explicit read projection intentionally excludes the two newest Money Desk columns
  // (source/correctionOfId). This keeps historical Money Desk reads backward-compatible while
  // production migration state is being reconciled; writes still require the governed schema.
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      id: true, transactionNumber: true, purposeCode: true, direction: true, status: true,
      amount: true, date: true, treasuryAccountId: true, counterpartyType: true,
      counterpartyId: true, counterpartyName: true, description: true, documentFileId: true,
      formData: true, downstreamRefs: true, failureReason: true, requestedById: true,
      approvedById: true, approvedAt: true, voidedById: true, voidedAt: true,
      voidReason: true, idempotencyKey: true, createdAt: true, updatedAt: true,
    },
  });
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
  // P0 architecture correction (Rule 4): a genuine Founder (system:super_admin) does not need
  // another user's independent sign-off to void/correct their OWN Founder-Portal entry — same
  // final-authority signal as resolveMoneyDeskSource's FOUNDER_PORTAL bypass above. Every other
  // actor (Accounts/Manager/Operator) still requires independent maker-checker void, unchanged.
  if (txn.requestedById === actorId) {
    const permissions = await effectivePermissions(db, actorId);
    if (!permissions.has("system:super_admin"))
      throw new FoundationError("MONEY_DESK_SELF_VOID_DENIED", "Independent approval is required to void your own transaction", 403);
  }
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

// P0 architecture correction (Rule 3): the Founder can edit their OWN entry. Deliberately a thin
// orchestration over the two primitives above, not a new mutation path — never touches accounting
// state directly. Not-yet-posted (DRAFT/PENDING_APPROVAL) is a genuine safe in-place update (no
// accounting effect exists yet to protect). POSTED is a governed correction: void the original
// (reusing voidMoneyDeskTransaction — including its own Founder-self-void bypass and its existing,
// documented V1 scope limit to journal-only purposes) and create a new, corrected transaction
// linked back via correctionOfId — the original row is never rewritten or deleted, only VOIDED.
export async function editMoneyDeskTransaction(
  db: PrismaClient,
  actorId: string,
  transactionId: string,
  input: { amount?: number; date?: Date; counterpartyName?: string; description?: string; formData?: Record<string, unknown>; reason: string; idempotencyKey: string },
) {
  if (!input.reason.trim()) throw new FoundationError("MONEY_DESK_EDIT_REASON_REQUIRED", "A reason is required", 400);
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  if (txn.requestedById !== actorId) throw new FoundationError("MONEY_DESK_EDIT_NOT_OWNER", "You may only edit an entry you created", 403);
  const permissions = await effectivePermissions(db, actorId);
  if (!permissions.has("system:super_admin"))
    throw new FoundationError("MONEY_DESK_EDIT_FOUNDER_ONLY", "Direct edit is a Founder-Portal capability — void and re-enter, or ask a Founder to correct it", 403);

  if (txn.status === "DRAFT" || txn.status === "PENDING_APPROVAL") {
    const updated = await db.seeraMoneyDeskTransaction.update({
      where: { id: transactionId },
      data: {
        amount: input.amount ?? undefined,
        date: input.date ?? undefined,
        counterpartyName: input.counterpartyName ?? undefined,
        description: input.description ?? undefined,
        formData: input.formData ? (input.formData as never) : undefined,
      },
    });
    await recordAudit(db, { actorId, action: "money_desk.transaction.edited_pre_post", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, reason: input.reason, afterState: { amount: updated.amount.toString(), date: updated.date.toISOString() } });
    return updated;
  }

  if (txn.status === "POSTED") {
    const voided = await voidMoneyDeskTransaction(db, actorId, transactionId, { reason: `Correction: ${input.reason}` });
    const corrected = await createMoneyDeskTransaction(db, actorId, {
      purposeCode: txn.purposeCode,
      direction: txn.direction,
      amount: input.amount ?? Number(txn.amount),
      date: input.date ?? txn.date,
      treasuryAccountId: txn.treasuryAccountId ?? undefined,
      counterpartyType: txn.counterpartyType ?? undefined,
      counterpartyId: txn.counterpartyId ?? undefined,
      counterpartyName: input.counterpartyName ?? txn.counterpartyName ?? undefined,
      description: input.description ?? txn.description ?? undefined,
      documentFileId: txn.documentFileId ?? undefined,
      formData: (input.formData ?? (txn.formData as Record<string, unknown>)) ?? {},
      idempotencyKey: input.idempotencyKey,
    });
    await db.seeraMoneyDeskTransaction.update({ where: { id: corrected.id }, data: { correctionOfId: transactionId } });
    await recordAudit(db, { actorId, action: "money_desk.transaction.corrected", entityType: "SeeraMoneyDeskTransaction", entityId: transactionId, reason: input.reason, afterState: { correctedTransactionId: corrected.id, voidedStatus: voided.status } });
    return { ...corrected, correctionOfId: transactionId };
  }

  throw new FoundationError("MONEY_DESK_EDIT_NOT_ALLOWED", `Cannot edit a transaction in ${txn.status} status`, 409);
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
      // Smart Finance "Other Party" passthrough: when the entry is against a governed
      // SeeraFinancialDimension{kind:OTHER_PARTY} (a person who is NOT an employee — labour advance
      // etc.), thread its type+id so the resulting SeeraExpense.payeeType/payeeId anchor it, and
      // the same person resolves automatically on the next natural-language entry. No effect for
      // ordinary entries (both undefined) — quickEntryCreate keeps its existing default behaviour.
      partyType: (formData.partyType as string) || undefined,
      partyId: (formData.partyId as string) || undefined,
      employeeId: (formData.employeeId as string) ?? undefined,
      // Governed override (Money Desk maturity pass, 23-Aug) — left blank, this auto-derives from
      // employeeId inside quickEntryCreate; an operator can still override with an explicit
      // territory when the source doesn't already know it (e.g. no employee on the entry).
      territoryId: (formData.territoryId as string) || undefined,
      remark: txn.description ?? undefined,
      documentFileId: txn.documentFileId ?? undefined,
      idempotencyKey: txn.idempotencyKey,
      finalizeForFounder: Boolean((await effectivePermissions(db, actorId)).has("system:super_admin")),
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

  // P0 architecture correction (Rules 6-11): this purpose is now for a NAMED customer only — a
  // genuinely anonymous walk-in belongs to SALE-WALKIN/OFFLINE_SALE_ANONYMOUS below, which never
  // reaches this handler at all. An existing customer (formData.retailerId set) is REUSED, never
  // re-created; a new one is created exactly once, inline, from the typed name — "+ Add Customer"
  // without abandoning the sale. This was the exact bug Rule 11 flagged: the old handler
  // unconditionally created a brand-new SeeraRetailer master record on every single sale.
  OFFLINE_SALE: async (db, actorId, txn, formData) => {
    const existingRetailerId = (formData.retailerId as string | undefined)?.trim();
    let retailerId: string;
    if (existingRetailerId) {
      const existing = await db.seeraRetailer.findUnique({ where: { id: existingRetailerId }, select: { id: true } });
      if (!existing) throw new FoundationError("MONEY_DESK_RETAILER_NOT_FOUND", "The selected existing customer could not be found", 404);
      retailerId = existing.id;
    } else {
      const retailer = await createRetailer(db, actorId, {
        businessName: txn.counterpartyName ?? "Walk-in / Counter Sale",
        address: { line: "Counter sale — no fixed address" },
        customerType: "INSTITUTIONAL_OTHER",
        idempotencyKey: `${txn.idempotencyKey}:retailer`,
      });
      retailerId = retailer.id;
    }
    const lines = (formData.skuLines as { skuId: string; quantity: number; rate?: number }[]) ?? [];
    const order = await placeRetailerOrder(
      db,
      { actorId, sourcePortal: "sales-manager", commercialPartyType: "DISTRIBUTOR", commercialPartyId: "" },
      { retailerId, idempotencyKey: `${txn.idempotencyKey}:order`, lines, source: "OTHER" },
    );
    return { retailerId, orderId: order.id };
  },

  // The genuine walk-in path (SALE-WALKIN purpose): deliberately does NOT touch the
  // Sales/Retailer/Inventory system at all — no retailer master record, no order, no SKU-level
  // stock deduction. Reuses the existing, already-governed, non-ledger SeeraFactoryCashSale event
  // (factory-cash-sale-service.ts) built earlier specifically for "no unnecessary ledger
  // requirement" cash sales — this is its intended caller, not a parallel accounting path.
  OFFLINE_SALE_ANONYMOUS: async (db, actorId, txn) => {
    const { createFactoryCashSale } = await import("./factory-cash-sale-service");
    const sale = await createFactoryCashSale(db, actorId, {
      saleDate: txn.date,
      partyName: txn.counterpartyName ?? undefined,
      amount: Number(txn.amount),
      notes: txn.description ?? undefined,
      idempotencyKey: `${txn.idempotencyKey}:cashsale`,
    });
    return { factoryCashSaleId: sale.id };
  },
};

// Money Desk HOME screen read model. Today's Cash/Bank is deliberately
// computed from the REAL SeeraJournalLine ledger (POSTED journals only, per
// treasury account) — never from SeeraMoneyDeskTransaction's own rows, which
// would let a Money-Desk-only view of cash drift from what Finance OS itself
// shows. Needs Attention surfaces exceptions explicitly rather than hiding
// them: transactions stuck in POSTING with a recorded failure (safe to
// retry), and approvals waiting more than a day.
// Final closure (23-Aug), Money Desk finalization: the Sales & Distribution domain (S.S. company-
// order payments, TA reimbursements, Credit Notes) posts its own financial effect through
// SeeraFinancialEntry (financial-service.ts/document-service.ts/travel-claim-service.ts) — a
// completely separate, already-correct ledger from the Manufacturing/Vendor domain's
// SeeraJournalLine Money Desk itself posts to. This is a READ-ONLY bridge, not a second accounting
// engine: it surfaces what's pending/recent in that OTHER ledger so Accounts sees everything in one
// place, but every action link routes to that domain's own existing, already-governed screen
// (payment-inbox, ta-expenses) — Money Desk never re-implements verify/pay logic for these, and
// therefore can never double-post against them.
const EMPTY_SALES_DISTRIBUTION_BRIDGE = { pendingPaymentProofs: [], pendingTaClaims: [], recentEntries: [] } as const;

async function salesDistributionBridge(db: PrismaClient, viewAll: boolean) {
  // Company-wide S.S. payment / TA / document activity is Accounts-scope data, not per-requester —
  // mirror moneyDeskHome's own viewAll split rather than leaking it to a non-Accounts Money Desk user.
  if (!viewAll) return EMPTY_SALES_DISTRIBUTION_BRIDGE;
  const [pendingProofs, pendingTaClaims, recentEntries] = await Promise.all([
    db.seeraPaymentProof.findMany({
      where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      include: { order: { select: { orderNumber: true, buyerPartnerId: true } } },
      orderBy: { submittedAt: "asc" },
      take: 25,
    }),
    db.seeraTaClaim.findMany({
      where: { status: "SENT_TO_ACCOUNTS" },
      select: { id: true, claimNumber: true, employeeId: true, totalApproved: true, sentToAccountsAt: true },
      orderBy: { sentToAccountsAt: "asc" },
      take: 25,
    }),
    db.seeraFinancialEntry.findMany({
      where: { status: "POSTED", OR: [{ taClaimId: { not: null } }, { type: { in: ["ADVANCE", "REIMBURSEMENT", "CREDIT_NOTE", "DEBIT_NOTE", "INVOICE"] } }] },
      orderBy: { postedAt: "desc" },
      take: 15,
    }),
  ]);
  const proofPartnerIds = [...new Set(pendingProofs.map((p) => p.order.buyerPartnerId).filter((id): id is string => Boolean(id)))];
  const claimEmployeeIds = pendingTaClaims.map((c) => c.employeeId);
  const [partners, employees] = await Promise.all([
    db.seeraPartner.findMany({ where: { id: { in: proofPartnerIds } }, select: { id: true, legalName: true, tradeName: true } }),
    db.user.findMany({ where: { id: { in: claimEmployeeIds } }, select: { id: true, name: true, email: true } }),
  ]);
  const partnerName = new Map(partners.map((p) => [p.id, p.tradeName ?? p.legalName]));
  const employeeName = new Map(employees.map((e) => [e.id, e.name ?? e.email]));
  return {
    // `amount` is a Prisma Decimal on every raw row here too (see the identical note on
    // moneyDeskHome's enrichRow above) — this whole object feeds the client MoneyDeskPanel via
    // moneyDeskHome's `salesDistribution` field.
    pendingPaymentProofs: pendingProofs.map((p) => ({
      id: p.id,
      orderNumber: p.order.orderNumber,
      partyName: (p.order.buyerPartnerId ? partnerName.get(p.order.buyerPartnerId) : undefined) ?? p.order.buyerPartnerId ?? "—",
      amount: Number(p.amount),
      reference: p.reference,
      submittedAt: p.submittedAt,
      actionPath: "/portal/accounts/payment-inbox",
    })),
    pendingTaClaims: pendingTaClaims.map((c) => ({
      id: c.id,
      claimNumber: c.claimNumber,
      employeeName: employeeName.get(c.employeeId) ?? c.employeeId,
      amount: Number(c.totalApproved),
      sentToAccountsAt: c.sentToAccountsAt,
      actionPath: "/portal/accounts/ta-expenses",
    })),
    recentEntries: recentEntries.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      type: e.type,
      amount: Number(e.amount),
      postedAt: e.postedAt,
      reason: e.reason,
    })),
  };
}

// TRANSACTION DETAIL (Founder closure pass, 24-Aug §6) — the missing drill-down page. Read-only;
// resolves every raw id already present on the transaction (formData.employeeId/territoryId,
// treasuryAccountId, downstreamRefs) into human-readable names/links, never a JSON dump. Same
// scope rule as moneyDeskHome: a non-view_all actor may only open their OWN transactions.
export async function moneyDeskTransactionDetail(db: PrismaClient, actorId: string, transactionId: string) {
  const { permissions } = await authorize(db, { actorId, permission: "money_desk:view" });
  const viewAll = permissions.has("money_desk:view_all") || permissions.has("system:super_admin");
  // Keep drill-down reads compatible with historical production schema while the additive
  // Money Desk source/correction migration is being reconciled.
  const txn = await db.seeraMoneyDeskTransaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      id: true, transactionNumber: true, purposeCode: true, direction: true, status: true,
      amount: true, date: true, treasuryAccountId: true, counterpartyType: true,
      counterpartyId: true, counterpartyName: true, description: true, documentFileId: true,
      formData: true, downstreamRefs: true, failureReason: true, requestedById: true,
      approvedById: true, approvedAt: true, voidedById: true, voidedAt: true,
      voidReason: true, idempotencyKey: true, createdAt: true, updatedAt: true,
    },
  });
  if (!viewAll && txn.requestedById !== actorId) throw new FoundationError("MONEY_DESK_SCOPE_DENIED", "This transaction is outside your scope", 403);

  const def = purposeDefinition(txn.purposeCode);
  const formData = (txn.formData ?? {}) as Record<string, unknown>;
  const refs = (txn.downstreamRefs ?? {}) as Record<string, string | boolean | undefined>;
  const employeeId = typeof formData.employeeId === "string" ? formData.employeeId : undefined;
  const territoryId = typeof formData.territoryId === "string" ? formData.territoryId : undefined;

  const [requestedBy, approvedBy, voidedBy, treasury, employee, territory, expense, vendorPayment, vendorBill] = await Promise.all([
    db.user.findUnique({ where: { id: txn.requestedById }, select: { name: true, email: true } }),
    txn.approvedById ? db.user.findUnique({ where: { id: txn.approvedById }, select: { name: true, email: true } }) : Promise.resolve(null),
    txn.voidedById ? db.user.findUnique({ where: { id: txn.voidedById }, select: { name: true, email: true } }) : Promise.resolve(null),
    txn.treasuryAccountId ? db.seeraTreasuryAccount.findUnique({ where: { id: txn.treasuryAccountId }, select: { name: true, kind: true } }) : Promise.resolve(null),
    employeeId ? db.user.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    territoryId ? db.seeraGeographyNode.findUnique({ where: { id: territoryId }, select: { name: true } }) : Promise.resolve(null),
    typeof refs.expenseId === "string" ? db.seeraExpense.findUnique({ where: { id: refs.expenseId } }) : Promise.resolve(null),
    // Handler downstreamRefs shapes aren't uniform across purposes (VENDOR_PAYMENT returns
    // `vendorPaymentId`, RAW_MATERIAL_PURCHASE's own payment sub-step returns `paymentId`) —
    // check both rather than assuming one naming convention.
    (() => { const id = refs.vendorPaymentId ?? refs.paymentId; return typeof id === "string" ? db.seeraVendorPayment.findUnique({ where: { id } }) : Promise.resolve(null); })(),
    typeof refs.billId === "string" ? db.seeraVendorBill.findUnique({ where: { id: refs.billId } }) : Promise.resolve(null),
  ]);
  // SeeraVendorPayment/SeeraVendorBill have no Prisma relation back to SeeraVendor (vendorId is a
  // loose reference, same convention as every other cross-domain pointer in this codebase) — the
  // vendor's display name is resolved with its own lookup rather than a nonexistent `include`.
  const vendorId = vendorPayment?.vendorId ?? vendorBill?.vendorId;
  const [vendor, expenseCategory] = await Promise.all([
    vendorId ? db.seeraVendor.findUnique({ where: { id: vendorId }, select: { legalName: true, tradeName: true } }) : Promise.resolve(null),
    expense ? db.seeraExpenseCategory.findUnique({ where: { id: expense.categoryId }, select: { chartOfAccountId: true, parentGroup: true } }) : Promise.resolve(null),
  ]);

  // Ledger Impact — "View Ledger" only where the transaction resolves to a real, known party ledger
  // (Vendor via a Vendor Payment/Bill, Employee via an Expense's own employeeId) — never a
  // fabricated link for purposes that don't post to a party ledger at all (e.g. Fixed Asset).
  let ledgerLink: { partyType: string; partyId: string; label: string } | null = null;
  if (vendorPayment) ledgerLink = { partyType: "VENDOR", partyId: vendorPayment.vendorId, label: vendor?.tradeName ?? vendor?.legalName ?? "Vendor" };
  else if (vendorBill) ledgerLink = { partyType: "VENDOR", partyId: vendorBill.vendorId, label: vendor?.tradeName ?? vendor?.legalName ?? "Vendor" };
  else if (expense?.employeeId) ledgerLink = { partyType: "EMPLOYEE", partyId: expense.employeeId, label: employee?.name ?? employee?.email ?? "Employee" };
  else if (employee) ledgerLink = { partyType: "EMPLOYEE", partyId: employee.id, label: employee.name ?? employee.email };

  // Smart Finance provenance (spec §18/§19) — when a transaction was entered by typing/speaking a
  // sentence, formData.__smartFinance carries the exact instruction + the structured interpretation
  // that produced it. Read-only, purely for the audit/transparency card; never drives posting.
  const sf = (formData.__smartFinance ?? null) as { originalText?: string; confidence?: string; parsed?: Record<string, unknown> } | null;
  const smartFinance =
    sf && typeof sf.originalText === "string"
      ? {
          originalInstruction: sf.originalText,
          confidence: typeof sf.confidence === "string" ? sf.confidence : null,
          parsed: sf.parsed && typeof sf.parsed === "object" ? (sf.parsed as Record<string, unknown>) : null,
        }
      : null;

  return {
    id: txn.id,
    transactionNumber: txn.transactionNumber,
    purposeLabel: def.label,
    purposeHindiLabel: def.hindiLabel,
    source: smartFinance ? "SMART_FINANCE" : "GUIDED",
    smartFinance,
    direction: txn.direction,
    status: txn.status,
    amount: txn.amount,
    date: txn.date,
    reference: (formData.reference as string) ?? txn.description ?? null,
    counterpartyName: txn.counterpartyName,
    counterpartyType: txn.counterpartyType,
    treasury: treasury ? { name: treasury.name, kind: treasury.kind } : null,
    employee: employee ? { id: employee.id, name: employee.name ?? employee.email } : null,
    territory: territory?.name ?? null,
    costCentre: deriveCostCentre(expenseCategory, Boolean(territory)),
    documentFileId: txn.documentFileId,
    lineItems: Array.isArray(formData.skuLines) ? (formData.skuLines as { skuId: string; quantity: number; rate?: number }[]) : [],
    sourceDocuments: [
      expense ? { type: "Expense", label: expense.expenseNumber, id: expense.id } : null,
      vendorBill ? { type: "Vendor Bill", label: vendorBill.billNumber, id: vendorBill.id } : null,
      vendorPayment ? { type: "Vendor Payment", label: vendorPayment.paymentNumber, id: vendorPayment.id } : null,
      typeof refs.orderId === "string" ? { type: "Order", label: refs.orderId, id: refs.orderId } : null,
      typeof refs.grnId === "string" ? { type: "GRN", label: refs.grnId, id: refs.grnId } : null,
    ].filter((x): x is { type: string; label: string; id: string } => x !== null),
    ledgerLink,
    requiresApproval: txn.status === "PENDING_APPROVAL",
    requestedBy: requestedBy?.name ?? requestedBy?.email ?? "Unknown user",
    isSelf: txn.requestedById === actorId,
    approvedBy: approvedBy?.name ?? approvedBy?.email ?? null,
    approvedAt: txn.approvedAt,
    voidedBy: voidedBy?.name ?? voidedBy?.email ?? null,
    voidedAt: txn.voidedAt,
    voidReason: txn.voidReason,
    failureReason: txn.failureReason,
    createdAt: txn.createdAt,
  };
}

export async function moneyDeskHome(db: PrismaClient, actorId: string) {
  const { permissions } = await authorize(db, { actorId, permission: "money_desk:view" });
  const viewAll = permissions.has("money_desk:view_all") || permissions.has("system:super_admin");
  const scope = viewAll ? {} : { requestedById: actorId };

  const [recent, pendingApproval, stuckPosting, treasuryAccounts, todayLines, salesDistribution] = await Promise.all([
    db.seeraMoneyDeskTransaction.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, transactionNumber: true, purposeCode: true, direction: true, status: true,
        amount: true, date: true, treasuryAccountId: true, counterpartyName: true,
        requestedById: true, formData: true, failureReason: true, createdAt: true,
      },
    }),
    db.seeraMoneyDeskTransaction.findMany({
      where: { ...scope, status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      select: { id: true, transactionNumber: true, purposeCode: true, amount: true, requestedById: true },
    }),
    db.seeraMoneyDeskTransaction.findMany({
      where: { ...scope, status: "POSTING", failureReason: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, transactionNumber: true, purposeCode: true, amount: true, failureReason: true },
    }),
    db.seeraTreasuryAccount.findMany({ where: { isActive: true } }),
    db.seeraJournalLine.groupBy({
      by: ["treasuryAccountId"],
      where: { treasuryAccountId: { not: null }, journal: { status: "POSTED", date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
      _sum: { debit: true, credit: true },
    }),
    salesDistributionBridge(db, viewAll),
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

  // Human-readable row enrichment (Founder closure pass, 24-Aug §18) — "Founder should understand a
  // transaction without knowing system codes." formData already carries employeeId/territoryId for
  // every purpose that has them; resolve those + the treasury account to real names here so the UI
  // never has to show a bare id.
  const employeeIds = [...new Set(recent.map((t) => (t.formData as Record<string, unknown>)?.employeeId).filter((v): v is string => typeof v === "string"))];
  const territoryIds = [...new Set(recent.map((t) => (t.formData as Record<string, unknown>)?.territoryId).filter((v): v is string => typeof v === "string"))];
  const treasuryIds = [...new Set(recent.map((t) => t.treasuryAccountId).filter((v): v is string => Boolean(v)))];
  const [employees, territories, treasuries] = await Promise.all([
    employeeIds.length ? db.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    territoryIds.length ? db.seeraGeographyNode.findMany({ where: { id: { in: territoryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    treasuryIds.length ? db.seeraTreasuryAccount.findMany({ where: { id: { in: treasuryIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const employeeNameById = new Map(employees.map((e) => [e.id, e.name ?? e.email]));
  const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
  const treasuryNameById = new Map(treasuries.map((t) => [t.id, t.name]));
  // `amount` is a Prisma Decimal instance on every raw row here — Next.js's Server->Client
  // boundary (these three arrays feed straight into the client MoneyDeskPanel) can only pass plain
  // objects, so a Decimal survives silently in dev (with a slow, spammy "Only plain objects..."
  // console.error per row) but is NOT a documented-safe pattern; converting to a plain number here,
  // once, is cheap and removes any ambiguity for every consumer.
  const enrichRow = (t: (typeof recent)[number]) => {
    const fd = (t.formData ?? {}) as Record<string, unknown>;
    const empId = typeof fd.employeeId === "string" ? fd.employeeId : undefined;
    const terrId = typeof fd.territoryId === "string" ? fd.territoryId : undefined;
    const isSmart = Boolean((fd.__smartFinance as { originalText?: string } | undefined)?.originalText);
    return { ...t, amount: Number(t.amount), source: isSmart ? "SMART_FINANCE" : "GUIDED", employeeName: empId ? (employeeNameById.get(empId) ?? null) : null, territoryName: terrId ? (territoryNameById.get(terrId) ?? null) : null, treasuryName: t.treasuryAccountId ? (treasuryNameById.get(t.treasuryAccountId) ?? null) : null };
  };

  return {
    recentTransactions: recent.map(enrichRow),
    pendingApprovals: pendingApproval.map((t) => ({ ...t, amount: Number(t.amount), isSelf: t.requestedById === actorId })),
    needsAttention: stuckPosting.map((t) => ({ id: t.id, transactionNumber: t.transactionNumber, purposeCode: t.purposeCode, amount: Number(t.amount), failureReason: t.failureReason })),
    cashBankToday,
    canApprove: permissions.has("money_desk:approve") || permissions.has("system:super_admin"),
    canVoid: permissions.has("money_desk:reverse") || permissions.has("system:super_admin"),
    salesDistribution,
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
  const [treasuryAccounts, vendors, materials, locations, pendingReturnRequests, openVendorBills, territories] = await Promise.all([
    db.seeraTreasuryAccount.findMany({ where: { isActive: true }, select: { id: true, name: true, kind: true, chartOfAccountId: true } }),
    db.seeraVendor.findMany({ where: { isActive: true }, select: { id: true, legalName: true, tradeName: true }, orderBy: { legalName: "asc" }, take: 200 }),
    db.seeraManufacturingMaterial.findMany({ select: { id: true, code: true, name: true, baseUnit: true }, orderBy: { name: "asc" }, take: 500 }),
    db.seeraManufacturingLocation.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.seeraReturnRequest.findMany({ where: { status: "APPROVED", creditNoteRequested: true, refundJournalId: null }, select: { id: true, requestNumber: true, reason: true, retailerId: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.seeraVendorBill.findMany({ where: { status: { in: ["APPROVED", "PARTIALLY_PAID"] } }, select: { id: true, billNumber: true, vendorId: true, grossAmount: true, paidAmount: true }, orderBy: { dueDate: "asc" }, take: 200 }),
    // Territory picker (Money Desk maturity pass, 23-Aug) — same SeeraGeographyNode{level:TERRITORY}
    // rows the Sales & Distribution domain already governs (Beat Planner, Executive assignment);
    // Money Desk reads this, it never maintains its own copy of geography.
    db.seeraGeographyNode.findMany({ where: { level: "TERRITORY", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
    territories,
  };
}
