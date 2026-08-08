export type DeliveredLine = { ordered: number; cancelled?: number; delivered: number; refused?: number; approvedReturn?: number; unitValue: number };

export function eligibleDelivered(line: DeliveredLine) {
  const eligible = Math.max(0, Math.min(line.delivered, line.ordered - (line.cancelled ?? 0)) - (line.refused ?? 0) - (line.approvedReturn ?? 0));
  return { quantity: eligible, value: roundMoney(eligible * line.unitValue) };
}

export function deliveredPerformance(lines: DeliveredLine[]) {
  return lines.reduce((total, line) => { const eligible = eligibleDelivered(line); return { quantity: total.quantity + eligible.quantity, value: roundMoney(total.value + eligible.value) }; }, { quantity: 0, value: 0 });
}

export type CreditPosition = { creditEnabled: boolean; creditLimit: number; outstanding: number; orderValue: number; warningThreshold?: number | null; blockThreshold?: number | null; originalDueDate?: Date | null; graceUntil?: Date | null; promisedPaymentDate?: Date | null; now: Date; approvedOverride?: boolean };
export type CreditDecision = "ALLOW" | "WARNING" | "HOLD" | "BLOCK" | "OVERRIDE_REQUIRED";

export function evaluateDistributorCredit(position: CreditPosition): { decision: CreditDecision; availableCredit: number; contractOverdue: boolean; inGrace: boolean; promisePending: boolean } {
  const availableCredit = roundMoney(position.creditLimit - position.outstanding);
  const contractOverdue = Boolean(position.originalDueDate && position.now > position.originalDueDate);
  const inGrace = contractOverdue && Boolean(position.graceUntil && position.now <= position.graceUntil);
  const promisePending = contractOverdue && Boolean(position.promisedPaymentDate && position.now <= position.promisedPaymentDate);
  if (position.approvedOverride) return { decision: "ALLOW", availableCredit, contractOverdue, inGrace, promisePending };
  if (!position.creditEnabled) return { decision: "BLOCK", availableCredit: 0, contractOverdue, inGrace, promisePending };
  const exposure = roundMoney(position.outstanding + position.orderValue);
  if (position.blockThreshold != null && exposure >= position.blockThreshold) return { decision: "BLOCK", availableCredit, contractOverdue, inGrace, promisePending };
  if (exposure > position.creditLimit) return { decision: "OVERRIDE_REQUIRED", availableCredit, contractOverdue, inGrace, promisePending };
  if (contractOverdue && !inGrace && !promisePending) return { decision: "HOLD", availableCredit, contractOverdue, inGrace, promisePending };
  if (position.warningThreshold != null && exposure >= position.warningThreshold) return { decision: "WARNING", availableCredit, contractOverdue, inGrace, promisePending };
  return { decision: "ALLOW", availableCredit, contractOverdue, inGrace, promisePending };
}

export function assertAdvanceOnlyCompanyOrder(input: { type: string; creditDays?: number | null; paymentProofStatus?: string | null }) {
  if (input.type !== "COMPANY_REPLENISHMENT") return;
  if ((input.creditDays ?? 0) !== 0) throw new Error("COMPANY_TO_SS_CREDIT_PROHIBITED");
  if (input.paymentProofStatus !== "VERIFIED") throw new Error("ADVANCE_PAYMENT_NOT_VERIFIED");
}

export type InventoryMovement = { direction: "IN" | "OUT" | "RESERVE" | "RELEASE"; quantity: number };
export function inventoryPosition(movements: InventoryMovement[]) {
  return movements.reduce((balance, movement) => {
    if (movement.quantity <= 0) throw new Error("INVALID_MOVEMENT_QUANTITY");
    if (movement.direction === "IN") balance.onHand += movement.quantity;
    if (movement.direction === "OUT") balance.onHand -= movement.quantity;
    if (movement.direction === "RESERVE") balance.reserved += movement.quantity;
    if (movement.direction === "RELEASE") balance.reserved -= movement.quantity;
    if (balance.onHand < 0 || balance.reserved < 0 || balance.reserved > balance.onHand) throw new Error("INVALID_INVENTORY_POSITION");
    return balance;
  }, { onHand: 0, reserved: 0 });
}

export function reconciliationVariance(systemClosing: number, physicalClosing: number) { return roundQuantity(physicalClosing - systemClosing); }
export function reminderDates(dueDate: Date, offsets: number[]) { return offsets.map((offsetDays) => ({ offsetDays, scheduledAt: new Date(dueDate.getTime() + offsetDays * 86_400_000) })); }

export function assertPromisePreservesContract(input: { originalDueDate: Date; promisedPaymentDate: Date; storedOriginalDueDate: Date }) {
  if (input.originalDueDate.getTime() !== input.storedOriginalDueDate.getTime()) throw new Error("ORIGINAL_DUE_DATE_MUTATION");
  if (input.promisedPaymentDate < input.originalDueDate) throw new Error("PROMISE_BEFORE_CONTRACT_DUE");
}

export function assertAssistedAction(input: { actorId: string; commercialPartyId: string; sourcePortal: string; onBehalfOfPartyId?: string | null; reason?: string | null; financialAcceptance: boolean }) {
  if (!input.onBehalfOfPartyId || input.onBehalfOfPartyId !== input.commercialPartyId || !input.reason) throw new Error("ASSISTED_ACTION_ATTRIBUTION_REQUIRED");
  if (input.actorId === input.commercialPartyId) throw new Error("ACTOR_PARTY_CONFLATION");
  if (input.sourcePortal !== "sales-manager") throw new Error("INVALID_ASSISTED_SOURCE_PORTAL");
  if (input.financialAcceptance) throw new Error("ASSISTED_ACTION_CANNOT_ACCEPT_FINANCIALLY");
}

export function assertJointWorkAttribution(input: { visitId: string; orderId?: string; primarySalesExecutiveId: string; participants: string[] }) {
  if (!input.participants.includes(input.primarySalesExecutiveId)) throw new Error("PRIMARY_EXECUTIVE_NOT_PARTICIPANT");
  return { visitCreditKey: input.visitId, orderCreditKey: input.orderId ?? null, creditedEmployeeId: input.primarySalesExecutiveId };
}

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function roundQuantity(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
