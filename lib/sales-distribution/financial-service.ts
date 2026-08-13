import { createHash } from "node:crypto";
import type { FinancialEntryType, Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { ageingBucket } from "./phase6-9-rules";
import { notifyPartyUsers, requirePartyMembership } from "./scope";
import { issueSystemDocument } from "./document-service";
import { partySnapshot } from "./document-lines";
import { postJournalForCompanyAllocation } from "@/lib/finance/sales-integration-service";

const numberFor = (prefix: string, key: string) => `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 16).toUpperCase()}`;

export async function recordPayment(db: PrismaClient, actorId: string, input: { payerType: string; payerId: string; payeeType: string; payeeId: string; amountClaimed: number; reference: string; paymentMode: string; paymentDate: Date; proofId?: string; idempotencyKey: string }) { await authorize(db, { actorId, permission: "payment:review" }); if (input.amountClaimed <= 0) throw new FoundationError("INVALID_PAYMENT_AMOUNT", "Payment amount must be positive", 400); return db.$transaction(async tx=>{const duplicateReference=await tx.seeraPaymentRecord.findFirst({where:{reference:input.reference,payerId:input.payerId,payeeId:input.payeeId,paymentDate:input.paymentDate}});if(duplicateReference)throw new FoundationError("DUPLICATE_PAYMENT_REFERENCE","Duplicate UTR/payment reference",409);const payment=await tx.seeraPaymentRecord.create({data:{...input,paymentNumber:numberFor("PAY",input.idempotencyKey),unappliedAmount:0}});await recordAudit(tx,{actorId,action:"payment.recorded",entityType:"SeeraPaymentRecord",entityId:payment.id,afterState:{reference:input.reference,amount:input.amountClaimed}});return payment;}); }

export async function postLedgerEntry(db: PrismaClient, actorId: string, input: { type: FinancialEntryType; debitPartyType: string; debitPartyId: string; creditPartyType: string; creditPartyId: string; amount: number; documentId?: string; orderId?: string; claimId?: string; taClaimId?: string; reason: string; commercialSnapshot: Prisma.InputJsonValue; idempotencyKey: string; approverId?: string }) {
  await authorize(db, { actorId, permission: "ledger:post" }); if (input.amount <= 0) throw new FoundationError("INVALID_LEDGER_AMOUNT", "Ledger amount must be positive", 400);
  return db.$transaction(async (tx) => { const existing = await tx.seeraFinancialEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (existing) return existing; const entry = await tx.seeraFinancialEntry.create({ data: { ...input, actorId, entryNumber: numberFor("LE", input.idempotencyKey), status: "POSTED", postedAt: new Date() } }); await recordAudit(tx, { actorId, action: "ledger.posted", entityType: "SeeraFinancialEntry", entityId: entry.id, afterState: { type: entry.type, amount: entry.amount.toString(), debitPartyId: entry.debitPartyId, creditPartyId: entry.creditPartyId } }); return entry; });
}

export async function reverseLedgerEntry(db: PrismaClient, actorId: string, originalEntryId: string, input: { reason: string; idempotencyKey: string; approverId: string }) {
  await authorize(db, { actorId, permission: "ledger:reverse" });
  if(input.approverId!==actorId)throw new FoundationError("APPROVER_IDENTITY_MISMATCH","The signed-in approver must own the decision",403);
  return db.$transaction(async (tx) => { const original = await tx.seeraFinancialEntry.findUniqueOrThrow({ where: { id: originalEntryId } }); if(original.actorId===actorId)throw new FoundationError("LEDGER_SELF_REVERSAL_DENIED","Independent approval is required for reversal",403); if (original.status !== "POSTED") throw new FoundationError("ENTRY_NOT_REVERSIBLE", "Only posted entries may be reversed", 409); const existing = await tx.seeraFinancialEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (existing) return existing; const reversal = await tx.seeraFinancialEntry.create({ data: { entryNumber: numberFor("RV", input.idempotencyKey), type: "REVERSAL", status: "POSTED", debitPartyType: original.creditPartyType, debitPartyId: original.creditPartyId, creditPartyType: original.debitPartyType, creditPartyId: original.debitPartyId, amount: original.amount, currency: original.currency, documentId: original.documentId, orderId: original.orderId, claimId: original.claimId, taClaimId: original.taClaimId, originalEntryId: original.id, commercialSnapshot: original.commercialSnapshot as Prisma.InputJsonValue, actorId, approverId: actorId, reason: input.reason, idempotencyKey: input.idempotencyKey, postedAt: new Date() } }); await tx.seeraFinancialEntry.update({ where: { id: original.id }, data: { status: "REVERSED", reversedAt: new Date() } }); await recordAudit(tx, { actorId, action: "ledger.reversed", entityType: "SeeraFinancialEntry", entityId: original.id, afterState: { reversalId: reversal.id, reason: input.reason } }); return reversal; });
}

export async function verifyPayment(db: PrismaClient, actorId: string, paymentId: string, input: { matchedAmount: number; reason: string }) {
  await authorize(db, { actorId, permission: "payment:review" }); await authorize(db,{actorId,permission:"ledger:post"});
  return db.$transaction(async (tx) => { const payment = await tx.seeraPaymentRecord.findUniqueOrThrow({ where: { id: paymentId } }); if (input.matchedAmount < 0 || input.matchedAmount > Number(payment.amountClaimed)) throw new FoundationError("INVALID_MATCHED_AMOUNT", "Matched amount exceeds claimed payment", 400); const status = input.matchedAmount === Number(payment.amountClaimed) ? "VERIFIED" : input.matchedAmount > 0 ? "PARTIALLY_MATCHED" : "REJECTED"; const result = await tx.seeraPaymentRecord.update({ where: { id: payment.id }, data: { amountMatched: input.matchedAmount, unappliedAmount: input.matchedAmount, status, reviewerId: actorId, reviewReason: input.reason, reviewedAt: new Date() } }); if(input.matchedAmount>0)await tx.seeraFinancialEntry.upsert({where:{idempotencyKey:`${payment.idempotencyKey}:verified-ledger`},update:{},create:{entryNumber:numberFor("ADV",payment.idempotencyKey),type:"ADVANCE",status:"POSTED",debitPartyType:payment.payeeType,debitPartyId:payment.payeeId,creditPartyType:payment.payerType,creditPartyId:payment.payerId,amount:input.matchedAmount,commercialSnapshot:{paymentNumber:payment.paymentNumber,reference:payment.reference},actorId,reason:input.reason,idempotencyKey:`${payment.idempotencyKey}:verified-ledger`,postedAt:new Date()}}); await recordAudit(tx, { actorId, action: "payment.verified", entityType: "SeeraPaymentRecord", entityId: payment.id, afterState: { matchedAmount: input.matchedAmount, status } }); return result; });
}

export async function allocateVerifiedPayment(db: PrismaClient, actorId: string, paymentId: string, allocations: { documentId: string; amount: number; idempotencyKey: string; reason: string }[]) {
  await authorize(db, { actorId, permission: "payment:allocate" });
  return db.$transaction(async (tx) => { const payment = await tx.seeraPaymentRecord.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: { where: { status: "ACTIVE" } } } }); if (!(["VERIFIED", "PARTIALLY_MATCHED", "ADVANCE_HELD"] as string[]).includes(payment.status)) throw new FoundationError("PAYMENT_NOT_VERIFIED", "Payment must be verified before allocation", 409); const requested = allocations.reduce((sum, item) => sum + item.amount, 0); if (allocations.some((item) => item.amount <= 0) || requested > Number(payment.unappliedAmount)) throw new FoundationError("PAYMENT_OVER_ALLOCATION", "Allocation exceeds unapplied payment", 409); const duplicate = await tx.seeraPaymentAllocation.findFirst({ where: { idempotencyKey: { in: allocations.map((item) => item.idempotencyKey) } } }); if (duplicate) throw new FoundationError("DUPLICATE_ALLOCATION", "Allocation already exists", 409); const documents = await tx.seeraCommercialDocument.findMany({ where: { id: { in: allocations.map((item) => item.documentId) }, buyerId: payment.payerId, issuerId: payment.payeeId, status: "ISSUED" }, select: { id: true } }); if (documents.length !== new Set(allocations.map((item) => item.documentId)).size) throw new FoundationError("ALLOCATION_SCOPE_DENIED", "Invoice scope mismatch", 403); const created = []; for (const item of allocations) { const allocation = await tx.seeraPaymentAllocation.create({ data: { paymentId, ...item, actorId } }); await postJournalForCompanyAllocation(tx, actorId, { id: allocation.id, documentId: item.documentId, amount: item.amount, idempotencyKey: item.idempotencyKey }); created.push(allocation); } await tx.seeraPaymentRecord.update({ where: { id: paymentId }, data: { unappliedAmount: { decrement: requested } } }); await recordAudit(tx, { actorId, action: "payment.allocated", entityType: "SeeraPaymentRecord", entityId: paymentId, afterState: { requested, documents: allocations.map((item) => item.documentId) } }); return created; });
}

