import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { evaluateDistributorCredit, netCreditExposure } from "./business-rules";
import { ageingBucket } from "./phase6-9-rules";
import { notifyPartyUsers, requirePartyMembership } from "./scope";

type Db = PrismaClient | Prisma.TransactionClient;

// Canonical, billing-independent credit exposure for a Distributor: order-value based exposure,
// netted by whatever has actually been POSTED to the ledger (verified payments credit the party,
// any future invoice/claim debit adds to it). This is the single calculation every exposure-facing
// surface (live replenishment gate, Distributor Credit page, S.S. downstream credit view) must call
// so a decision never disagrees with what a human sees on screen.
export async function canonicalDistributorExposure(prisma: Db, distributorId: string, now: Date) {
  const [openOrders, ledger] = await Promise.all([
    prisma.seeraSalesOrder.findMany({
      where: { buyerPartnerId: distributorId, type: "DISTRIBUTOR_REPLENISHMENT", status: { notIn: ["CLOSED", "CANCELLED", "REJECTED", "DRAFT"] } },
      orderBy: { originalDueDate: "asc" },
      select: { id: true, orderNumber: true, total: true, status: true, originalDueDate: true, graceUntil: true },
    }),
    prisma.seeraFinancialEntry.findMany({
      where: {
        status: "POSTED",
        OR: [
          { debitPartyType: "DISTRIBUTOR", debitPartyId: distributorId },
          { creditPartyType: "DISTRIBUTOR", creditPartyId: distributorId },
        ],
      },
      select: { debitPartyId: true, creditPartyId: true, amount: true },
    }),
  ]);
  // Founder decision 22-Aug (final commercial-freeze correction): ORDER != FINANCIAL OUTSTANDING,
  // QUOTATION != FINANCIAL OUTSTANDING. A Distributor's exposure to its S.S. is no longer the raw
  // value of open (SUBMITTED/ACCEPTED/ALLOCATED/DISPATCHED/DELIVERED) replenishment orders — an
  // order or a delivery, on its own, creates no financial exposure. Exposure is purely what has
  // actually been POSTED to the ledger: an ISSUED TAX_INVOICE/NON_TAX_INVOICE debits the
  // Distributor (billing-service.ts's issueBillingDraft posts the SeeraFinancialEntry at the
  // moment of issuance — that IS the event that creates exposure, not order placement/acceptance/
  // delivery beforehand), a verified payment or credit note credits it back, a cancelled/void
  // document was never posted so never contributed. orderExposureTotal is kept at 0 (not removed
  // from the return shape) so every existing caller of this "single calculation every exposure-
  // facing surface must call" keeps working unchanged, just with a value that finally matches this
  // governed rule everywhere at once. `openOrders` is still queried/returned — it remains real,
  // useful informational data (the Money panel's "open orders" statement list, and
  // creditPositionFor's overdue-by-due-date signal below), just no longer summed into exposure.
  const orderExposureTotal = 0;
  const postedDebits = ledger.filter((e) => e.debitPartyId === distributorId).reduce((sum, e) => sum + Number(e.amount), 0);
  const postedCredits = ledger.filter((e) => e.creditPartyId === distributorId).reduce((sum, e) => sum + Number(e.amount), 0);
  const exposure = netCreditExposure({ orderExposureTotal, postedDebits, postedCredits });
  return { exposure, orderExposureTotal, postedDebits, postedCredits, openOrders };
}

