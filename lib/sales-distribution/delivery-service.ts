import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { queueRetailerCommunicationSafe } from "./retailer-communication-service";


function numberFor(prefix: string, key: string) {
  return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;
}
export async function completeDelivery(
  db: PrismaClient,
  actorId: string,
  deliveryId: string,
  input: {
    status: DeliveryStatus;
    lines: { lineId: string; quantity: number }[];
    receiverName?: string;
    reason?: string;
    proof?: Record<string, unknown>;
  },
) {
  const permissions = await effectivePermissions(db, actorId);
  const completedDelivery = await db.$transaction(
    async (tx) => {
      const delivery = await tx.seeraDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          order: {
            include: {
              lines: true,
              sellerPartner: { select: { id: true, type: true } },
            },
          },
        },
      });
      if (!delivery)
        throw new FoundationError(
          "DELIVERY_NOT_FOUND",
          "Delivery unavailable",
          404,
        );
      if (["REFUSED","SHOP_CLOSED","PAYMENT_ISSUE","STOCK_UNAVAILABLE","WRONG_ORDER","RESCHEDULED","DAMAGED","OTHER"].includes(input.status) && !input.reason?.trim())
        throw new FoundationError("DELIVERY_REASON_REQUIRED","A reason is required for this delivery outcome",400);
      const assigned =
        permissions.has("distributor_delivery:execute") &&
        delivery.deliveryUserId === actorId;
      let operator = false;
      if (
        permissions.has("distributor_orders:fulfil") &&
        delivery.order.sellerPartnerId
      )
        operator = Boolean(
          await tx.seeraPartyUser.findFirst({
            where: {
              userId: actorId,
              partnerId: delivery.order.sellerPartnerId,
              active: true,
              partner: { type: "DISTRIBUTOR" },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            },
          }),
        );
      if (!operator && permissions.has("super_stockist_orders:fulfil") && delivery.order.sellerPartnerId)
        operator = Boolean(await tx.seeraPartyUser.findFirst({where:{userId:actorId,partnerId:delivery.order.sellerPartnerId,active:true,partner:{type:"SUPER_STOCKIST"},OR:[{effectiveTo:null},{effectiveTo:{gt:new Date()}}]}}));
      if (!assigned && !operator)
        throw new FoundationError(
          "DELIVERY_SCOPE_DENIED",
          "Delivery outside assigned scope",
          403,
        );
      // P1 22-Aug idempotency fix: this same-actor/same-outcome retry path (e.g. a UI double-click
      // after the delivery already finalized) must never re-queue the DELIVERED WhatsApp message —
      // `alreadyFinal: true` tells the post-commit block below to skip it entirely, matching the
      // real hard-idempotency path a few lines down (DELIVERY_ALREADY_FINAL) which already never
      // reaches the post-commit block at all since it throws before returning.
      if (delivery.status === input.status && delivery.actorId === actorId)
        return { delivery, orderType: delivery.order.type, retailerId: delivery.order.retailerId, orderId: delivery.orderId, alreadyFinal: true as const };
      const claimed = await tx.seeraDelivery.updateMany({
        where: { id: delivery.id, status: { in: ["PENDING", "RESCHEDULED"] } },
        data: {
          status: input.status,
          receiverName: input.receiverName,
          reason: input.reason,
          proof: input.proof as Prisma.InputJsonValue | undefined,
          occurredAt: new Date(),
          actorId,
        },
      });
      if (claimed.count !== 1)
        throw new FoundationError(
          "DELIVERY_ALREADY_FINAL",
          "Delivery is already finalized",
          409,
        );
      const quantities = new Map(
        input.lines.map((x) => [x.lineId, x.quantity]),
      );
      for (const [lineId, quantity] of quantities) {
        const line = delivery.order.lines.find((x) => x.id === lineId);
        if (!line || !Number.isFinite(quantity) || quantity <= 0)
          throw new FoundationError(
            "INVALID_DELIVERY_QUANTITY",
            "Delivery quantity must be a positive finite number for every submitted line",
            400,
          );
        const remaining =
          Number(line.dispatchedQuantity) -
          Number(line.deliveredQuantity) -
          Number(line.refusedQuantity) -
          Number(line.returnedQuantity);
        if (quantity > remaining)
          throw new FoundationError(
            "OVER_DELIVERY_DENIED",
            "Delivery exceeds dispatched balance",
            409,
          );
      }

      const outcomeQuantity = [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
      if (
        ["DELIVERED", "PARTIAL_DELIVERED", "REFUSED", "DAMAGED"].includes(input.status) &&
        outcomeQuantity <= 0
      )
        throw new FoundationError(
          "DELIVERY_QUANTITY_REQUIRED",
          "A delivery outcome requires at least one positive quantity",
          400,
        );

      // A DELIVERED outcome is a full-delivery assertion, not merely "some quantity arrived".
      // Validate it against the authoritative line balances before any quantity is mutated.
      if (input.status === "DELIVERED") {
        const projected = delivery.order.lines.map((line) => {
          const delivered = quantities.get(line.id) ?? 0;
          return {
            ordered: Number(line.orderedQuantity),
            cancelled: Number(line.cancelledQuantity),
            delivered: Number(line.deliveredQuantity) + delivered,
          };
        });
        if (
          projected.some(
            (line) => line.delivered < line.ordered - line.cancelled,
          )
        )
          throw new FoundationError(
            "FULL_DELIVERY_REQUIRED",
            "A DELIVERED outcome requires the full remaining order quantity; use PARTIAL_DELIVERED for a partial delivery",
            409,
          );
      }
      if (
        ["DELIVERED", "PARTIAL_DELIVERED", "REFUSED", "DAMAGED"].includes(
          input.status,
        )
      )
        for (const line of delivery.order.lines) {
          const quantity = quantities.get(line.id) ?? 0;
          if (quantity > 0)
            await tx.seeraOrderLine.update({
              where: { id: line.id },
              data:
                input.status === "REFUSED"
                  ? { refusedQuantity: { increment: quantity } }
                  : input.status === "DAMAGED"
                    ? { returnedQuantity: { increment: quantity } }
                    : { deliveredQuantity: { increment: quantity } },
            });
        }
      // A REFUSED delivery is physically intact and comes back to the seller's sellable
      // stock, so it is credited back in. A DAMAGED delivery is not sellable — the DISPATCH
      // movement already removed it from onHand, so it stays excluded; the loss is tracked
      // as a claim instead (same pattern as the short-receipt claim in receiveIncomingOrder),
      // not a second inventory movement, to avoid double-counting the stock reduction.
      if (
        input.status === "REFUSED" &&
        delivery.order.sellerPartner &&
        delivery.order.sellerPartnerId
      )
        for (const line of delivery.order.lines) {
          const quantity = quantities.get(line.id) ?? 0;
          if (quantity > 0)
            await tx.seeraInventoryMovement.create({
              data: {
                // Company Direct (Part B) has no dedicated InventoryPartyType of its own — it maps
                // onto the existing COMPANY value (Manufacturing's Company stock position), the
                // same "infinite-supply root" the Company already is for every other order type.
                partyType: delivery.order.sellerPartner.type === "COMPANY_DIRECT" ? "COMPANY" : delivery.order.sellerPartner.type,
                partyId: delivery.order.sellerPartnerId,
                skuId: line.skuId,
                type: "RETURN",
                direction: "IN",
                quantity,
                sourceType: "SeeraDelivery",
                sourceId: delivery.id,
                actorId,
                sourcePortal:
                  delivery.order.sellerPartner.type === "DISTRIBUTOR"
                    ? "distributor"
                    : delivery.order.sellerPartner.type === "COMPANY_DIRECT"
                      ? "company-direct"
                      : "super-stockist",
                reason: input.reason?.trim() || "Delivery refused — stock returned",
                idempotencyKey: `${delivery.id}-return-${line.id}`,
              },
            });
        }
      if (
        input.status === "DAMAGED" &&
        delivery.order.sellerPartner &&
        delivery.order.sellerPartnerId
      ) {
        const damagedLines = delivery.order.lines
          .map((line) => ({ line, quantity: quantities.get(line.id) ?? 0 }))
          .filter((x) => x.quantity > 0);
        if (damagedLines.length)
          await tx.seeraClaim.create({
            data: {
              claimNumber: numberFor("DC", `${delivery.id}-damage`),
              claimantType: delivery.order.sellerPartner.type,
              claimantId: delivery.order.sellerPartnerId,
              againstPartyType: delivery.order.sellerPartner.type === "DISTRIBUTOR" ? "SUPER_STOCKIST" : "COMPANY",
              againstPartyId: "SEERA_COMPANY",
              type: "DAMAGE_IN_TRANSIT",
              sourceType: "SeeraDelivery",
              sourceId: delivery.id,
              details: {
                lines: damagedLines.map((x) => ({
                  lineId: x.line.id,
                  skuId: x.line.skuId,
                  quantity: x.quantity,
                })),
                reason: input.reason,
              },
              actorId,
              idempotencyKey: `${delivery.id}-damage-claim`,
            },
          });
      }
      await tx.seeraDelivery.update({
        where: { id: delivery.id },
        data: {
          quantities: Object.fromEntries(quantities) as Prisma.InputJsonValue,
        },
      });
      const lines = await tx.seeraOrderLine.findMany({
        where: { orderId: delivery.orderId },
      });
      // Refusal/return/damage can exhaust the remaining balance without making the
      // commercial order "DELIVERED". Delivery status is based only on deliveredQuantity
      // versus the non-cancelled ordered quantity.
      const fullyDelivered = lines.length > 0 && lines.every(
        (x) =>
          Number(x.deliveredQuantity) >=
          Number(x.orderedQuantity) - Number(x.cancelledQuantity),
      );
      const someDelivered = lines.some((x) => Number(x.deliveredQuantity) > 0);
      await tx.seeraSalesOrder.update({
        where: { id: delivery.orderId },
        data: {
          status: fullyDelivered
            ? "DELIVERED"
            : someDelivered
              ? "PARTIAL_DELIVERED"
              : delivery.order.status,
          ...(fullyDelivered ? { deliveredAt: new Date() } : {}),
        },
      });
      await recordAudit(tx, {
        actorId,
        action: "delivery.completed",
        entityType: "SeeraDelivery",
        entityId: delivery.id,
        afterState: {
          status: input.status,
          orderNumber: delivery.order.orderNumber,
        },
      });
      return {
        delivery: await tx.seeraDelivery.findUniqueOrThrow({ where: { id: delivery.id } }),
        orderType: delivery.order.type,
        retailerId: delivery.order.retailerId,
        orderId: delivery.orderId,
        alreadyFinal: false as const,
      };
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
  // Stage 7 fix: DELIVERED was defined in the retailer-communication event matrix but never
  // triggered anywhere — queued AFTER commit, only for real retailer orders (this same function
  // also completes Distributor/S.S. replenishment deliveries, which have no retailer to notify).
  // Never before the status is durably DELIVERED (input.status is the durably-committed status
  // read back from completedDelivery's own transaction, not merely the caller's request).
  // `alreadyFinal` (P1 22-Aug) skips this on a same-actor/same-outcome retry of an already-finalized
  // delivery — a genuinely new delivery always has alreadyFinal:false, so the normal path is unchanged.
  if (!completedDelivery.alreadyFinal && completedDelivery.orderType === "RETAILER_ORDER" && completedDelivery.retailerId && input.status === "DELIVERED") {
    try {
      await queueRetailerCommunicationSafe(db, { eventType: "DELIVERED", retailerId: completedDelivery.retailerId, orderId: completedDelivery.orderId, actorId });
    } catch (error) {
      console.error("retailer_communication.queue_failed", error);
    }
  }
  return completedDelivery.delivery;
}