// GENERATE RECEIPT — Stage 1 contextual quick action, S.S. issuing a receipt to a Distributor for a
// payment ALREADY verified/posted by Accounts (verifyPayment above). Deliberately reuses the
// existing RECEIPT/PAYMENT_RECEIPT document infrastructure (issueSystemDocument) rather than a
// parallel engine: same governed numbering (issuer-scoped, financial-year-aware), same immutability
// (idempotencyKey-unique, no edit path once ISSUED), same PDF/share pipeline every other document
// type already uses. Every auto-filled field (amount, date, mode, UTR/reference, linked payment
// number) comes straight from the SeeraPaymentRecord the S.S. did not have to re-type. A receipt for
// an unverified/unposted payment is refused — S.S. cannot manufacture proof of a payment Accounts
// hasn't confirmed.
export async function generateDistributorPaymentReceipt(
  db: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: { paymentId: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "document:issue" });
  await requirePartyMembership(db, actorId, superStockistId, "SUPER_STOCKIST");
  const payment = await db.seeraPaymentRecord.findUniqueOrThrow({ where: { id: input.paymentId } });
  if (payment.payeeType !== "SUPER_STOCKIST" || payment.payeeId !== superStockistId || payment.payerType !== "DISTRIBUTOR")
    throw new FoundationError("PAYMENT_SCOPE_DENIED", "Payment is outside this Super Stockist's scope", 403);
  if (!(["VERIFIED", "PARTIALLY_MATCHED"] as string[]).includes(payment.status))
    throw new FoundationError("PAYMENT_NOT_VERIFIED", "A receipt can only be generated for a payment Accounts has already verified/posted", 409);
  const now = new Date();
  const profile = await db.seeraBillingProfile.findFirst({
    where: { ownerType: "SUPER_STOCKIST", ownerId: superStockistId, authorizedBilling: true, verificationStatus: "VERIFIED", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!profile) throw new FoundationError("VERIFIED_BILLING_PROFILE_REQUIRED", "A verified S.S. billing profile is required to issue a receipt", 409);
  const buyerSnapshot = await partySnapshot(db, "DISTRIBUTOR", payment.payerId);
  const amount = Number(payment.amountMatched);
  return issueSystemDocument(db, actorId, {
    type: "PAYMENT_RECEIPT",
    issuerType: "SUPER_STOCKIST",
    issuerId: superStockistId,
    buyerType: "DISTRIBUTOR",
    buyerId: payment.payerId,
    sourcePortal: "super-stockist",
    issuerSnapshot: { legalName: profile.legalName, tradeName: profile.tradeName ?? undefined, gstin: profile.gstin ?? undefined, address: JSON.stringify(profile.registeredAddress), state: profile.state, stateCode: profile.stateCode },
    buyerSnapshot,
    supplySnapshot: { paymentNumber: payment.paymentNumber, reference: payment.reference, paymentMode: payment.paymentMode, paymentDate: payment.paymentDate.toISOString() },
    lines: [{ description: `Payment received — ${payment.paymentMode} — Ref ${payment.reference}`, quantity: 1, unit: "PAYMENT", rate: amount, taxableValue: amount, total: amount }],
    subtotal: amount,
    taxableTotal: amount,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    grandTotal: amount,
    notes: `Auto-generated from verified payment ${payment.paymentNumber}`,
    idempotencyKey: input.idempotencyKey,
  });
}

// Stage 5 fix: Distributor/S.S./Manager all have a real, actionable dashboard summary function
// (distributorDashboardSummary / superStockistDashboardSummary / managerDashboardSummary) — Accounts
// had only a UI label ("accountsDashboard" in localization.ts), no actual aggregation. This is the
// missing one, same shape/spirit: real counts from canonical tables, each pointing at where to act.
export async function accountsDashboardSummary(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "finance_dashboard:view" });
  const [companyProofsPending, partnerPaymentsPending, reconciliationExceptions, recentReversals, openClaimsUnsettled, allOutstandingDocs, creditExtensionsPending] = await Promise.all([
    db.seeraPaymentProof.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.seeraPaymentRecord.count({ where: { status: "SUBMITTED" } }),
    db.seeraFinancialReconciliation.count({ where: { status: "EXCEPTION" } }),
    db.seeraFinancialEntry.count({ where: { type: "REVERSAL", postedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    db.seeraClaim.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.seeraCommercialDocument.findMany({
      where: { status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] } },
      select: { buyerType: true, buyerId: true, grandTotal: true },
    }),
    // Final UI reachability audit fix: a pending SeeraCreditExtension request was only ever visible
    // by manually navigating to "Credit exceptions" — never flagged on the dashboard itself.
    db.seeraCreditExtension.count({ where: { status: "PENDING" } }),
  ]);
  const now = new Date();
  const distinctParties = new Map<string, string>();
  for (const doc of allOutstandingDocs) distinctParties.set(`${doc.buyerType}:${doc.buyerId}`, doc.buyerType);
  const outstandingByParty = await Promise.all(
    [...distinctParties.entries()].map(async ([key, partyType]) => {
      const partyId = key.split(":").slice(1).join(":");
      const { outstandingTotal, outstanding } = await partyOutstanding(db, partyType, partyId, now);
      const overdue = outstanding.filter((o) => o.actualOverdue).reduce((s, o) => s + o.amount, 0);
      return { outstandingTotal, overdue };
    }),
  );
  const totalReceivables = outstandingByParty.reduce((s, p) => s + p.outstandingTotal, 0);
  const totalOverdue = outstandingByParty.reduce((s, p) => s + p.overdue, 0);
  const attention: { code: string; title: string; deepLink: string }[] = [];
  if (companyProofsPending) attention.push({ code: "COMPANY_PROOF_PENDING", title: `${companyProofsPending} Company advance proof(s) awaiting verification`, deepLink: "payment-inbox" });
  if (partnerPaymentsPending) attention.push({ code: "PARTNER_PAYMENT_PENDING", title: `${partnerPaymentsPending} Distributor/S.S. payment(s) awaiting verification`, deepLink: "payments" });
  if (reconciliationExceptions) attention.push({ code: "RECONCILIATION_EXCEPTION", title: `${reconciliationExceptions} reconciliation exception(s)`, deepLink: "reconciliation" });
  if (openClaimsUnsettled) attention.push({ code: "CLAIMS_OPEN", title: `${openClaimsUnsettled} claim(s) awaiting settlement`, deepLink: "claims" });
  if (creditExtensionsPending) attention.push({ code: "CREDIT_EXTENSION_PENDING", title: `${creditExtensionsPending} credit extension request(s) awaiting decision`, deepLink: "credit-exceptions" });
  if (totalOverdue > 0) attention.push({ code: "OVERDUE", title: `₹${totalOverdue.toLocaleString("en-IN")} overdue across the network`, deepLink: "ageing" });
  return {
    cards: {
      companyProofsPending,
      partnerPaymentsPending,
      reconciliationExceptions,
      recentReversals30d: recentReversals,
      openClaimsUnsettled,
      creditExtensionsPending,
      totalReceivables,
      totalOverdue,
    },
    attention,
  };
}

