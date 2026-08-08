"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireUser } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError, ForbiddenError } from "@/lib/errors";
import { getShippingProvider } from "@/lib/shipping";
import { sendShippingConfirmationEmail, sendDeliveryConfirmationEmail } from "@/lib/notify/send";
import { sendShippingUpdateWhatsApp } from "@/lib/notify/send-messaging";
import { logger } from "@/lib/logger";

// Origin is a fixed warehouse address — real deployments with multiple
// warehouses would look this up per-order (see the Warehouse Management
// placeholder noted in earlier Inventory admin work); one origin is a
// reasonable starting assumption for a single-warehouse brand.
const ORIGIN = {
  name: "MUV Warehouse",
  phone: process.env.WAREHOUSE_PHONE ?? "9999999999",
  line1: process.env.WAREHOUSE_ADDRESS_LINE1 ?? "",
  city: process.env.WAREHOUSE_CITY ?? "Mumbai",
  state: process.env.WAREHOUSE_STATE ?? "Maharashtra",
  pincode: process.env.WAREHOUSE_PINCODE ?? "400001",
};

const rateQuerySchema = z.object({
  destinationPincode: z.string().regex(/^\d{6}$/),
  weightGrams: z.number().int().positive().default(500),
  codAmount: z.number().int().min(0).optional(),
});

