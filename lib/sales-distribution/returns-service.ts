import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";

function requestNumber(key: string) {
  return `RD-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;
}


export function assertReturnDoesNotExceedDelivered(
  deliveredQuantity: number,
  alreadyReturnedQuantity: number,
  requestedQuantity: number,
) {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0)
    throw new FoundationError(
      "INVALID_RETURN_QUANTITY",
      "Return quantity must be a positive finite number",
      400,
    );
  const available = deliveredQuantity - alreadyReturnedQuantity;
  if (requestedQuantity > available)
    throw new FoundationError(
      "RETURN_EXCEEDS_DELIVERED",
      "Return quantity exceeds the quantity actually delivered and still returnable",
      409,
    );
}

export async function createReturnRequest(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    retailerId?: string;
    sourceOrderId?: string;
    skuId: string;
    quantity: number;
    condition: "USABLE" | "DAMAGED";
    reason: string;
    creditNoteRequested?: boolean;
    sourcePortal: string;
    idempotencyKey: string;
  },
) {
  const permission =
    input.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:adjust"
      : "super_stockist_inventory:adjust";
  await authorize(prisma, { actorId, permission });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  if (!input.idempotencyKey.trim())
    throw new FoundationError("IDEMPOTENCY_KEY_REQUIRED", "A return request idempotency key is required", 400);
  assertReturnDoesNotExceedDelivered(input.quantity, 0, input.quantity);
  if (!input.reason.trim())
    throw new FoundationError("RETURN_REASON_REQUIRED", "A reason is required", 400);

  // Retailer returns must always identify the originating commercial order. Without this
  // binding, an arbitrary SKU/quantity could be submitted as a "return" and later approved
  // into stock without any proof that it was ever delivered.
  if (input.retailerId && !input.sourceOrderId)
    throw new FoundationError(
      "RETURN_SOURCE_ORDER_REQUIRED",
      "A retailer return must reference the originating order",
      400,
    );

  if (input.sourceOrderId) {
    const sourceOrder = await prisma.seeraSalesOrder.findFirst({
      where: {
        id: input.sourceOrderId,
        sellerPartnerId: input.partyId,
        ...(input.retailerId ? { retailerId: input.retailerId } : {}),
        status: { in: ["DELIVERED", "PARTIAL_DELIVERED"] },
      },
      include: { lines: true },
    });
    if (!sourceOrder)
      throw new FoundationError(
        "RETURN_SOURCE_ORDER_SCOPE_DENIED",
        "The originating order is not delivered or outside the returner's scope",
        403,
      );
    const line = sourceOrder.lines.find((candidate) => candidate.skuId === input.skuId);
    if (!line)
      throw new FoundationError("RETURN_SOURCE_LINE_NOT_FOUND", "The returned SKU is not on the originating order", 404);
    assertReturnDoesNotExceedDelivered(
      Number(line.deliveredQuantity),
      Number(line.returnedQuantity) + Number(line.refusedQuantity),
      input.quantity,
    );
  }

  const existing = await prisma.seeraReturnRequest.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    const sameRequest =
      existing.partyType === input.partyType &&
      existing.partyId === input.partyId &&
      existing.retailerId === (input.retailerId ?? null) &&
      existing.sourceOrderId === (input.sourceOrderId ?? null) &&
      existing.skuId === input.skuId &&
      Number(existing.quantity) === input.quantity &&
      existing.condition === input.condition &&
      existing.reason === input.reason &&
      existing.creditNoteRequested === (input.creditNoteRequested ?? false) &&
      existing.sourcePortal === input.sourcePortal;
    if (!sameRequest)
      throw new FoundationError(
        "IDEMPOTENCY_KEY_REUSE_CONFLICT",
        "This idempotency key was already used for a different return request",
        409,
      );
    return existing;
  }

  const request = await prisma.seeraReturnRequest.create({
    data: {
      requestNumber: requestNumber(input.idempotencyKey),
      partyType: input.partyType,
      partyId: input.partyId,
      retailerId: input.retailerId,
      sourceOrderId: input.sourceOrderId,
      skuId: input.skuId,
      quantity: input.quantity,
      condition: input.condition,
      reason: input.reason,
      creditNoteRequested: input.creditNoteRequested ?? false,
      actorId,
      sourcePortal: input.sourcePortal,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordAudit(prisma, {
    actorId,
    action: "return_request.submitted",
    entityType: "SeeraReturnRequest",
    entityId: request.id,
    afterState: { requestNumber: request.requestNumber, condition: input.condition },
  });
  return request;
}

export async function decideReturnRequest(
  prisma: PrismaClient,
  actorId: string,
  requestId: string,
  input: { decision: "APPROVED" | "REJECTED"; reason: string },
) {
  const existing = await prisma.seeraReturnRequest.findUniqueOrThrow({ where: { id: requestId } });
  const permission =
    existing.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:adjust"
      : "super_stockist_inventory:adjust";
  await authorize(prisma, { actorId, permission });
  // Stage 2 fix: strict same-party membership left a real return UNDECIDABLE for the realistic
  // case of a party with exactly one distributor_inventory:adjust-holding user (the Owner) — that
  // person can never independently review their own submission, and no one else at that party
  // qualifies. Claims (the closest sibling flow — also "something went wrong with a delivered
  // order") are already settled by an independent Accounts authority via claim_settlement:manage,
  // never by party-membership alone; this mirrors the SAME system:super_admin/finance_dashboard:view
  // bypass document-service.ts's issueSystemDocument already uses for the identical class of
  // problem, rather than inventing a new permission or a new escalation path.
  const permissions = await effectivePermissions(prisma, actorId);
  if (!permissions.has("system:super_admin") && !permissions.has("finance_dashboard:view"))
    await requirePartyMembership(prisma, actorId, existing.partyId, existing.partyType as "DISTRIBUTOR" | "SUPER_STOCKIST");
  if (!input.reason.trim())
    throw new FoundationError("RETURN_DECISION_REASON_REQUIRED", "A decision reason is required", 400);
  return prisma.$transaction(async (tx) => {
    const request = await tx.seeraReturnRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== "SUBMITTED")
      throw new FoundationError("RETURN_REQUEST_ALREADY_DECIDED", "This return request was already decided", 409);
    if (request.actorId === actorId)
      throw new FoundationError(
        "RETURN_REQUEST_SELF_REVIEW_DENIED",
        "A return request requires an independent reviewer",
        403,
      );
    let movementId: string | undefined;
    if (input.decision === "APPROVED") {
      // An approved return — usable or damaged — means the original sale no longer stands, so the
      // sales-performance credit for it must be pulled back the same way a delivery refusal already
      // is: eligibleDelivered() (business-rules.ts) subtracts returnedQuantity from what counts as
      // delivered. Without this, a Retailer return recorded days after delivery would silently keep
      // crediting the Executive/Manager for a sale that no longer exists.
      if (request.sourceOrderId) {
        const line = await tx.seeraOrderLine.findFirst({
          where: { orderId: request.sourceOrderId, skuId: request.skuId },
        });
        if (!line)
          throw new FoundationError(
            "RETURN_SOURCE_LINE_NOT_FOUND",
            "The returned SKU is not on the originating order",
            404,
          );
        const alreadyAccounted =
          Number(line.returnedQuantity) + Number(line.refusedQuantity);
        assertReturnDoesNotExceedDelivered(
          Number(line.deliveredQuantity),
          alreadyAccounted,
          Number(request.quantity),
        );
        await tx.seeraOrderLine.update({
          where: { id: line.id },
          data: { returnedQuantity: { increment: request.quantity } },
        });
      }
      if (request.condition === "USABLE") {
        const movement = await tx.seeraInventoryMovement.create({
          data: {
            partyType: request.partyType,
            partyId: request.partyId,
            skuId: request.skuId,
            type: "RETURN",
            direction: "IN",
            quantity: request.quantity,
            sourceType: "SeeraReturnRequest",
            sourceId: request.id,
            actorId,
            sourcePortal: request.sourcePortal,
            reason: `Return approved: ${input.reason.trim()}`,
            idempotencyKey: `${request.idempotencyKey}-movement`,
          },
        });
        movementId = movement.id;
      }
    }
    const updated = await tx.seeraReturnRequest.update({
      where: { id: request.id },
      data: {
        status: input.decision,
        decisionReason: input.reason,
        decidedById: actorId,
        decidedAt: new Date(),
        movementId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "return_request.decided",
      entityType: "SeeraReturnRequest",
      entityId: request.id,
      afterState: { decision: input.decision, condition: request.condition, movementId: movementId ?? null },
    });
    return updated;
  });
}