export async function partyOutstanding(db: PrismaClient, partyType: string, partyId: string, asOf: Date) {
  const documents = await db.seeraCommercialDocument.findMany({ where: { buyerType: partyType, buyerId: partyId, status: "ISSUED", type: { in: ["TAX_INVOICE", "NON_TAX_INVOICE", "DEBIT_NOTE"] } } }); const documentIds=documents.map(d=>d.id); const orderIds=documents.flatMap(d=>d.orderId?[d.orderId]:[]);
  const [allocations,notes,orders,promises,extensions,unapplied]=await Promise.all([db.seeraPaymentAllocation.findMany({where:{documentId:{in:documentIds},status:"ACTIVE"}}),db.seeraCommercialDocument.findMany({where:{originalDocumentId:{in:documentIds},status:"ISSUED",type:{in:["CREDIT_NOTE","DEBIT_NOTE"]}}}),db.seeraSalesOrder.findMany({where:{id:{in:orderIds}}}),db.seeraPaymentPromise.findMany({where:{orderId:{in:orderIds}},orderBy:{createdAt:"desc"}}),db.seeraCreditExtension.findMany({where:{orderId:{in:orderIds},status:"APPROVED"},orderBy:{approvedAt:"desc"}}),db.seeraPaymentRecord.aggregate({where:{payerType:partyType,payerId:partyId},_sum:{unappliedAmount:true}})]);
  const allocated=new Map<string,number>();allocations.forEach(a=>allocated.set(a.documentId,(allocated.get(a.documentId)??0)+Number(a.amount)));const noteEffect=new Map<string,number>();notes.forEach(note=>{if(note.originalDocumentId)noteEffect.set(note.originalDocumentId,(noteEffect.get(note.originalDocumentId)??0)+(note.type==="CREDIT_NOTE"?-Number(note.grandTotal):Number(note.grandTotal)));});
  const outstanding=documents.map(document=>{const order=orders.find(o=>o.id===document.orderId);const terms=document.paymentTermsSnapshot as {originalDueDate?:string}|null;const originalDueDate=order?.originalDueDate??(terms?.originalDueDate?new Date(terms.originalDueDate):document.issueDate??document.createdAt);const promise=promises.find(p=>p.orderId===document.orderId);const extension=extensions.find(e=>e.orderId===document.orderId);const amount=Math.max(0,Number(document.grandTotal)+(noteEffect.get(document.id)??0)-(allocated.get(document.id)??0));return{documentId:document.id,documentNumber:document.documentNumber,orderId:document.orderId,originalDueDate,graceUntil:order?.graceUntil??null,promisedPaymentDate:promise?.promisedPaymentDate??null,formalExtensionUntil:extension?.extensionUntil??null,actualOverdue:asOf>originalDueDate,amount,ageingBucket:ageingBucket(originalDueDate,asOf)};}).filter(item=>item.amount>0);
  return { outstanding, outstandingTotal: outstanding.reduce((s,i)=>s+i.amount,0), advancesAndUnapplied:Number(unapplied._sum.unappliedAmount??0), allocations };
}

