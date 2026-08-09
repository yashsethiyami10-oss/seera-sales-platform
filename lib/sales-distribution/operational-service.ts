import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";
import { requirePartyMembership } from "./scope";
import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/foundation/audit-service";
const businessNumber=(prefix:string,key:string)=>`${prefix}-${createHash("sha256").update(key).digest("hex").slice(0,16).toUpperCase()}`;

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
  return prisma.$transaction(async (tx) => {
    const proof = await tx.seeraPaymentProof.findUniqueOrThrow({ where: { id: input.proofId }, include: { order: true } });
    if (proof.submittedById === actorId) throw new FoundationError("PAYMENT_PROOF_SELF_REVIEW_DENIED", "Payment proof requires an independent reviewer", 403);
    if (input.status === "VERIFIED" && Number(proof.amount) < Number(proof.order.total)) throw new FoundationError("ADVANCE_PAYMENT_INSUFFICIENT", "Verified advance must cover the company order total", 409);
    const reviewed = await tx.seeraPaymentProof.update({ where: { id: proof.id }, data: { status: input.status, reviewReason: input.reason, reviewedById: actorId, reviewedAt: new Date() } });
    if (input.status === "VERIFIED") await tx.seeraSalesOrder.update({ where: { id: proof.orderId }, data: { status: "CONFIRMED", financialAcceptance: true } });
    return reviewed;
  });
}

export async function submitPartnerPayment(prisma:PrismaClient,actorId:string,input:{partnerType:"DISTRIBUTOR"|"SUPER_STOCKIST";partnerId:string;amount:number;reference:string;paymentMode:string;paymentDate:Date;proofId?:string;idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:"payment_proof:create"});
  await requirePartyMembership(prisma,actorId,input.partnerId,input.partnerType);
  if(input.amount<=0)throw new FoundationError("INVALID_PAYMENT_AMOUNT","Payment amount must be positive",400);
  const partner=await prisma.seeraPartner.findUniqueOrThrow({where:{id:input.partnerId}}),payeeId=input.partnerType==="DISTRIBUTOR"?partner.assignedSuperStockistId:"SEERA_COMPANY";
  if(!payeeId)throw new FoundationError("PAYEE_ASSIGNMENT_REQUIRED","Assigned Super Stockist is required",409);
  return prisma.$transaction(async(tx)=>{const duplicate=await tx.seeraPaymentRecord.findFirst({where:{reference:input.reference,payerId:input.partnerId,payeeId,paymentDate:input.paymentDate}});if(duplicate)throw new FoundationError("DUPLICATE_PAYMENT_REFERENCE","Duplicate UTR/payment reference",409);const payment=await tx.seeraPaymentRecord.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{paymentNumber:businessNumber("PAY",input.idempotencyKey),payerType:input.partnerType,payerId:input.partnerId,payeeType:input.partnerType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY",payeeId,amountClaimed:input.amount,unappliedAmount:0,reference:input.reference,paymentMode:input.paymentMode,paymentDate:input.paymentDate,proofId:input.proofId,status:"SUBMITTED",idempotencyKey:input.idempotencyKey}});await recordAudit(tx,{actorId,action:"payment.proof_submitted",entityType:"SeeraPaymentRecord",entityId:payment.id,afterState:{paymentNumber:payment.paymentNumber,payerType:payment.payerType,payerId:payment.payerId}});return payment;});
}

export async function submitPartnerClaim(prisma:PrismaClient,actorId:string,input:{partnerType:"DISTRIBUTOR"|"SUPER_STOCKIST";partnerId:string;type:string;sourceType?:string;sourceId?:string;details:Record<string,unknown>;idempotencyKey:string}){
  await authorize(prisma,{actorId,permission:"distributor_claims:manage"});
  await requirePartyMembership(prisma,actorId,input.partnerId,input.partnerType);
  const partner=await prisma.seeraPartner.findUniqueOrThrow({where:{id:input.partnerId}}),againstPartyId=input.partnerType==="DISTRIBUTOR"?partner.assignedSuperStockistId:"SEERA_COMPANY";
  if(!againstPartyId)throw new FoundationError("CLAIM_COUNTERPARTY_REQUIRED","Claim counterparty is not assigned",409);
  const claim=await prisma.seeraClaim.upsert({where:{idempotencyKey:input.idempotencyKey},update:{},create:{claimNumber:businessNumber("CLM",input.idempotencyKey),claimantType:input.partnerType,claimantId:input.partnerId,againstPartyType:input.partnerType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY",againstPartyId,type:input.type,sourceType:input.sourceType,sourceId:input.sourceId,details:input.details as Prisma.InputJsonValue,actorId,idempotencyKey:input.idempotencyKey}});
  await recordAudit(prisma,{actorId,action:"claim.submitted",entityType:"SeeraClaim",entityId:claim.id,afterState:{claimNumber:claim.claimNumber,type:claim.type}});return claim;
}
