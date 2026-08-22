import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  startFieldDay,
  endFieldDay,
  placeRetailerOrder,
} from "@/lib/sales-distribution/workflow-service";
import { recordCollection, captureMarketIntelligence } from "@/lib/sales-distribution/operational-service";
import { createDistributorProspect, updateDistributorProspect } from "@/lib/sales-distribution/manager-service";
import { submitTaClaim } from "@/lib/sales-distribution/travel-lifecycle-service";
import {
  executiveCheckIn,
  executiveCheckOut,
  skipRetailer,
  recordRouteDeviation,
  createRetailer,
  createRetailerAndCheckIn,
  executiveRetailerSearch,
  recordPhotoException,
  deleteVisitPhoto,
  createFollowUp,
  resolveFollowUp,
  acknowledgeInstruction,
  completeInstruction,
  recordPhotoTelemetry,
} from "@/lib/sales-distribution/field-portal-service";

const body = z.object({
  action: z.enum([
    "start-day",
    "end-day",
    "check-in",
    "check-out",
    "place-order",
    "collection",
    "skip-retailer",
    "route-deviation",
    "create-retailer",
    "create-retailer-and-check-in",
    "retailer-search",
    "photo-exception",
    "delete-photo",
    "create-follow-up",
    "resolve-follow-up",
    "acknowledge-instruction",
    "complete-instruction",
    "create-prospect",
    "update-prospect",
    "submit-ta-claim",
    "market-intelligence",
    "photo-telemetry",
  ]),
  payload: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    // HARDENING A: per-actor rate limit, matching the pattern already used on comparable
    // authenticated mutation routes (/api/foundation/users, /api/offline/sync) — this route was
    // previously unlimited.
    enforceRateLimit(`field-operations:${user.id}`, 60, 60_000);
    const { action, payload } = body.parse(await request.json());
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
            accuracy: z.number().optional(),
            startExceptionReason: z.string().optional(),
            remarks: z.string().optional(),
            workingDistributorId: z.string().optional(),
          })
          .parse(payload),
      });
    else if (action === "end-day") {
      const v = z
        .object({
          sessionId: z.string(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy: z.number().optional(),
          endExceptionReason: z.string().optional(),
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
            accuracy: z.number().optional(),
            gpsExceptionReason: z.string().optional(),
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
          photoExceptionReason: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy: z.number().optional(),
          idempotencyKey: z.string(),
        })
        .parse(payload);
      result = await executiveCheckOut(prisma, user.id, v.visitId, v);
    } else if (action === "photo-telemetry") {
      const v = z
        .object({
          event: z.enum([
            "IMAGE_PREP_START", "IMAGE_PREP_SUCCESS", "IMAGE_PREP_FAILED",
            "UPLOAD_START", "UPLOAD_SUCCESS", "UPLOAD_FAILED",
            "FINALIZE_START", "FINALIZE_SUCCESS", "FINALIZE_FAILED",
            "RENDERER_RELOAD_RESUME",
          ]),
          visitId: z.string().optional(),
          elapsedMs: z.number().nonnegative().optional(),
          errorCode: z.string().max(64).optional(),
          sourceMime: z.string().max(64).optional(),
          sourceBytes: z.number().nonnegative().optional(),
          sourceWidth: z.number().nonnegative().optional(),
          sourceHeight: z.number().nonnegative().optional(),
          outputBytes: z.number().nonnegative().optional(),
        })
        .parse(payload);
      result = await recordPhotoTelemetry(prisma, user.id, v);
    } else if (action === "place-order") {
      const v = z
          .object({
            retailerId: z.string(),
            requestedDeliveryAt: z.coerce.date().optional(),
            notes: z.string().optional(),
            commercialPaymentType: z.enum(["CASH", "CREDIT"]).optional(),
            lines: z
              .array(
                z.object({
                  skuId: z.string(),
                  quantity: z.number().positive(),
                  rate: z.number().positive().optional(),
                  uom: z.object({ unit: z.string(), packFactor: z.number().int().positive(), uomQuantity: z.number().positive() }).optional(),
                  scheme: z.object({ freeQuantity: z.number().positive(), freeUom: z.string(), freeBaseQuantity: z.number().positive() }).optional(),
                }),
              )
              .min(1),
            idempotencyKey: z.string(),
            source: z.enum(["FIELD_VISIT", "PHONE_CALL", "WHATSAPP", "OTHER"]).optional(),
            visitId: z.string().optional(),
          })
          .parse(payload),
        retailer = await prisma.seeraRetailer.findFirst({
          where: {
            id: v.retailerId,
            salespersonId: user.id,
            lifecycle: "ACTIVE",
          },
        });
      if (!retailer) throw new Error("Retailer is outside your scope");
      // placeRetailerOrder itself now resolves an unmapped retailer's Distributor (territory
      // auto-route, or books unassigned for Manager to resolve) — this route no longer hard-blocks
      // on a missing distributorId; commercialPartyId here is only the pre-resolution value used
      // for the FORGED_ASSIGNMENT tamper check when a distributor was already assigned.
      result = await placeRetailerOrder(
        prisma,
        {
          actorId: user.id,
          sourcePortal: "sales-executive",
          commercialPartyType: "DISTRIBUTOR",
          commercialPartyId: retailer.distributorId ?? "",
        },
        v,
      );
    } else if (action === "collection")
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
    else if (action === "skip-retailer")
      result = await skipRetailer(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            retailerId: z.string(),
            reason: z.string().min(1),
            remarks: z.string().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "route-deviation")
      result = await recordRouteDeviation(
        prisma,
        user.id,
        z.object({ visitId: z.string(), reason: z.string().min(1) }).parse(payload),
      );
    else if (action === "create-retailer")
      result = await createRetailer(
        prisma,
        user.id,
        z
          .object({
            businessName: z.string().min(1),
            address: z.record(z.unknown()),
            ownerName: z.string().optional(),
            mobile: z.string().optional(),
            alternateMobile: z.string().optional(),
            pincode: z.string().optional(),
            shopType: z
              .enum([
                "KIRANA",
                "GENERAL_STORE",
                "SUPERMARKET",
                "MINI_MART",
                "DEPARTMENTAL_STORE",
                "WHOLESALE_RETAILER",
                "CHEMIST_PHARMACY",
                "INSTITUTIONAL_COUNTER",
                "OTHER",
              ])
              .optional(),
            customerType: z
              .enum(["RETAILER", "WHOLESALER", "DISTRIBUTOR_PROSPECT", "INSTITUTIONAL_OTHER"])
              .optional(),
            gstin: z.string().optional(),
            distributorId: z.string().optional(),
            territoryId: z.string().optional(),
            beatId: z.string().optional(),
            marketId: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            notes: z.string().optional(),
            confirmDuplicate: z.boolean().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "create-retailer-and-check-in")
      result = await createRetailerAndCheckIn(
        prisma,
        user.id,
        z
          .object({
            businessName: z.string().min(1),
            address: z.record(z.unknown()),
            ownerName: z.string().optional(),
            mobile: z.string().optional(),
            alternateMobile: z.string().optional(),
            pincode: z.string().optional(),
            shopType: z
              .enum([
                "KIRANA",
                "GENERAL_STORE",
                "SUPERMARKET",
                "MINI_MART",
                "DEPARTMENTAL_STORE",
                "WHOLESALE_RETAILER",
                "CHEMIST_PHARMACY",
                "INSTITUTIONAL_COUNTER",
                "OTHER",
              ])
              .optional(),
            customerType: z
              .enum(["RETAILER", "WHOLESALER", "DISTRIBUTOR_PROSPECT", "INSTITUTIONAL_OTHER"])
              .optional(),
            gstin: z.string().optional(),
            distributorId: z.string().optional(),
            territoryId: z.string().optional(),
            beatId: z.string().optional(),
            marketId: z.string().optional(),
            notes: z.string().optional(),
            confirmDuplicate: z.boolean().optional(),
            idempotencyKey: z.string(),
            workSessionId: z.string(),
            checkInIdempotencyKey: z.string(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            accuracy: z.number().optional(),
            gpsExceptionReason: z.string().optional(),
          })
          .parse(payload),
      );
    else if (action === "retailer-search") {
      const v = z.object({ q: z.string() }).parse(payload);
      result = await executiveRetailerSearch(prisma, user.id, v.q);
    } else if (action === "photo-exception")
      result = await recordPhotoException(
        prisma,
        user.id,
        z.object({ visitId: z.string(), reason: z.string().min(1) }).parse(payload),
      );
    else if (action === "delete-photo") {
      const v = z.object({ photoId: z.string(), reason: z.string().min(1) }).parse(payload);
      result = await deleteVisitPhoto(prisma, user.id, v.photoId, v);
    } else if (action === "create-follow-up")
      result = await createFollowUp(
        prisma,
        user.id,
        z
          .object({
            type: z.string(),
            retailerId: z.string().optional(),
            prospectId: z.string().optional(),
            visitId: z.string().optional(),
            dueDate: z.coerce.date(),
            priority: z.enum(["NORMAL", "HIGH"]).optional(),
            note: z.string().min(1),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "resolve-follow-up") {
      const v = z.object({ followUpId: z.string(), resolutionNote: z.string().optional() }).parse(payload);
      result = await resolveFollowUp(prisma, user.id, v.followUpId, v);
    } else if (action === "acknowledge-instruction") {
      const v = z.object({ instructionId: z.string() }).parse(payload);
      result = await acknowledgeInstruction(prisma, user.id, v.instructionId);
    } else if (action === "complete-instruction") {
      const v = z.object({ instructionId: z.string(), remarks: z.string().optional() }).parse(payload);
      result = await completeInstruction(prisma, user.id, v.instructionId, v);
    } else if (action === "create-prospect")
      result = await createDistributorProspect(
        prisma,
        user.id,
        z
          .object({
            businessName: z.string().min(1),
            mobile: z.string().min(10),
            alternateMobile: z.string().optional(),
            areaId: z.string().optional(),
            geographyType: z.string().optional(),
            existingBrands: z.string().optional(),
            expectedVolume: z.string().optional(),
            sampleGiven: z.boolean().optional(),
            sampleDetails: z.string().optional(),
            notes: z.string().optional(),
            profile: z.record(z.unknown()).default({}),
            followUpAt: z.coerce.date().optional(),
            confirmDuplicate: z.boolean().optional(),
          })
          .parse(payload),
      );
    else if (action === "update-prospect") {
      const v = z
        .object({
          prospectId: z.string(),
          stage: z.enum(["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "EVALUATION", "APPROVAL", "ACTIVATED", "NOT_INTERESTED"]),
          interest: z.string().optional(),
          recommendation: z.string().optional(),
          notes: z.string().optional(),
          followUpAt: z.coerce.date().optional(),
        })
        .parse(payload);
      result = await updateDistributorProspect(prisma, user.id, v.prospectId, v);
    } else if (action === "submit-ta-claim")
      result = await submitTaClaim(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            managerId: z.string().optional(),
            vehicleType: z.string(),
            claimedDistanceKm: z.number().nonnegative(),
            tollAmount: z.number().nonnegative().default(0),
            parkingAmount: z.number().nonnegative().default(0),
            dailyAllowance: z.number().nonnegative().default(0),
            deviationReason: z.string().optional(),
            remarks: z.string().optional(),
            proofFileIds: z.array(z.string()).default([]),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else
      result = await captureMarketIntelligence(
        prisma,
        user.id,
        z
          .object({
            retailerId: z.string().optional(),
            geographyId: z.string().optional(),
            competitor: z.string().min(1),
            product: z.string().optional(),
            price: z.number().optional(),
            scheme: z.string().optional(),
            retailerFeedback: z.string().optional(),
            newLaunch: z.string().optional(),
            shelfDisplay: z.string().optional(),
            marketIssue: z.string().optional(),
            workSessionId: z.string().optional(),
          })
          .parse(payload),
      );
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, request);
  }
}