export async function ledgerReadModel(db: PrismaClient, actorId: string, input: { partyType: string; partyId: string; asOf?: Date }) {
  await authorize(db, { actorId, permission: "ledger:view" }); const asOf = input.asOf ?? new Date();
  const entries = await db.seeraFinancialEntry.findMany({ where: { status: "POSTED", OR: [{ debitPartyType: input.partyType, debitPartyId: input.partyId }, { creditPartyType: input.partyType, creditPartyId: input.partyId }] }, orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }] });
  const debit = entries.filter((e) => e.debitPartyId === input.partyId && e.debitPartyType === input.partyType).reduce((s, e) => s + Number(e.amount), 0); const credit = entries.filter((e) => e.creditPartyId === input.partyId && e.creditPartyType === input.partyType).reduce((s, e) => s + Number(e.amount), 0);
  const { outstanding, outstandingTotal, advancesAndUnapplied, allocations } = await partyOutstanding(db, input.partyType, input.partyId, asOf);
  return { balance: debit-credit, debit, credit, outstandingTotal, outstanding, advancesAndUnapplied, allocations, transactions:entries };
}

export async function reconcilePayment(db: PrismaClient, actorId: string, input: { paymentId: string; idempotencyKey: string }) { await authorize(db, { actorId, permission: "reconciliation:manage" }); return db.$transaction(async (tx) => { const payment = await tx.seeraPaymentRecord.findUniqueOrThrow({ where: { id: input.paymentId }, include: { allocations: { where: { status: "ACTIVE" } } } }); const allocated = payment.allocations.reduce((s, a) => s + Number(a.amount), 0); const matched = Number(payment.amountMatched); const difference = matched - allocated - Number(payment.unappliedAmount); const status = difference === 0 ? (allocated === matched ? "MATCHED" : "PARTIALLY_MATCHED") : "EXCEPTION"; const result = await tx.seeraFinancialReconciliation.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: { referenceType: "PAYMENT", referenceId: payment.id, expectedAmount: matched, matchedAmount: allocated, difference, exceptionReason: difference === 0 ? undefined : "PAYMENT_LEDGER_DIFFERENCE", actorId, status, idempotencyKey: input.idempotencyKey } }); await recordAudit(tx, { actorId, action: "finance.reconciled", entityType: "SeeraFinancialReconciliation", entityId: result.id, afterState: { status, difference } }); return result; }); }

