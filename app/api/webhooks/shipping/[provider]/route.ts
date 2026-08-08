import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDeliveryConfirmationEmail } from "@/lib/notify/send";
import { logger } from "@/lib/logger";
import crypto from "crypto";

/**
 * One webhook URL per provider (/api/webhooks/shipping/shiprocket,
 * /delhivery, /bluedart, /dtdc) rather than one shared endpoint — each
 * courier's dashboard needs its own webhook URL configured anyway, and each
 * sends a genuinely different payload shape and signature scheme, so
 * "normalize inbound webhooks" has to mean "parse differently per
 * provider, write to the same ShipmentEvent table," not "one parser for
 * everything."
 *
 * SIGNATURE VERIFICATION: unlike Razorpay (one well-documented HMAC
 * scheme), shipping providers vary widely — some sign with HMAC-SHA256 on
 * a shared secret (verified below as a generic pattern), others only
 * support IP allowlisting or a static bearer token in a header. Confirm
 * the actual scheme in each provider's webhook docs before launch; the
 * verifyGenericHmac() below is a reasonable default, not a guarantee it
 * matches every provider's actual implementation.
 */

function verifyGenericHmac(rawBody: string, signatureHeader: string | null, secretEnvVar: string): boolean {
  const secret = process.env[secretEnvVar];
  if (!secret) {
    logger.warn("webhook:shipping:no-secret-configured", { secretEnvVar });
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

async function recordEvent(awbNumber: string, status: string, description: string, location: string | undefined, occurredAt: Date) {
  const shipment = awbNumber
    ? await prisma.shipment.findFirst({ where: { awbNumber } })
    : null;
  if (!shipment) {
    logger.warn("webhook:shipping:shipment-not-found", { awbNumber });
    return;
  }

  const normalizedStatus = normalizeStatus(status);

  await prisma.$transaction([
    prisma.shipmentEvent.create({ data: { shipmentId: shipment.id, status: normalizedStatus, description, location, occurredAt } }),
    prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: normalizedStatus, deliveredAt: normalizedStatus === "DELIVERED" ? occurredAt : shipment.deliveredAt },
    }),
  ]);

  // Block 3, Part D made Shipment.orderId nullable (a Shipment can now
  // belong to a BusinessOrder instead — see prisma/schema.prisma). This
  // webhook is the D2C courier-API integration exclusively (Shiprocket/
  // Delhivery/BlueDart/DTDC, matched by AWB); a BusinessOrder-linked
  // shipment never has a real courier-API provider and therefore never
  // reaches this handler in practice, but the null-check keeps the type
  // correct and the behavior explicit either way.
  if (normalizedStatus === "DELIVERED" && shipment.orderId) {
    const order = await prisma.order.findUnique({ where: { id: shipment.orderId } });
    if (order && order.status !== "DELIVERED") {
      await prisma.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
      sendDeliveryConfirmationEmail(order.id).catch((err) => logger.error("notify:delivery:failed", { orderId: order.id, error: String(err) }));
    }
  }
}

function normalizeStatus(raw: string): "PENDING" | "PICKUP_SCHEDULED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RTO" | "CANCELLED" {
  const s = raw.toLowerCase();
  if (s.includes("delivered")) return "DELIVERED";
  if (s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
  if (s.includes("transit")) return "IN_TRANSIT";
  if (s.includes("picked")) return "PICKED_UP";
  if (s.includes("pickup")) return "PICKUP_SCHEDULED";
  if (s.includes("rto") || s.includes("return")) return "RTO";
  if (s.includes("cancel")) return "CANCELLED";
  return "PENDING";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await req.text();

  const secretEnvVar = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
  const signature = req.headers.get("x-webhook-signature");
  if (!verifyGenericHmac(rawBody, signature, secretEnvVar)) {
    logger.warn("webhook:shipping:invalid-signature", { provider });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const body = JSON.parse(rawBody);
  logger.info("webhook:shipping:received", { provider });

  try {
    // Each provider's actual payload shape differs — this extracts the
    // three fields every one of them ultimately provides (AWB, a status
    // string, a timestamp) using each provider's documented field names.
    // Adjust these paths against real payloads once webhooks are live;
    // written from documentation, not a captured real payload.
    switch (provider.toUpperCase()) {
      case "SHIPROCKET":
        await recordEvent(body.awb, body.current_status, body.current_status_description ?? body.current_status, body.location, new Date(body.status_date ?? Date.now()));
        break;
      case "DELHIVERY":
        await recordEvent(body.Waybill, body.Status, body.Instructions ?? body.Status, body.StatusLocation, new Date(body.StatusDateTime ?? Date.now()));
        break;
      case "BLUEDART":
        await recordEvent(body.AWBNo, body.Status, body.Status, body.Location, new Date(body.ScanDate ?? Date.now()));
        break;
      case "DTDC":
        await recordEvent(body.awb, body.status, body.status, body.location, new Date(body.timestamp ?? Date.now()));
        break;
      default:
        logger.warn("webhook:shipping:unknown-provider", { provider });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Same reasoning as the Razorpay webhook: return 200 once verified so
    // the provider doesn't retry-storm a webhook whose failure was on our
    // side, and log for manual follow-up instead.
    logger.error("webhook:shipping:processing-failed", { provider, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ received: true });
  }
}