/** Public — called from the cart/checkout PIN-code check. */
export async function calculateShippingRates(input: unknown) {
  try {
    const data = rateQuerySchema.parse(input);
    const provider = getShippingProvider();
    const rates = await provider.getRates({
      originPincode: ORIGIN.pincode,
      destinationPincode: data.destinationPincode,
      weightGrams: data.weightGrams,
      codAmount: data.codAmount,
    });
    return { success: true as const, data: rates };
  } catch (err) {
    logger.error("shipping:rates:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

/**
 * Fulfillment — creates the shipment with the active courier, persists the
 * AWB/label, and moves the order to SHIPPED. Only callable once payment is
 * confirmed (or the order is COD) so nothing ships before it's actually
 * paid for or explicitly COD.
 */
export async function fulfillOrder(orderId: string) {
  try {
    await requireStaff();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { address: true, customer: true, items: { include: { variant: { include: { product: true } } } }, shipment: true },
    });
    if (!order) throw new NotFoundError("Order");
    if (order.shipment) throw new AppError("This order already has a shipment", 409, "ALREADY_FULFILLED");
    if (order.paymentStatus !== "PAID" && order.paymentMethod !== "COD") {
      throw new AppError("Can't fulfill an order that hasn't been paid for", 400, "PAYMENT_NOT_CONFIRMED");
    }
    if (order.status !== "PACKED") {
      throw new AppError(`Can't fulfill an order in ${order.status} status — pack it first`, 400, "INVALID_STATUS_FOR_FULFILLMENT");
    }

    const provider = getShippingProvider();
    const result = await provider.createShipment({
      orderNumber: order.orderNumber,
      origin: ORIGIN,
      destination: {
        name: order.customer.name,
        phone: order.address.phone,
        line1: order.address.line1,
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        pincode: order.address.pincode,
      },
      weightGrams: 500 * order.items.reduce((s, i) => s + i.quantity, 0), // placeholder per-unit weight — replace with real per-product weight once tracked on Product
      codAmount: order.paymentMethod === "COD" ? order.total : undefined,
      items: order.items.map((i) => ({ name: i.nameAtPurchase, quantity: i.quantity, unitPrice: i.priceAtPurchase })),
    });

    await prisma.$transaction([
      prisma.shipment.create({
        data: {
          orderId: order.id,
          provider: provider.name,
          awbNumber: result.awbNumber,
          courierName: result.courierName,
          labelUrl: result.labelUrl,
          status: "PENDING",
          estimatedDelivery: result.estimatedDelivery,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } }),
    ]);

    sendShippingConfirmationEmail(order.id).catch((err) => logger.error("notify:shipping:failed", { orderId: order.id, error: String(err) }));
    if (order.customer.phone) {
      // "shipping_update" must be a pre-approved WhatsApp template name in
      // whichever provider is configured (see lib/notify/send-messaging.ts) —
      // this string is a placeholder until that template is actually created
      // and approved in the provider's dashboard.
      sendShippingUpdateWhatsApp(order.customer.phone, "order_shipped", [order.orderNumber, result.awbNumber], order.id).catch((err) =>
        logger.error("notify:whatsapp:failed", { orderId: order.id, error: String(err) })
      );
    }

    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
    return { success: true as const, data: { awbNumber: result.awbNumber } };
  } catch (err) {
    logger.error("shipping:fulfill:failed", { orderId, error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

export async function generateShippingLabel(orderId: string) {
  try {
    await requireStaff();
    const shipment = await prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment?.awbNumber) throw new NotFoundError("Shipment");

    const provider = getShippingProvider();
    const { labelUrl } = await provider.generateLabel(shipment.awbNumber);
    await prisma.shipment.update({ where: { id: shipment.id }, data: { labelUrl } });

    return { success: true as const, data: { labelUrl } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const pickupSchema = z.object({ shipmentIds: z.array(z.string().cuid()).min(1), pickupDate: z.string() });

/** Placeholder — see the note on `requestPickup` in lib/shipping/types.ts
 * for why this can't be fully real without a configured warehouse/pickup
 * location on the provider's side. */
export async function requestPickup(input: unknown) {
  try {
    await requireStaff();
    const data = pickupSchema.parse(input);

    const shipments = await prisma.shipment.findMany({ where: { id: { in: data.shipmentIds } } });
    const awbNumbers = shipments.map((s) => s.awbNumber).filter((a): a is string => !!a);
    if (awbNumbers.length === 0) throw new AppError("No valid AWB numbers among the selected shipments", 400, "NO_AWB");

    const provider = getShippingProvider();
    const result = await provider.requestPickup({ awbNumbers, pickupDate: data.pickupDate });

    await prisma.shipment.updateMany({
      where: { id: { in: data.shipmentIds } },
      data: { status: "PICKUP_SCHEDULED", pickupScheduledAt: new Date(data.pickupDate) },
    });

    revalidatePath("/admin/orders");
    return { success: true as const, data: result };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Pulls fresh tracking events from the provider and appends any new ones —
 * called either from a polling cron job or on-demand when a customer opens
 * their order tracking page. Provider webhooks (app/api/webhooks/shipping)
 * are the faster path when configured; this is the fallback that works
 * even without webhooks set up yet.
 */
export async function syncShipmentTracking(orderId: string) {
  try {
    const shipment = await prisma.shipment.findUnique({ where: { orderId }, include: { events: true } });
    if (!shipment?.awbNumber) throw new NotFoundError("Shipment");

    const provider = getShippingProvider();
    const events = await provider.trackShipment(shipment.awbNumber);

    const knownTimestamps = new Set(shipment.events.map((e) => e.occurredAt.getTime()));
    const newEvents = events.filter((e) => !knownTimestamps.has(e.occurredAt.getTime()));

    if (newEvents.length > 0) {
      // `events` is guaranteed non-empty here — newEvents is a filtered
      // subset of it, so newEvents.length > 0 implies events.length > 0 too.
      // TypeScript's noUncheckedIndexedAccess can't infer that from the
      // filter relationship, so it's captured once with a clear assertion
      // rather than repeated unsafe indexing below.
      const latestEvent = events[events.length - 1]!;

      await prisma.$transaction([
        ...newEvents.map((e) =>
          prisma.shipmentEvent.create({
            data: { shipmentId: shipment.id, status: e.status, description: e.description, location: e.location, occurredAt: e.occurredAt },
          })
        ),
        prisma.shipment.update({
          where: { id: shipment.id },
          data: { status: latestEvent.status, deliveredAt: latestEvent.status === "DELIVERED" ? new Date() : shipment.deliveredAt },
        }),
      ]);

      if (latestEvent.status === "DELIVERED" && shipment.status !== "DELIVERED") {
        await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
        sendDeliveryConfirmationEmail(orderId).catch((err) => logger.error("notify:delivery:failed", { orderId, error: String(err) }));
      }
    }

    revalidatePath(`/account/orders`);
    return { success: true as const, data: { newEventCount: newEvents.length } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

const returnSchema = z.object({ orderId: z.string().cuid(), reason: z.string().min(3).max(300) });

export async function initiateReturnShipment(input: unknown) {
  try {
    const user = await requireUser();
    const data = returnSchema.parse(input);

    const order = await prisma.order.findUnique({ where: { id: data.orderId }, include: { customer: true, shipment: true } });
    if (!order) throw new NotFoundError("Order");
    if (order.customer.userId !== user.id && user.role !== "ADMIN" && user.role !== "STAFF") throw new ForbiddenError();
    if (order.status !== "DELIVERED") throw new AppError("Only delivered orders can be returned", 400, "NOT_DELIVERED");
    if (!order.shipment?.awbNumber) throw new AppError("No shipment record found for this order", 400, "NO_SHIPMENT");

    const provider = getShippingProvider();
    const result = await provider.createReturnShipment({ awbNumber: order.shipment.awbNumber, reason: data.reason });

    await prisma.$transaction([
      prisma.returnShipment.create({
        data: { orderId: order.id, reason: data.reason, status: "APPROVED", awbNumber: result.returnAwbNumber },
      }),
      prisma.order.update({ where: { id: order.id }, data: { status: "RETURN_REQUESTED" } }),
    ]);

    revalidatePath("/account/orders");
    revalidatePath("/admin/orders");
    return { success: true as const, data: { returnAwbNumber: result.returnAwbNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