export async function settleClaim(db: PrismaClient, actorId: string, input: { claimId: string; outcome: "CREDIT_NOTE" | "DEBIT_NOTE" | "REPLACEMENT" | "NO_FINANCIAL_EFFECT"; approvedAmount: number; rejectedAmount: number; reason: string; approverId: string; documentId?: string; financialEntryId?: string }) { await authorize(db, { actorId, permission: "claim_settlement:manage" }); if(input.approverId!==actorId)throw new FoundationError("APPROVER_IDENTITY_MISMATCH","The signed-in approver must own the decision",403);if (input.approvedAmount < 0 || input.rejectedAmount < 0) throw new FoundationError("INVALID_CLAIM_SETTLEMENT", "Invalid claim settlement", 400); return db.$transaction(async (tx) => { const claim=await tx.seeraClaim.findUniqueOrThrow({where:{id:input.claimId}});if(claim.actorId===actorId)throw new FoundationError("CLAIM_SELF_SETTLEMENT_DENIED","Independent claim settlement is required",403);const settlement = await tx.seeraClaimSettlement.create({ data: { ...input,approverId:actorId, actorId, status: "APPROVED" } });const resolvedStatus=input.approvedAmount>0||input.outcome!=="NO_FINANCIAL_EFFECT"?"RESOLVED":"REJECTED";await tx.seeraClaim.update({where:{id:input.claimId},data:{status:resolvedStatus}});await recordAudit(tx, { actorId, action: "claim.settled", entityType: "SeeraClaimSettlement", entityId: settlement.id, afterState: { outcome: input.outcome, approvedAmount: input.approvedAmount, claimStatus: resolvedStatus } }); await notifyPartyUsers(tx, claim.claimantId, { title: resolvedStatus === "RESOLVED" ? "Claim resolved" : "Claim rejected", body: `Claim ${claim.claimNumber} has been ${resolvedStatus.toLowerCase()} (${input.outcome.replaceAll("_", " ").toLowerCase()}).`, entityType: "SeeraClaim", entityId: claim.id, actionPath: claim.claimantType === "DISTRIBUTOR" ? "/portal/distributor/claims" : "/portal/super-stockist/claims" }); return settlement; }); }
