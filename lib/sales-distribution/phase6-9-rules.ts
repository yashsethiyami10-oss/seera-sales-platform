export type GstInput = { taxableValue: number; gstRate: number; issuerStateCode: string; supplyStateCode: string };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateGst(input: GstInput) {
  if (input.taxableValue < 0 || input.gstRate < 0) throw new Error("INVALID_GST_INPUT");
  const totalTax = money(input.taxableValue * input.gstRate / 100);
  const interstate = input.issuerStateCode !== input.supplyStateCode;
  return interstate ? { cgst: 0, sgst: 0, igst: totalTax, totalTax, grandTotal: money(input.taxableValue + totalTax) } : { cgst: money(totalTax / 2), sgst: money(totalTax / 2), igst: 0, totalTax, grandTotal: money(input.taxableValue + totalTax) };
}

export function assertLegalIssuer(input: { sellerType: string; sellerId: string; issuerType: string; issuerId: string; actorId: string }) {
  if (input.sellerType !== input.issuerType || input.sellerId !== input.issuerId) throw new Error("LEGAL_ISSUER_MISMATCH");
  return { legalIssuerId: input.issuerId, createdById: input.actorId };
}

export function assertDocumentMutable(status: string) { if (status !== "DRAFT") throw new Error("ISSUED_DOCUMENT_IMMUTABLE"); }
export function assertOptionalBilling(mode: "SYSTEM" | "UPLOAD" | "PENDING" | "SUPPORTING") { return mode; }
export function documentNumber(input: { prefix: string; financialYear: string; nextNumber: bigint }) { return `${input.prefix}/${input.financialYear}/${input.nextNumber.toString().padStart(6, "0")}`; }

export function assertShareAccess(input: { now: Date; expiresAt: Date; revokedAt?: Date | null; recipientType: string; recipientId: string; actorType: string; actorId: string }) {
  if (input.revokedAt) throw new Error("SHARE_REVOKED");
  if (input.now >= input.expiresAt) throw new Error("SHARE_EXPIRED");
  if (input.recipientType !== input.actorType || input.recipientId !== input.actorId) throw new Error("SHARE_SCOPE_DENIED");
}

export function allocatePayment(input: { paymentAmount: number; alreadyAllocated: number; requested: number }) {
  if (input.requested <= 0 || input.alreadyAllocated + input.requested > input.paymentAmount) throw new Error("PAYMENT_OVER_ALLOCATION");
  return { allocated: money(input.requested), unapplied: money(input.paymentAmount - input.alreadyAllocated - input.requested) };
}

export function ageingBucket(dueDate: Date, asOf: Date) { const days = Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000); if (days <= 0) return "NOT_DUE"; if (days <= 30) return "1_30"; if (days <= 60) return "31_60"; if (days <= 90) return "61_90"; return "90_PLUS"; }
export function assertFormalExtension(input: { originalDueDate: Date; extensionUntil: Date; promisedDate?: Date; graceUntil?: Date }) { if (input.extensionUntil <= input.originalDueDate) throw new Error("INVALID_FORMAL_EXTENSION"); return { originalDueDate: input.originalDueDate, extensionUntil: input.extensionUntil, promisedDate: input.promisedDate, graceUntil: input.graceUntil }; }
export function reversalEntry(input: { originalEntryId: string; amount: number; debitPartyId: string; creditPartyId: string }) { if (input.amount <= 0) throw new Error("INVALID_REVERSAL"); return { originalEntryId: input.originalEntryId, amount: input.amount, debitPartyId: input.creditPartyId, creditPartyId: input.debitPartyId, type: "REVERSAL" as const }; }

export function calculateTa(input: { estimatedKm: number; claimedKm: number; approvedKm?: number; ratePerKm: number; toll: number; parking: number; dailyAllowance: number }) { const payableKm = input.approvedKm ?? Math.min(input.estimatedKm, input.claimedKm); if ([payableKm, input.ratePerKm, input.toll, input.parking, input.dailyAllowance].some((value) => value < 0)) throw new Error("INVALID_TA_INPUT"); return { payableKm, travelAmount: money(payableKm * input.ratePerKm), total: money(payableKm * input.ratePerKm + input.toll + input.parking + input.dailyAllowance) }; }
export function assertTaVerifier(input: { employeeId: string; managerId?: string; verifierId: string; employeeRole: string }) { if (input.verifierId === input.employeeId) throw new Error("TA_SELF_APPROVAL_DENIED"); if (input.employeeRole === "SALES_MANAGER" && input.verifierId === input.managerId) throw new Error("MANAGER_CLAIM_REQUIRES_HIGHER_APPROVER"); }
export function assertWorkingLocation(input: { workSessionActive: boolean; eventAt: Date; workStartedAt: Date; workEndedAt?: Date }) { if (!input.workSessionActive || input.eventAt < input.workStartedAt || (input.workEndedAt && input.eventAt > input.workEndedAt)) throw new Error("LOCATION_OUTSIDE_WORK_CONTEXT"); }

export type ClosureObligations = { openOrders: number; outstanding: number; advances: number; stock: number; pendingClaims: number; activeUsers: number };
export function closureDecision(obligations: ClosureObligations, forceClose: boolean, elevated: boolean) { const unresolved = Object.values(obligations).some((value) => value !== 0); if (unresolved && !forceClose) throw new Error("PARTNER_OBLIGATIONS_UNRESOLVED"); if (forceClose && !elevated) throw new Error("FORCE_CLOSE_PERMISSION_REQUIRED"); return { mayClose: true, obligationsSnapshot: { ...obligations } }; }
export function assertPartnerCanTransact(lifecycle: string) { if (lifecycle !== "ACTIVE") throw new Error("PARTNER_NOT_ACTIVE"); }
export function assertHardDeleteAllowed(input: { businessHistoryCount: number; lifecycle: string }) { if (input.businessHistoryCount > 0 || input.lifecycle !== "PROSPECT") throw new Error("PARTNER_HARD_DELETE_DENIED"); }
