import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";

export async function createJourneyPlan(prisma: PrismaClient, actorId: string, input: { employeeId: string; dayOfWeek: number; geographyType: string; geographyId: string; effectiveFrom: Date; effectiveTo?: Date; deviationReason?: string }) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new FoundationError("INVALID_DAY_OF_WEEK", "Invalid journey-plan day", 400);
  return prisma.seeraJourneyPlan.create({ data: { ...input, ownerId: actorId } });
}

export async function assignTarget(prisma: PrismaClient, actorId: string, input: { employeeId: string; periodType: "DAILY" | "WEEKLY" | "MONTHLY"; periodStart: Date; periodEnd: Date; metricType: string; skuId?: string; targetValue: number }) {
  await authorize(prisma, { actorId, permission: "network:manage" });
  if (input.periodEnd <= input.periodStart || input.targetValue < 0) throw new FoundationError("INVALID_TARGET", "Invalid target period or value", 400);
  return prisma.seeraTarget.create({ data: { ...input, achievementBasis: "DELIVERED", assignedById: actorId } });
}

export async function recordCollection(prisma: PrismaClient, actorId: string, input: { retailerId: string; amount: number; paymentMode: string; reference?: string; proofFileId?: string; invoiceRef?: string; remarks?: string; idempotencyKey: string }) {
  await authorize(prisma, { actorId, permission: "collection:create" });
  const retailer = await prisma.seeraRetailer.findFirst({ where: { id: input.retailerId, salespersonId: actorId, lifecycle: "ACTIVE" } });
  if (!retailer) throw new FoundationError("RETAILER_SCOPE_DENIED", "Retailer scope denied", 403);
  if (input.amount <= 0) throw new FoundationError("INVALID_COLLECTION", "Collection amount must be positive", 400);
  return prisma.seeraCollectionEntry.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { ...input, actorId, sourcePortal: "sales-executive" } });
}

export async function captureMarketIntelligence(prisma: PrismaClient, actorId: string, input: { retailerId?: string; geographyId?: string; competitor: string; product?: string; price?: number; scheme?: string; retailerFeedback?: string; newLaunch?: string; shelfDisplay?: string; marketIssue?: string; workSessionId?: string }) {
  await authorize(prisma, { actorId, permission: "retailer:visit" });
  if (input.workSessionId) {
    const active = await prisma.seeraWorkSession.findFirst({ where: { id: input.workSessionId, employeeId: actorId, status: "ACTIVE" } });
    if (!active) throw new FoundationError("ACTIVE_WORKDAY_REQUIRED", "Active workday required", 409);
  }
  return prisma.seeraMarketIntelligence.create({ data: { ...input, actorId } });
}

export async function submitPaymentProof(prisma: PrismaClient, actorId: string, superStockistId: string, input: { orderId: string; amount: number; reference: string; fileId?: string; idempotencyKey: string }) {
  await authorize(prisma, { actorId, permission: "payment_proof:create" });
  await requirePartyMembership(prisma, actorId, superStockistId, "SUPER_STOCKIST");
  const order = await prisma.seeraSalesOrder.findFirst({ where: { id: input.orderId, buyerPartnerId: superStockistId, type: "COMPANY_REPLENISHMENT" } });
  if (!order) throw new FoundationError("ORDER_SCOPE_DENIED", "Company order scope denied", 403);
  return prisma.seeraPaymentProof.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { orderId: order.id, amount: input.amount, reference: input.reference, fileId: input.fileId, status: "SUBMITTED", submittedById: actorId, idempotencyKey: input.idempotencyKey } });
}

export async function reviewPaymentProof(prisma: PrismaClient, actorId: string, input: { proofId: string; status: "UNDER_REVIEW" | "MATCHED" | "PARTIALLY_MATCHED" | "REJECTED" | "ADVANCE_HELD" | "VERIFIED"; reason: string }) {
  await authorize(prisma, { actorId, permission: "payment_proof:review" });
  return prisma.seeraPaymentProof.update({ where: { id: input.proofId }, data: { status: input.status, reviewReason: input.reason, reviewedById: actorId, reviewedAt: new Date() } });
}
