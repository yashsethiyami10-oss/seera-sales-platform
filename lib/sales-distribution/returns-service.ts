import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { authorize, effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";

function requestNumber(key: string) {
  return `RD-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;
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
  if (input.quantity <= 0)
    throw new FoundationError("INVALID_RETURN_QUANTITY", "Return quantity must be positive", 400);
  if (!input.reason.trim())
    throw new FoundationError("RETURN_REASON_REQUIRED", "A reason is required", 400);
  const request = await prisma.seeraReturnRequest.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
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
        if (line) {
          const alreadyAccounted =
            Number(line.returnedQuantity) + Number(line.refusedQuantity);
          const availableToReturn = Number(line.deliveredQuantity) - alreadyAccounted;
          if (Number(request.quantity) > availableToReturn)
            throw new FoundationError(
              "RETURN_EXCEEDS_DELIVERED",
              "Approved return quantity exceeds what was actually delivered for this order line",
              409,
            );
          await tx.seeraOrderLine.update({
            where: { id: line.id },
            data: { returnedQuantity: { increment: request.quantity } },
          });
        }
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
