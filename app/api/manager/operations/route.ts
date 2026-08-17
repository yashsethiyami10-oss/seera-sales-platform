import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  closeJointWorking,
  createDistributorProspect,
  updateDistributorProspect,
  activateDistributorProspect,
  prospectTimeline,
  createManagerInstruction,
  managerBookRetailerOrder,
  managerDailyWorking,
  managerEndDaySummary,
  managerRetailerCheckIn,
  managerRetailerCheckOut,
  managerTeamReadModel,
  startJointWorking,
  correctAttendance,
  managerPartnerCheckIn,
  managerPartnerCheckOut,
  assignDistributorToOrder,
} from "@/lib/sales-distribution/manager-service";
import { capturePhoto } from "@/lib/sales-distribution/field-portal-service";
import { assistedDistributorOperation, endFieldDay, startFieldDay, recordPaymentPromise } from "@/lib/sales-distribution/workflow-service";
import {
  createBeatPlan,
  publishBeatPlan,
  duplicateBeatPlan,
  editBeatPlan,
  reassignBeatPlan,
  cancelBeatPlan,
  createManagerTeamAssignment,
  assignDistributorToExecutive,
  GEOGRAPHY_TYPES,
} from "@/lib/sales-distribution/operational-service";
import { submitTaClaim } from "@/lib/sales-distribution/travel-lifecycle-service";

