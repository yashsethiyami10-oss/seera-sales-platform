import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import {
  startFieldDay,
  endFieldDay,
  placeRetailerOrder,
} from "@/lib/sales-distribution/workflow-service";
import { recordCollection } from "@/lib/sales-distribution/operational-service";
import {
  executiveCheckIn,
  executiveCheckOut,
} from "@/lib/sales-distribution/field-portal-service";
const body = z.object({
  action: z.enum([
    "start-day",
    "end-day",
    "check-in",
    "check-out",
    "place-order",
    "collection",
  ]),
  payload: z.record(z.unknown()).default({}),
});
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity(),
      { action, payload } = body.parse(await request.json());
    let result;
    if (action === "start-day")
      result = await startFieldDay(prisma, user.id, {
        employeeRole: "SALES_EXECUTIVE",
        ...z
          .object({
            workingType: z.string().default("RETAILING"),
            plannedGeographyId: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            remarks: z.string().optional(),
          })
          .parse(payload),
      });
    else if (action === "end-day") {
      const v = z
        .object({
          sessionId: z.string(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          remarks: z.string().optional(),
          outcome: z.string(),
        })
        .parse(payload);
      result = await endFieldDay(prisma, user.id, v.sessionId, v);
    } else if (action === "check-in")
      result = await executiveCheckIn(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            retailerId: z.string(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "check-out") {
      const v = z
        .object({
          visitId: z.string(),
          outcome: z.enum([
            "ORDER_BOOKED",
            "NO_ORDER",
            "FOLLOW_UP",
            "COLLECTION",
            "MARKET_INTELLIGENCE",
          ]),
          noOrderReason: z.string().optional(),
          followUpAt: z.coerce.date().optional(),
          notes: z.string().optional(),
        })
        .parse(payload);
      result = await executiveCheckOut(prisma, user.id, v.visitId, v);
    } else if (action === "place-order") {
      const v = z
          .object({
            retailerId: z.string(),
            requestedDeliveryAt: z.coerce.date().optional(),
            notes: z.string().optional(),
            lines: z
              .array(
                z.object({
                  skuId: z.string(),
                  quantity: z.number().positive(),
                }),
              )
              .min(1),
            idempotencyKey: z.string(),
          })
          .parse(payload),
        retailer = await prisma.seeraRetailer.findFirst({
          where: {
            id: v.retailerId,
            salespersonId: user.id,
            lifecycle: "ACTIVE",
          },
        });
      if (!retailer?.distributorId)
        throw new Error("Retailer has no active Distributor assignment");
      result = await placeRetailerOrder(
        prisma,
        {
          actorId: user.id,
          sourcePortal: "sales-executive",
          commercialPartyType: "DISTRIBUTOR",
          commercialPartyId: retailer.distributorId,
        },
        v,
      );
    } else
      result = await recordCollection(
        prisma,
        user.id,
        z
          .object({
            retailerId: z.string(),
            amount: z.number().positive(),
            paymentMode: z.string(),
            reference: z.string().optional(),
            proofFileId: z.string().optional(),
            invoiceRef: z.string().optional(),
            remarks: z.string().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, request);
  }
}