export async function creditPositionFor(prisma: PrismaClient, distributorId: string, now: Date) {
  const [terms, { exposure: outstanding, openOrders }, lastPaymentEntry] = await Promise.all([
    prisma.seeraCreditTerm.findFirst({
      where: { distributorId, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: "desc" },
    }),
    canonicalDistributorExposure(prisma, distributorId, now),
    prisma.seeraFinancialEntry.findFirst({
      where: { status: "POSTED", type: { in: ["PAYMENT", "ADVANCE"] }, creditPartyType: "DISTRIBUTOR", creditPartyId: distributorId },
      orderBy: { postedAt: "desc" },
    }),
  ]);
  const oldest = openOrders[0];
  const [promise, extension, pendingExtension] = oldest
    ? await Promise.all([
        prisma.seeraPaymentPromise.findFirst({ where: { orderId: oldest.id }, orderBy: { createdAt: "desc" } }),
        prisma.seeraCreditExtension.findFirst({ where: { orderId: oldest.id, status: "APPROVED" }, orderBy: { approvedAt: "desc" } }),
        prisma.seeraCreditExtension.findFirst({ where: { orderId: oldest.id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
      ])
    : [null, null, null];
  const decision = terms
    ? evaluateDistributorCredit({
        creditEnabled: terms.creditEnabled,
        creditLimit: Number(terms.creditLimit),
        outstanding,
        orderValue: 0,
        warningThreshold: terms.warningThreshold == null ? null : Number(terms.warningThreshold),
        blockThreshold: terms.blockThreshold == null ? null : Number(terms.blockThreshold),
        originalDueDate: oldest?.originalDueDate ?? null,
        graceUntil: extension?.extensionUntil ?? oldest?.graceUntil ?? null,
        promisedPaymentDate: promise?.promisedPaymentDate ?? null,
        now,
      })
    : null;
  // Founder correction 22-Aug: `overdue` used to be derived as `outstanding - current`, which
  // silently broke once `outstanding` stopped being order-value-based (see
  // canonicalDistributorExposure) — it would floor to 0 the instant ledger exposure was smaller
  // than open-order value, i.e. almost always. `current`/`overdue` are a genuinely separate,
  // still-real signal: which of the Distributor's OPEN orders (not yet invoiced) are past the due
  // date their credit terms set at order time. This never re-enters the exposure/payable number —
  // it is order-value information, shown honestly as its own thing, not folded into "S.S. Payable".
  const current = openOrders
    .filter((order) => !order.originalDueDate || ageingBucket(order.originalDueDate, now) === "NOT_DUE")
    .reduce((sum, order) => sum + Number(order.total), 0);
  const overdueOrderValue = openOrders
    .filter((order) => order.originalDueDate && ageingBucket(order.originalDueDate, now) !== "NOT_DUE")
    .reduce((sum, order) => sum + Number(order.total), 0);
  return {
    terms,
    outstanding,
    current,
    overdue: overdueOrderValue,
    decision,
    promisedPaymentDate: promise?.promisedPaymentDate ?? null,
    formalExtensionUntil: extension?.extensionUntil ?? null,
    oldestDueDate: oldest?.originalDueDate ?? null,
    lastPayment: lastPaymentEntry ? { amount: Number(lastPaymentEntry.amount), postedAt: lastPaymentEntry.postedAt } : null,
    availableCredit: terms?.creditEnabled ? Math.max(0, Number(terms.creditLimit) - outstanding) : null,
    pendingExtension: pendingExtension
      ? { id: pendingExtension.id, extensionUntil: pendingExtension.extensionUntil, reason: pendingExtension.reason }
      : null,
    openOrders: openOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      status: order.status,
      originalDueDate: order.originalDueDate,
      ageingBucket: order.originalDueDate ? ageingBucket(order.originalDueDate, now) : "NOT_DUE",
    })),
  };
}

