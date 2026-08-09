import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import {
  createCompanyOrder,
  createDistributorReplenishment,
  fulfilDistributorReplenishment,
  fulfilRetailerOrder,
  recordInventoryMovement,
  reconcileStock,
} from "@/lib/sales-distribution/workflow-service";
import { completeDelivery } from "@/lib/sales-distribution/delivery-service";
import { submitPartnerClaim, submitPartnerPayment, submitPaymentProof } from "@/lib/sales-distribution/operational-service";
const body = z.object({
  action: z.enum([
    "fulfil-order",
    "inventory-movement",
    "reconcile-stock",
    "company-order",
    "complete-delivery",
    "create-distributor-replenishment",
    "fulfil-distributor-replenishment",
    "submit-payment-proof",
    "submit-partner-payment",
    "submit-partner-claim",
  ]),
  payload: z.record(z.unknown()),
});
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity(),
      { action, payload } = body.parse(await request.json());
    let result;
    if (action === "create-distributor-replenishment") {
      const v = z
        .object({
          distributorId: z.string(),
          idempotencyKey: z.string(),
          notes: z.string().optional(),
          lines: z
            .array(
              z.object({
                skuId: z.string(),
                quantity: z.number().int().positive(),
              }),
            )
            .min(1),
        })
        .parse(payload);
      result = await createDistributorReplenishment(
        prisma,
        user.id,
        v.distributorId,
        v,
      );
    } else if (action === "fulfil-distributor-replenishment") {
      const v = z
        .object({
          superStockistId: z.string(),
          orderId: z.string(),
          accepted: z.array(
            z.object({
              lineId: z.string(),
              quantity: z.number().nonnegative(),
            }),
          ),
          decision: z.enum(["ACCEPT", "PARTIAL_ACCEPT", "REJECT", "HOLD"]),
          reason: z.string().optional(),
        })
        .parse(payload);
      result = await fulfilDistributorReplenishment(
        prisma,
        user.id,
        v.superStockistId,
        {
          orderId: v.orderId,
          accepted: v.accepted,
          action: v.decision,
          reason: v.reason,
        },
      );
    } else if(action==="submit-partner-payment"){
      result=await submitPartnerPayment(prisma,user.id,z.object({partnerType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partnerId:z.string(),amount:z.number().positive(),reference:z.string().min(3),paymentMode:z.string().min(2),paymentDate:z.coerce.date(),proofId:z.string().optional(),idempotencyKey:z.string()}).parse(payload));
    } else if(action==="submit-partner-claim"){
      result=await submitPartnerClaim(prisma,user.id,z.object({partnerType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partnerId:z.string(),type:z.string().min(2),sourceType:z.string().optional(),sourceId:z.string().optional(),details:z.record(z.unknown()),idempotencyKey:z.string()}).parse(payload));
    } else if (action === "submit-payment-proof") {
      const v = z.object({superStockistId:z.string(),orderId:z.string(),amount:z.number().positive(),reference:z.string().min(3),fileId:z.string().optional(),idempotencyKey:z.string()}).parse(payload);
      result = await submitPaymentProof(prisma,user.id,v.superStockistId,v);
    } else if (action === "complete-delivery") {
      const v = z
        .object({
          deliveryId: z.string(),
          status: z.enum([
            "DELIVERED",
            "PARTIAL_DELIVERED",
            "REFUSED",
            "SHOP_CLOSED",
            "PAYMENT_ISSUE",
            "STOCK_UNAVAILABLE",
            "WRONG_ORDER",
            "RESCHEDULED",
            "DAMAGED",
            "OTHER",
          ]),
          lines: z.array(
            z.object({
              lineId: z.string(),
              quantity: z.number().nonnegative(),
            }),
          ),
          receiverName: z.string().optional(),
          reason: z.string().optional(),
          proof: z.record(z.unknown()).optional(),
        })
        .parse(payload);
      result = await completeDelivery(prisma, user.id, v.deliveryId, v);
    } else if (action === "fulfil-order") {
      const v = z
        .object({
          distributorId: z.string(),
          orderId: z.string(),
          accepted: z.array(
            z.object({
              lineId: z.string(),
              quantity: z.number().nonnegative(),
            }),
          ),
          decision: z.enum(["ACCEPT", "PARTIAL_ACCEPT", "REJECT", "HOLD"]),
          reason: z.string().optional(),
        })
        .parse(payload);
      result = await fulfilRetailerOrder(prisma, user.id, v.distributorId, {
        orderId: v.orderId,
        accepted: v.accepted,
        action: v.decision,
        reason: v.reason,
      });
    } else if (action === "inventory-movement")
      result = await recordInventoryMovement(
        prisma,
        user.id,
        z
          .object({
            partyType: z.enum(["DISTRIBUTOR", "SUPER_STOCKIST"]),
            partyId: z.string(),
            skuId: z.string(),
            type: z.enum([
              "OPENING",
              "RECEIPT",
              "ALLOCATION",
              "RELEASE",
              "DISPATCH",
              "DELIVERY",
              "RETURN",
              "DAMAGE",
              "SHORTAGE",
              "ADJUSTMENT",
              "RECONCILIATION",
              "OFF_SYSTEM_ISSUE",
              "CORRECTION",
            ]),
            direction: z.enum(["IN", "OUT", "RESERVE", "RELEASE"]),
            quantity: z.number().positive(),
            sourceType: z.string(),
            sourceId: z.string(),
            sourcePortal: z.string(),
            reason: z.string().min(3),
            idempotencyKey: z.string(),
            approvalId: z.string().optional(),
            onBehalfOfPartyId: z.string().optional(),
          })
          .parse(payload),
      );
    else if (action === "reconcile-stock")
      result = await reconcileStock(
        prisma,
        user.id,
        z
          .object({
            partyType: z.enum(["DISTRIBUTOR", "SUPER_STOCKIST"]),
            partyId: z.string(),
            periodEnd: z.coerce.date(),
            sourcePortal: z.string(),
            reason: z.string().min(3),
            idempotencyKey: z.string(),
            lines: z
              .array(
                z.object({
                  skuId: z.string(),
                  opening: z.number().nonnegative(),
                  receipts: z.number().nonnegative(),
                  issues: z.number().nonnegative(),
                  physicalClosing: z.number().nonnegative(),
                  reason: z.string().min(3),
                }),
              )
              .min(1),
          })
          .parse(payload),
      );
    else {
      const v = z
        .object({
          superStockistId: z.string(),
          subtotal: z.number().positive(),
          idempotencyKey: z.string(),
        })
        .parse(payload);
      result = await createCompanyOrder(prisma, user.id, v.superStockistId, v);
    }
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, request);
  }
}