const requestBody = z.object({
  action: z.enum([
    "start-day",
    "end-day",
    "end-day-summary",
    "retailer-check-in",
    "retailer-check-out",
    "book-order",
    "daily-working",
    "create-distributor-prospect",
    "update-prospect",
    "activate-prospect",
    "team-dashboard",
    "start-joint",
    "close-joint",
    "assisted-distributor",
    "create-beat-plan",
    "publish-plan",
    "duplicate-plan",
    "edit-plan",
    "reassign-plan",
    "cancel-plan",
    "record-payment-promise",
    "create-instruction",
    "correct-attendance",
    "partner-check-in",
    "partner-check-out",
    "submit-ta-claim",
    "capture-photo-manager",
    "prospect-timeline",
    "assign-distributor",
    "assign-manager-team",
    "assign-distributor-to-executive",
  ]),
  payload: z.record(z.unknown()).default({}),
});
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    // HARDENING A: per-actor rate limit, matching the pattern already used on comparable
    // authenticated mutation routes (/api/foundation/users, /api/offline/sync) — this route was
    // previously unlimited.
    enforceRateLimit(`manager-operations:${user.id}`, 60, 60_000);
    const { action, payload } = requestBody.parse(await request.json());
    let result;
    if (action === "start-day")
      result = await startFieldDay(prisma, user.id, {
        employeeRole: "SALES_MANAGER",
        ...z
          .object({
            workingType: z.enum(["RETAILING", "JOINT_WORKING", "DISTRIBUTOR_VISIT", "SUPER_STOCKIST_VISIT", "DISTRIBUTOR_SEARCH", "COLLECTION_FOLLOW_UP", "TEAM_REVIEW", "MARKET_DEVELOPMENT", "OTHER", "MARKET_WORKING"]),
            plannedGeographyId: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            accuracy: z.number().optional(),
            startExceptionReason: z.string().optional(),
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
          accuracy: z.number().optional(),
          endExceptionReason: z.string().optional(),
          remarks: z.string().optional(),
          outcome: z.string(),
        })
        .parse(payload);
      result = await endFieldDay(prisma, user.id, v.sessionId, v);
    } else if (action === "end-day-summary")
      result = await managerEndDaySummary(prisma, user.id, z.object({ sessionId: z.string() }).parse(payload).sessionId);
    else if (action === "retailer-check-in")
      result = await managerRetailerCheckIn(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            retailerId: z.string().optional(),
            newRetailer: z
              .object({
                businessName: z.string().min(1),
                address: z.record(z.unknown()),
                ownerName: z.string().optional(),
                mobile: z.string().optional(),
                alternateMobile: z.string().optional(),
                pincode: z.string().optional(),
                customerType: z.enum(["RETAILER", "WHOLESALER", "DISTRIBUTOR_PROSPECT", "INSTITUTIONAL_OTHER"]).optional(),
                gstin: z.string().optional(),
                distributorId: z.string().optional(),
                notes: z.string().optional(),
                confirmDuplicate: z.boolean().optional(),
              })
              .optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            accuracy: z.number().optional(),
            gpsExceptionReason: z.string().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "retailer-check-out") {
      const v = z
        .object({
          visitId: z.string(),
          outcome: z.enum(["ORDER_BOOKED", "NO_ORDER", "FOLLOW_UP", "COLLECTION", "MARKET_INTELLIGENCE"]),
          noOrderReason: z.string().optional(),
          followUpAt: z.coerce.date().optional(),
          notes: z.string().optional(),
          photoExceptionReason: z.string().optional(),
          routeDeviationReason: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy: z.number().optional(),
        })
        .parse(payload);
      result = await managerRetailerCheckOut(prisma, user.id, v.visitId, v);
    } else if (action === "book-order") {
      const v = z
        .object({
          visitId: z.string(),
          notes: z.string().optional(),
          commercialPaymentType: z.enum(["CASH", "CREDIT"]).optional(),
          lines: z.array(z.object({ skuId: z.string(), quantity: z.number().positive(), rate: z.number().positive().optional() })).min(1),
          photoExceptionReason: z.string().optional(),
          routeDeviationReason: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy: z.number().optional(),
          idempotencyKey: z.string(),
        })
        .parse(payload);
      result = await managerBookRetailerOrder(prisma, user.id, v);
    } else if (action === "daily-working")
      result = await managerDailyWorking(prisma, user.id, z.object({ sessionId: z.string() }).parse(payload).sessionId);
    else if (action === "create-distributor-prospect")
      result = await createDistributorProspect(
        prisma,
        user.id,
        z
          .object({
            businessName: z.string(),
            mobile: z.string(),
            alternateMobile: z.string().optional(),
            areaId: z.string().optional(),
            geographyType: z.string().optional(),
            existingBrands: z.string().optional(),
            expectedVolume: z.string().optional(),
            sampleGiven: z.boolean().optional(),
            sampleDetails: z.string().optional(),
            notes: z.string().optional(),
            profile: z.record(z.unknown()),
            followUpAt: z.coerce.date().optional(),
            prospectType: z.enum(["DISTRIBUTOR", "SUPER_STOCKIST"]).optional(),
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
    } else if (action === "activate-prospect") {
      const v = z.object({ prospectId: z.string(), partnerId: z.string() }).parse(payload);
      result = await activateDistributorProspect(prisma, user.id, v.prospectId, v.partnerId);
    } else if (action === "assign-distributor") {
      const v = z.object({ orderId: z.string(), distributorId: z.string(), reason: z.string().min(3) }).parse(payload);
      result = await assignDistributorToOrder(prisma, user.id, v);
    } else if (action === "assign-manager-team") {
      const v = z.object({ executiveId: z.string(), managerId: z.string(), effectiveFrom: z.coerce.date(), reason: z.string().min(3) }).parse(payload);
      result = await createManagerTeamAssignment(prisma, user.id, v);
    } else if (action === "assign-distributor-to-executive") {
      const v = z.object({ executiveId: z.string(), distributorId: z.string(), reason: z.string().min(3) }).parse(payload);
      result = await assignDistributorToExecutive(prisma, user.id, v);
    } else if (action === "prospect-timeline")
      result = await prospectTimeline(prisma, user.id, z.object({ prospectId: z.string() }).parse(payload).prospectId);
    else if (action === "team-dashboard") result = await managerTeamReadModel(prisma, user.id);
    else if (action === "start-joint")
      result = await startJointWorking(
        prisma,
        user.id,
        z
          .object({
            salesExecutiveId: z.string(),
            territoryId: z.string().optional(),
            beatId: z.string().optional(),
            objective: z.enum(["COACHING", "TARGET_RECOVERY", "MARKET_DEVELOPMENT", "PRODUCT_PUSH", "PAYMENT_FOLLOW_UP", "RETAILER_RELATIONSHIP", "PERFORMANCE_REVIEW", "OTHER"]),
          })
          .parse(payload),
      );
    else if (action === "close-joint") {
      const v = z.object({ jointWorkId: z.string(), observations: z.string(), coaching: z.string() }).parse(payload);
      result = await closeJointWorking(prisma, user.id, v.jointWorkId, v);
    } else if (action === "create-beat-plan")
      result = await createBeatPlan(
        prisma,
        user.id,
        z
          .object({
            employeeId: z.string().min(1),
            territoryName: z.string().min(1),
            beatName: z.string().min(1),
            geographyType: z.enum(GEOGRAPHY_TYPES),
            geographyName: z.string().min(1),
            distributorName: z.string().optional(),
            dayOfWeek: z.coerce.number().int().min(0).max(6),
            effectiveFrom: z.coerce.date(),
            effectiveTo: z.coerce.date().optional(),
            notes: z.string().optional(),
            publish: z.boolean().default(false),
          })
          .parse(payload),
      );
    else if (action === "publish-plan")
      result = await publishBeatPlan(prisma, user.id, z.object({ planId: z.string() }).parse(payload).planId);
    else if (action === "duplicate-plan") {
      const v = z.object({ planId: z.string(), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional() }).parse(payload);
      result = await duplicateBeatPlan(prisma, user.id, v.planId, v);
    } else if (action === "edit-plan") {
      const v = z.object({ planId: z.string(), notes: z.string().optional(), distributorName: z.string().optional(), effectiveTo: z.coerce.date().optional() }).parse(payload);
      result = await editBeatPlan(prisma, user.id, v.planId, v);
    } else if (action === "reassign-plan") {
      const v = z.object({ planId: z.string(), employeeId: z.string(), reason: z.string().min(3) }).parse(payload);
      result = await reassignBeatPlan(prisma, user.id, v.planId, v);
    } else if (action === "cancel-plan") {
      const v = z.object({ planId: z.string(), reason: z.string().min(3) }).parse(payload);
      result = await cancelBeatPlan(prisma, user.id, v.planId, v.reason);
    } else if (action === "record-payment-promise")
      result = await recordPaymentPromise(prisma, user.id, {
        ...z.object({ orderId: z.string(), promisedPaymentDate: z.coerce.date(), reason: z.string().min(3), verbalCommitmentContext: z.string().optional() }).parse(payload),
        sourcePortal: "sales-manager",
      });
    else if (action === "create-instruction")
      result = await createManagerInstruction(
        prisma,
        user.id,
        z
          .object({
            assignedEmployeeId: z.string(),
            title: z.string().min(1),
            body: z.string().min(1),
            priority: z.enum(["NORMAL", "HIGH"]).optional(),
            dueAt: z.coerce.date().optional(),
          })
          .parse(payload),
      );
    else if (action === "correct-attendance") {
      const v = z
        .object({
          workSessionId: z.string(),
          status: z.enum(["ACTIVE", "ENDED", "CANCELLED"]).optional(),
          endedAt: z.coerce.date().optional(),
          outcome: z.string().optional(),
          remarks: z.string().optional(),
          reason: z.string().min(3),
        })
        .parse(payload);
      result = await correctAttendance(prisma, user.id, v.workSessionId, v);
    } else if (action === "partner-check-in")
      result = await managerPartnerCheckIn(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            partnerType: z.enum(["DISTRIBUTOR", "SUPER_STOCKIST"]),
            partnerId: z.string().optional(),
            newParty: z
              .object({
                businessName: z.string().min(1),
                area: z.string().min(1),
                geographyType: z.string().optional(),
                contactPerson: z.string().optional(),
                mobile: z.string().optional(),
                notes: z.string().optional(),
              })
              .optional(),
            purpose: z.enum(["STOCK_REVIEW", "PAYMENT_FOLLOW_UP", "ORDER_REVIEW", "MARKET_DEVELOPMENT", "COMPLAINT", "CREDIT_REVIEW", "RETURNS_CLAIMS", "GENERAL_MEETING", "OTHER"]),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            accuracy: z.number().optional(),
            gpsExceptionReason: z.string().optional(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else if (action === "partner-check-out") {
      const v = z
        .object({
          visitId: z.string(),
          outcome: z.enum(["PRODUCTIVE", "FOLLOW_UP", "NO_ORDER"]),
          notes: z.string().optional(),
          nextAction: z.string().optional(),
          followUpAt: z.coerce.date().optional(),
          photoExceptionReason: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          accuracy: z.number().optional(),
        })
        .parse(payload);
      result = await managerPartnerCheckOut(prisma, user.id, v.visitId, v);
    } else if (action === "submit-ta-claim")
      result = await submitTaClaim(
        prisma,
        user.id,
        z
          .object({
            workSessionId: z.string(),
            vehicleType: z.string(),
            claimedDistanceKm: z.number().nonnegative(),
            tollAmount: z.number().nonnegative().default(0),
            parkingAmount: z.number().nonnegative().default(0),
            dailyAllowance: z.number().nonnegative().default(0),
            deviationReason: z.string().optional(),
            remarks: z.string().optional(),
            proofFileIds: z.array(z.string()).default([]),
            idempotencyKey: z.string(),
            purpose: z.string().optional(),
            fromLocation: z.string().optional(),
            toLocation: z.string().optional(),
            hotelStay: z.boolean().optional(),
            hotelName: z.string().optional(),
            hotelAmount: z.number().nonnegative().optional(),
            hotelBillFileId: z.string().optional(),
            otherExpenseAmount: z.number().nonnegative().optional(),
            otherExpenseNote: z.string().optional(),
          })
          .parse(payload),
      );
    else if (action === "capture-photo-manager")
      result = await capturePhoto(
        prisma,
        user.id,
        z
          .object({
            visitId: z.string(),
            photoType: z.enum(["SHOPFRONT", "COUNTER", "PRODUCT_DISPLAY", "BANNER_BRANDING", "MERCHANDISING", "OTHER"]),
            fileBase64: z.string().min(1),
            mimeType: z.string(),
            originalName: z.string(),
            idempotencyKey: z.string(),
          })
          .parse(payload),
      );
    else result = await assistedDistributorOperation(prisma, user.id, z.object({ distributorId: z.string(), reason: z.string(), idempotencyKey: z.string(), subtotal: z.number().nonnegative() }).parse(payload));
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, request);
  }
}
