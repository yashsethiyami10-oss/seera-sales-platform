import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  createCompanyOrder,
  createDistributorReplenishment,
  fulfilDistributorReplenishment,
  fulfilRetailerOrder,
  recordInventoryMovement,
  reconcileStock,
  allocateOrderStock,
  dispatchAllocatedOrder,
  dispatchCompanyOrder,
  receiveIncomingOrder,
  recordPaymentPromise,
  fulfilRemainingOrderQuantity,
  closeRemainingOrderQuantity,
} from "@/lib/sales-distribution/workflow-service";
import { requestCreditExtension } from "@/lib/sales-distribution/credit-service";
import { completeDelivery } from "@/lib/sales-distribution/delivery-service";
import { submitPartnerClaim, submitPartnerPayment, submitPaymentProof } from "@/lib/sales-distribution/operational-service";
import { generateDistributorPaymentReceipt } from "@/lib/sales-distribution/financial-service";
import {
  createQuotationDraft,
  updateQuotationDraft,
  issueQuotation,
  recordQuotationResponse,
  expireQuotation,
  duplicateQuotation,
  convertQuotationToOrder,
} from "@/lib/sales-distribution/quotation-service";
import { createReturnRequest, decideReturnRequest } from "@/lib/sales-distribution/returns-service";
import { createBillingDraft, updateBillingDraft, issueBillingDraft } from "@/lib/sales-distribution/billing-service";
import { commercialLineInputSchema } from "@/lib/sales-distribution/document-lines";
import {
  acceptAndPrepareRetailerOrder,
  deliverRemainingRetailerOrder,
  recordEasyDeliveryOutcome,
} from "@/lib/sales-distribution/distributor-easy-mode-service";
import { acceptAndAllocateDistributorOrder } from "@/lib/sales-distribution/super-stockist-easy-mode-service";
import { createDistributorForSuperStockist, updateDistributorCreditPolicy, createSuperStockist, createCompanyDirectPartner, reassignDistributorToSuperStockist, settleDistributorClosureStock, setCompanyDirectEligibility } from "@/lib/sales-distribution/distributor-management-service";
import { sendDistributorPaymentReminder } from "@/lib/sales-distribution/outbox-service";
import { bulkOnboardRatanDistributors } from "@/lib/sales-distribution/ratan-onboarding-service";
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
    "allocate-order",
    "dispatch-order",
    "receive-incoming",
    "record-payment-promise",
    "request-credit-extension",
    "fulfil-remaining",
    "close-remaining",
    "create-quotation-draft",
    "update-quotation-draft",
    "issue-quotation",
    "respond-quotation",
    "expire-quotation",
    "duplicate-quotation",
    "convert-quotation",
    "create-return-request",
    "decide-return-request",
    "create-billing-draft",
    "update-billing-draft",
    "issue-billing-draft",
    "easy-decide",
    "easy-deliver-remaining",
    "easy-delivery-outcome",
    "ss-decide",
    "dispatch-company-order",
    "add-distributor",
    "update-distributor-credit",
    "send-payment-reminder",
    "generate-distributor-receipt",
    "create-super-stockist",
    "create-company-direct-partner",
    "set-company-direct-eligibility",
    "reassign-distributor",
    "settle-closure-stock",
    "bulk-onboard-ratan-distributors",
  ]),
  payload: z.record(z.unknown()),
});
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    // HARDENING A fix: this is the single busiest action-dispatch route in the app (orders,
    // payments, credit, dispatch, closure settlement — dozens of distinct mutating actions), yet
    // was the only comparable authenticated write route with no rate limit at all (every sibling —
    // /api/foundation/users, /api/offline/sync, /api/foundation/partner-logins — already has one).
    // Per-actor, not per-IP, matching those same routes' pattern.
    enforceRateLimit(`distribution-operations:${user.id}`, 60, 60_000);
    const { action, payload } = body.parse(await request.json());
    let result;
    if(action==="receive-incoming") result=await receiveIncomingOrder(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),orderId:z.string(),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})).min(1),reason:z.string().max(500).optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="record-payment-promise") result=await recordPaymentPromise(prisma,user.id,z.object({orderId:z.string(),partyId:z.string(),promisedPaymentDate:z.coerce.date(),reason:z.string().min(3),verbalCommitmentContext:z.string().optional(),sourcePortal:z.literal("super-stockist")}).parse(payload));
    else if(action==="request-credit-extension") result=await requestCreditExtension(prisma,user.id,z.object({orderId:z.string(),partyId:z.string(),extensionUntil:z.coerce.date(),reason:z.string().min(3),idempotencyKey:z.string()}).parse(payload));
    else if(action==="allocate-order") result=await allocateOrderStock(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),orderId:z.string(),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})).min(1),idempotencyKey:z.string()}).parse(payload));
    else if(action==="dispatch-order") result=await dispatchAllocatedOrder(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),orderId:z.string(),idempotencyKey:z.string(),vehicleNumber:z.string().optional(),driverName:z.string().optional(),driverMobile:z.string().optional(),transporterName:z.string().optional(),lrNumber:z.string().optional(),challanNumber:z.string().optional(),invoiceDocumentId:z.string().optional(),eta:z.coerce.date().optional()}).parse(payload));
    else if(action==="fulfil-remaining") result=await fulfilRemainingOrderQuantity(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),orderId:z.string(),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})).min(1),reason:z.string().optional()}).parse(payload));
    else if(action==="close-remaining") result=await closeRemainingOrderQuantity(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),orderId:z.string(),reason:z.string().min(3)}).parse(payload));
    else if(action==="easy-decide") result=await acceptAndPrepareRetailerOrder(prisma,user.id,z.object({distributorId:z.string()}).parse(payload).distributorId,z.object({distributorId:z.string(),orderId:z.string(),decision:z.enum(["ACCEPT","PARTIAL_ACCEPT","REJECT"]),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})),reason:z.string().optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="easy-deliver-remaining") result=await deliverRemainingRetailerOrder(prisma,user.id,z.object({distributorId:z.string()}).parse(payload).distributorId,z.object({distributorId:z.string(),orderId:z.string(),lines:z.array(z.object({lineId:z.string(),quantity:z.number().positive()})).min(1),reason:z.string().optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="easy-delivery-outcome") result=await recordEasyDeliveryOutcome(prisma,user.id,z.object({deliveryId:z.string(),outcome:z.enum(["DELIVERED","PARTIALLY_DELIVERED","NOT_DELIVERED","REFUSED","UNABLE_TO_DELIVER","DELIVER_LATER"]),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})),reason:z.string().optional(),receiverName:z.string().optional()}).parse(payload));
    else if(action==="ss-decide") result=await acceptAndAllocateDistributorOrder(prisma,user.id,z.object({superStockistId:z.string()}).parse(payload).superStockistId,z.object({superStockistId:z.string(),orderId:z.string(),decision:z.enum(["ACCEPT","PARTIAL_ACCEPT","REJECT"]),lines:z.array(z.object({lineId:z.string(),quantity:z.number().nonnegative()})),reason:z.string().optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="dispatch-company-order") result=await dispatchCompanyOrder(prisma,user.id,z.object({orderId:z.string(),idempotencyKey:z.string(),vehicleNumber:z.string().optional(),driverName:z.string().optional(),driverMobile:z.string().optional(),transporterName:z.string().optional(),lrNumber:z.string().optional(),challanNumber:z.string().optional(),invoiceDocumentId:z.string().optional(),eta:z.coerce.date().optional()}).parse(payload));
    else if(action==="add-distributor") result=await createDistributorForSuperStockist(prisma,user.id,z.object({superStockistId:z.string()}).parse(payload).superStockistId,z.object({superStockistId:z.string(),firmName:z.string().min(1),address:z.record(z.unknown()),mobile:z.string().min(10),ownerName:z.string().optional(),alternateMobile:z.string().optional(),email:z.string().email().optional(),gstin:z.string().optional(),pincode:z.string().optional(),territoryId:z.string().optional(),notes:z.string().optional(),creditEnabled:z.boolean(),creditLimit:z.number().nonnegative().optional(),creditDays:z.number().int().nonnegative().optional(),warningThreshold:z.number().nonnegative().optional(),blockThreshold:z.number().nonnegative().optional(),graceEnabled:z.boolean().optional(),graceDays:z.number().int().nonnegative().optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="update-distributor-credit") result=await updateDistributorCreditPolicy(prisma,user.id,z.object({superStockistId:z.string()}).parse(payload).superStockistId,z.object({superStockistId:z.string(),distributorId:z.string(),creditEnabled:z.boolean(),creditLimit:z.number().nonnegative(),creditDays:z.number().int().nonnegative(),warningThreshold:z.number().nonnegative().optional(),blockThreshold:z.number().nonnegative().optional(),graceEnabled:z.boolean().optional(),graceDays:z.number().int().nonnegative().optional(),changeReason:z.string().min(3)}).parse(payload));
    else if(action==="create-super-stockist") result=await createSuperStockist(prisma,user.id,z.object({firmName:z.string().min(1),tradeName:z.string().optional(),address:z.record(z.unknown()),mobile:z.string().min(10),ownerName:z.string().optional(),alternateMobile:z.string().optional(),email:z.string().email().optional(),gstin:z.string().optional(),pincode:z.string().optional(),territoryIds:z.array(z.string()).optional(),notes:z.string().optional(),billingProfile:z.object({state:z.string().min(1),stateCode:z.string().min(1),invoicePrefix:z.string().min(1)}).optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="create-company-direct-partner") result=await createCompanyDirectPartner(prisma,user.id,z.object({legalName:z.string().optional(),tradeName:z.string().optional(),address:z.record(z.unknown()),notes:z.string().optional(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="set-company-direct-eligibility") result=await setCompanyDirectEligibility(prisma,user.id,z.object({userId:z.string(),eligible:z.boolean(),reason:z.string().min(3)}).parse(payload));
    else if(action==="bulk-onboard-ratan-distributors") result=await bulkOnboardRatanDistributors(prisma,user.id);
    else if(action==="reassign-distributor") result=await reassignDistributorToSuperStockist(prisma,user.id,z.object({distributorId:z.string()}).parse(payload).distributorId,z.object({distributorId:z.string(),newSuperStockistId:z.string(),effectiveFrom:z.coerce.date(),reason:z.string().min(3),idempotencyKey:z.string()}).parse(payload));
    else if(action==="settle-closure-stock") result=await settleDistributorClosureStock(prisma,user.id,z.object({distributorId:z.string(),receivingSuperStockistId:z.string(),reason:z.string().min(3),idempotencyKey:z.string()}).parse(payload));
    else if(action==="send-payment-reminder") result=await sendDistributorPaymentReminder(prisma,user.id,z.object({superStockistId:z.string()}).parse(payload).superStockistId,z.object({superStockistId:z.string(),distributorId:z.string(),template:z.enum(["PAYMENT_REMINDER","OVERDUE_WARNING","PROMISE_MISSED","CREDIT_WARNING"]),note:z.string().max(300).optional()}).parse(payload));
    else if(action==="generate-distributor-receipt") result=await generateDistributorPaymentReceipt(prisma,user.id,z.object({superStockistId:z.string()}).parse(payload).superStockistId,z.object({superStockistId:z.string(),paymentId:z.string(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="create-quotation-draft") result=await createQuotationDraft(prisma,user.id,z.object({issuerType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),issuerId:z.string(),buyerType:z.enum(["RETAILER","DISTRIBUTOR"]),buyerId:z.string(),sourcePortal:z.string(),validUntil:z.coerce.date().optional(),paymentTerms:z.string().optional(),notes:z.string().optional(),lines:z.array(commercialLineInputSchema).min(1),idempotencyKey:z.string()}).parse(payload));
    else if(action==="update-quotation-draft") result=await updateQuotationDraft(prisma,user.id,z.string().parse((payload as {quotationId:unknown}).quotationId),z.object({validUntil:z.coerce.date().optional(),paymentTerms:z.string().optional(),notes:z.string().optional(),lines:z.array(commercialLineInputSchema).min(1)}).parse(payload));
    else if(action==="issue-quotation") result=await issueQuotation(prisma,user.id,z.object({quotationId:z.string()}).parse(payload).quotationId);
    else if(action==="respond-quotation") result=await recordQuotationResponse(prisma,user.id,z.object({quotationId:z.string()}).parse(payload).quotationId,z.object({decision:z.enum(["ACCEPTED","REJECTED"]),reason:z.string().optional()}).parse(payload));
    else if(action==="expire-quotation") result=await expireQuotation(prisma,user.id,z.object({quotationId:z.string()}).parse(payload).quotationId);
    else if(action==="duplicate-quotation") result=await duplicateQuotation(prisma,user.id,z.object({quotationId:z.string(),idempotencyKey:z.string()}).parse(payload).quotationId,z.object({quotationId:z.string(),idempotencyKey:z.string()}).parse(payload).idempotencyKey);
    else if(action==="convert-quotation") result=await convertQuotationToOrder(prisma,user.id,z.object({quotationId:z.string(),idempotencyKey:z.string()}).parse(payload).quotationId,z.object({quotationId:z.string(),idempotencyKey:z.string()}).parse(payload).idempotencyKey);
    else if(action==="create-return-request") result=await createReturnRequest(prisma,user.id,z.object({partyType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),partyId:z.string(),retailerId:z.string().optional(),sourceOrderId:z.string().optional(),skuId:z.string(),quantity:z.number().positive(),condition:z.enum(["USABLE","DAMAGED"]),reason:z.string().min(3),creditNoteRequested:z.boolean().optional(),sourcePortal:z.string(),idempotencyKey:z.string()}).parse(payload));
    else if(action==="decide-return-request") result=await decideReturnRequest(prisma,user.id,z.object({requestId:z.string()}).parse(payload).requestId,z.object({decision:z.enum(["APPROVED","REJECTED"]),reason:z.string().min(3)}).parse(payload));
    else if(action==="create-billing-draft") result=await createBillingDraft(prisma,user.id,z.object({type:z.enum(["TAX_INVOICE","NON_TAX_INVOICE","PRO_FORMA_INVOICE","DELIVERY_CHALLAN","RECEIPT","CREDIT_NOTE","DEBIT_NOTE"]),issuerType:z.enum(["DISTRIBUTOR","SUPER_STOCKIST"]),issuerId:z.string(),buyerType:z.enum(["RETAILER","DISTRIBUTOR","SUPER_STOCKIST"]),buyerId:z.string(),sourcePortal:z.string(),orderId:z.string().optional(),originalDocumentId:z.string().optional(),paymentTerms:z.string().optional(),notes:z.string().optional(),lines:z.array(commercialLineInputSchema).min(1),idempotencyKey:z.string()}).parse(payload));
    else if(action==="update-billing-draft") result=await updateBillingDraft(prisma,user.id,z.string().parse((payload as {documentId:unknown}).documentId),z.object({paymentTerms:z.string().optional(),notes:z.string().optional(),lines:z.array(commercialLineInputSchema).min(1)}).parse(payload));
    else if(action==="issue-billing-draft") result=await issueBillingDraft(prisma,user.id,z.object({documentId:z.string()}).parse(payload).documentId);
    else if (action === "create-distributor-replenishment") {
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
          lines: z.array(z.object({skuId:z.string().min(1),quantity:z.number().int().positive()})).min(1),
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