export async function distributorCreditPosition(prisma: PrismaClient, actorId: string, distributorId: string, now = new Date()) {
  await authorize(prisma, { actorId, permission: "distributor_credit:view" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  return creditPositionFor(prisma, distributorId, now);
}

export async function superStockistDistributorCreditOverview(prisma: PrismaClient, actorId: string, superStockistId: string, now = new Date()) {
  await authorize(prisma, { actorId, permission: "partner_credit:enforce" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const distributors = await prisma.seeraPartner.findMany({
    where: { type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId, lifecycle: "ACTIVE" },
    select: { id: true, legalName: true, tradeName: true, code: true },
    orderBy: { legalName: "asc" },
  });
  return Promise.all(
    distributors.map(async (distributor) => ({
      distributor,
      position: await creditPositionFor(prisma, distributor.id, now),
    })),
  );
}

// STAGE 13 (Founder read-only oversight): S.S.'s own credit terms/decisions on their Distributors
// are S.S.-governed (updateDistributorCreditPolicy is gated to the owning S.S. — see
// distributor-management-service.ts), never Founder-editable through this function or any UI it
// backs — this is intentionally read-only, network-wide, across every S.S., reusing the exact same
// canonical creditPositionFor() every other credit screen already calls, so it can never disagree
// with what the owning S.S. or the Distributor itself sees.
export async function founderDistributorCreditOversight(prisma: PrismaClient, actorId: string, now = new Date()) {
  await authorize(prisma, { actorId, permission: "finance_dashboard:view" });
  const [distributors, superStockists] = await Promise.all([
    prisma.seeraPartner.findMany({
      where: { type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
      select: { id: true, legalName: true, tradeName: true, code: true, assignedSuperStockistId: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.seeraPartner.findMany({ where: { type: "SUPER_STOCKIST" }, select: { id: true, legalName: true, tradeName: true } }),
  ]);
  const ssById = new Map(superStockists.map((s) => [s.id, s]));
  return Promise.all(
    distributors.map(async (distributor) => ({
      distributor,
      superStockist: distributor.assignedSuperStockistId ? (ssById.get(distributor.assignedSuperStockistId) ?? null) : null,
      position: await creditPositionFor(prisma, distributor.id, now),
    })),
  );
}

// Distributor-first Collections for S.S. (Founder Phase S) — same canonical creditPositionFor()
// the Money/Credit pages already use, plus the same recent-ledger read Manager's collections
// screen uses, so this can never disagree with what those screens show.
export async function superStockistDistributorCollectionsSnapshot(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  distributorId: string,
  now = new Date(),
) {
  await authorize(prisma, { actorId, permission: "partner_credit:enforce" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const distributor = await prisma.seeraPartner.findFirst({
    where: { id: distributorId, type: "DISTRIBUTOR", assignedSuperStockistId: superStockistId },
    select: { id: true, legalName: true, tradeName: true, code: true },
  });
  if (!distributor)
    throw new FoundationError("DISTRIBUTOR_SCOPE_DENIED", "Distributor is outside this Super Stockist's network", 403);
  const [position, recentLedger] = await Promise.all([
    creditPositionFor(prisma, distributorId, now),
    prisma.seeraFinancialEntry.findMany({
      where: {
        status: "POSTED",
        OR: [
          { debitPartyType: "DISTRIBUTOR", debitPartyId: distributorId },
          { creditPartyType: "DISTRIBUTOR", creditPartyId: distributorId },
        ],
      },
      orderBy: { postedAt: "desc" },
      take: 10,
      select: { id: true, type: true, amount: true, debitPartyType: true, creditPartyType: true, postedAt: true, reason: true },
    }),
  ]);
  return {
    distributor,
    ...position,
    recentLedger: recentLedger.map((e) => ({
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      direction: e.debitPartyType === "DISTRIBUTOR" ? "DEBIT" : "CREDIT",
      postedAt: e.postedAt,
      reason: e.reason,
    })),
  };
}

// A Super Stockist requests a formal extension against one of their own distributor's overdue
// orders. The original due date on the order is never touched here — an approved extension is a
// separate, independently-tracked record that only affects the credit decision while APPROVED.
export async function requestCreditExtension(
  prisma: PrismaClient,
  actorId: string,
  input: { orderId: string; partyId: string; extensionUntil: Date; reason: string; idempotencyKey: string },
) {
  await authorize(prisma, { actorId, permission: "credit_extension:request" });
  await requirePartyMembership(prisma, actorId, input.partyId, "SUPER_STOCKIST");
  const order = await prisma.seeraSalesOrder.findFirst({
    where: { id: input.orderId, sellerPartnerId: input.partyId, type: "DISTRIBUTOR_REPLENISHMENT" },
  });
  if (!order)
    throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED", "Order is outside this Super Stockist's scope", 403);
  if (!order.originalDueDate)
    throw new FoundationError("ORIGINAL_DUE_DATE_REQUIRED", "Original due date is required", 409);
  if (input.extensionUntil <= order.originalDueDate)
    throw new FoundationError(
      "EXTENSION_BEFORE_DUE_DATE",
      "The requested extension date must be after the original due date",
      400,
    );
  const existing = await prisma.seeraCreditExtension.findFirst({
    where: { orderId: order.id, status: "PENDING" },
  });
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const extension = await tx.seeraCreditExtension.create({
      data: {
        orderId: order.id,
        originalDueDate: order.originalDueDate!,
        extensionUntil: input.extensionUntil,
        reason: input.reason,
        requestedById: actorId,
        financialEffect: { requestedIdempotencyKey: input.idempotencyKey },
        status: "PENDING",
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "credit_extension.requested",
      entityType: "SeeraCreditExtension",
      entityId: extension.id,
      afterState: { orderId: order.id, extensionUntil: input.extensionUntil.toISOString() },
    });
    return extension;
  });
}

// Approval sits with Accounts/Founder (credit_extension:approve) — the requesting Super Stockist
// can never decide their own request. Rejecting/approving is maker-checker like every other
// financial decision in this codebase (see reverseLedgerEntry/settleClaim).
export async function decideCreditExtension(
  prisma: PrismaClient,
  actorId: string,
  extensionId: string,
  input: { decision: "APPROVED" | "REJECTED"; approverId: string; reason: string },
) {
  await authorize(prisma, { actorId, permission: "credit_extension:approve" });
  if (input.approverId !== actorId)
    throw new FoundationError(
      "APPROVER_IDENTITY_MISMATCH",
      "The signed-in approver must own the decision",
      403,
    );
  return prisma.$transaction(async (tx) => {
    const extension = await tx.seeraCreditExtension.findUniqueOrThrow({ where: { id: extensionId } });
    if (extension.requestedById === actorId)
      throw new FoundationError(
        "CREDIT_EXTENSION_SELF_APPROVAL_DENIED",
        "Independent approval is required for a credit extension",
        403,
      );
    if (extension.status !== "PENDING")
      throw new FoundationError(
        "CREDIT_EXTENSION_ALREADY_DECIDED",
        "This credit extension has already been decided",
        409,
      );
    const updated = await tx.seeraCreditExtension.update({
      where: { id: extensionId },
      data: {
        status: input.decision,
        approvedById: actorId,
        approvedAt: input.decision === "APPROVED" ? new Date() : null,
        financialEffect: { ...(extension.financialEffect as object), decisionReason: input.reason },
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "credit_extension.decided",
      entityType: "SeeraCreditExtension",
      entityId: extension.id,
      afterState: { status: input.decision, reason: input.reason },
    });
    const order = await tx.seeraSalesOrder.findUnique({
      where: { id: extension.orderId },
      select: { sellerPartnerId: true },
    });
    if (order?.sellerPartnerId)
      await notifyPartyUsers(tx, order.sellerPartnerId, {
        title: input.decision === "APPROVED" ? "Credit extension approved" : "Credit extension rejected",
        body: `Your credit extension request has been ${input.decision.toLowerCase()}.`,
        entityType: "SeeraCreditExtension",
        entityId: extension.id,
        actionPath: "/portal/super-stockist/credit",
      });
    return updated;
  });
}

export async function superStockistCreditExtensionHistory(prisma: PrismaClient, actorId: string, superStockistId: string) {
  await authorize(prisma, { actorId, permission: "partner_credit:enforce" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const orders = await prisma.seeraSalesOrder.findMany({
    where: { sellerPartnerId: superStockistId, type: "DISTRIBUTOR_REPLENISHMENT" },
    select: { id: true, orderNumber: true, buyerPartner: { select: { legalName: true, tradeName: true } } },
  });
  const extensions = await prisma.seeraCreditExtension.findMany({
    where: { orderId: { in: orders.map((order) => order.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return extensions.map((extension) => ({
    ...extension,
    order: orders.find((order) => order.id === extension.orderId)!,
  }));
}
