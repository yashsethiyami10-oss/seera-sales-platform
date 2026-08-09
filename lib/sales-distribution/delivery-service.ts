import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
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
  return db.$transaction(
    async (tx) => {
      const delivery = await tx.seeraDelivery.findUnique({
        where: { id: deliveryId },
        include: { order: { include: { lines: true } } },
      });
      if (!delivery)
        throw new FoundationError(
          "DELIVERY_NOT_FOUND",
          "Delivery unavailable",
          404,
        );
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
      if (!assigned && !operator)
        throw new FoundationError(
          "DELIVERY_SCOPE_DENIED",
          "Delivery outside assigned scope",
          403,
        );
      if (delivery.status === input.status && delivery.actorId === actorId)
        return delivery;
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
        if (!line || quantity < 0)
          throw new FoundationError(
            "INVALID_DELIVERY_QUANTITY",
            "Invalid delivery line",
            400,
          );
        const remaining =
          Number(line.dispatchedQuantity) -
          Number(line.deliveredQuantity) -
          Number(line.refusedQuantity);
        if (quantity > remaining)
          throw new FoundationError(
            "OVER_DELIVERY_DENIED",
            "Delivery exceeds dispatched balance",
            409,
          );
      }
      if (["DELIVERED", "PARTIAL_DELIVERED", "REFUSED"].includes(input.status))
        for (const line of delivery.order.lines) {
          const quantity = quantities.get(line.id) ?? 0;
          if (quantity > 0)
            await tx.seeraOrderLine.update({
              where: { id: line.id },
              data:
                input.status === "REFUSED"
                  ? { refusedQuantity: { increment: quantity } }
                  : { deliveredQuantity: { increment: quantity } },
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
        }),
        allDelivered = lines.every(
          (x) =>
            Number(x.deliveredQuantity) >=
            Number(x.orderedQuantity) -
              Number(x.cancelledQuantity) -
              Number(x.refusedQuantity),
        ),
        someDelivered = lines.some((x) => Number(x.deliveredQuantity) > 0);
      await tx.seeraSalesOrder.update({
        where: { id: delivery.orderId },
        data: {
          status: allDelivered
            ? "DELIVERED"
            : someDelivered
              ? "PARTIAL_DELIVERED"
              : delivery.order.status,
          ...(allDelivered ? { deliveredAt: new Date() } : {}),
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
      return tx.seeraDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  );
}
