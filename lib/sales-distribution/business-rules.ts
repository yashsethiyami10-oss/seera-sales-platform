export type DeliveredLine = { ordered: number; cancelled?: number; delivered: number; refused?: number; approvedReturn?: number; unitValue: number };

export function eligibleDelivered(line: DeliveredLine) {
  const eligible = Math.max(0, Math.min(line.delivered, line.ordered - (line.cancelled ?? 0)) - (line.refused ?? 0) - (line.approvedReturn ?? 0));
  return { quantity: eligible, value: roundMoney(eligible * line.unitValue) };
}

export function deliveredPerformance(lines: DeliveredLine[]) {
  return lines.reduce((total, line) => { const eligible = eligibleDelivered(line); return { quantity: total.quantity + eligible.quantity, value: roundMoney(total.value + eligible.value) }; }, { quantity: 0, value: 0 });
}

export type AttributedOrder = { id: string; salespersonId: string | null; sourcePortal: string; bookedValue: number; eligibleDeliveredValue: number };

// Team Sales and Manager Own Sales are computed from two DISJOINT order subsets — an Executive's
// order is sourcePortal:"sales-executive" (including anything booked during Joint Working, which
// stays credited to the Executive per assertJointWorkAttribution below), a Manager's own order is
// sourcePortal:"sales-manager" AND salespersonId===managerId. The same order can never satisfy both
// filters, so this throws rather than silently double-counting if that invariant is ever violated —
// Territory Sales is a straight sum of two totals that are guaranteed non-overlapping, not a
// re-aggregation that could accidentally count a joint-work order twice.
export function salesAttribution(orders: AttributedOrder[], managerId: string, teamEmployeeIds: string[]) {
  const teamOrders = orders.filter((o) => o.salespersonId != null && teamEmployeeIds.includes(o.salespersonId) && o.sourcePortal === "sales-executive");
  const ownOrders = orders.filter((o) => o.salespersonId === managerId && o.sourcePortal === "sales-manager");
  const teamIds = new Set(teamOrders.map((o) => o.id));
  if (ownOrders.some((o) => teamIds.has(o.id))) throw new Error("DOUBLE_COUNTED_ORDER");
  const sum = (list: AttributedOrder[]) =>
    list.reduce((acc, o) => ({ bookedValue: roundMoney(acc.bookedValue + o.bookedValue), eligibleDeliveredValue: roundMoney(acc.eligibleDeliveredValue + o.eligibleDeliveredValue) }), { bookedValue: 0, eligibleDeliveredValue: 0 });
  const team = sum(teamOrders);
  const own = sum(ownOrders);
  return {
    team: { ...team, orderCount: teamOrders.length },
    managerOwn: { ...own, orderCount: ownOrders.length },
    territory: {
      bookedValue: roundMoney(team.bookedValue + own.bookedValue),
      eligibleDeliveredValue: roundMoney(team.eligibleDeliveredValue + own.eligibleDeliveredValue),
      orderCount: teamOrders.length + ownOrders.length,
    },
  };
}

// Exposure is order-value based (not invoice-based) because billing/invoicing is not yet live for
// every order type; postedDebits/postedCredits come from the POSTED SeeraFinancialEntry ledger, so a
// reversal (which posts an offsetting entry and flips the original to REVERSED) is naturally excluded
// once callers sum only status:"POSTED" entries — no separate reversal handling is needed here.
export function netCreditExposure(input: { orderExposureTotal: number; postedDebits: number; postedCredits: number }) {
  return roundMoney(Math.max(0, input.orderExposureTotal + input.postedDebits - input.postedCredits));
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

// Founder UAT fix: a SUBMITTED Company order showed only the raw enum "SUBMITTED" on the
// Founder/Admin order detail page with no explanation of what happens next — mirrors the same
// three/four-state derivation CompanyOrderWizard's own statusOf() already uses on the S.S. (buyer)
// side, just exposed for the Founder's read-only order-detail view too. Company→S.S. is
// advance-only (assertAdvanceOnlyCompanyOrder above) — there is deliberately no separate "Accept
// Order" state to invent; CONFIRMED already means "payment verified, ready to dispatch".
export function companyOrderNextStep(order: { status: string }, latestProofStatus?: string | null): string {
  if (order.status === "DISPATCHED") return "DISPATCHED — AWAITING S.S. RECEIPT";
  if (order.status === "CONFIRMED") return "PAYMENT VERIFIED — READY FOR DISPATCH";
  if (latestProofStatus === "SUBMITTED" || latestProofStatus === "UNDER_REVIEW") return "AWAITING ACCOUNTS VERIFICATION";
  if (order.status === "SUBMITTED") return "AWAITING ADVANCE PAYMENT PROOF";
  return order.status;
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

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}
export function routeDistanceKm(points: { lat: number; lng: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], next = points[i];
    if (prev && next) total += haversineKm(prev, next);
  }
  return roundQuantity(total);
}

// GPS-derived field distance: sums only plausible consecutive segments so eligible distance is
// never inflated by a single GPS jump (a satellite glitch, a cell-tower-only fix, or a segment
// that would imply an impossible speed for a field rep on ground transport). A segment is
// excluded from the distance total — not deleted from the record — when either endpoint's
// reported accuracy is too coarse to trust, or the implied average speed between two consecutive
// timestamped samples exceeds a generous road-travel ceiling. This is intentionally NOT a
// straight line between the first and last point (see routeDistanceKm above) — every accepted
// consecutive pair is summed, so genuine route wandering still counts.
const MAX_PLAUSIBLE_SPEED_KMH = 100;
const MAX_TRUSTED_ACCURACY_METERS = 150;
const DUPLICATE_POINT_METERS = 5;

export type TimedGpsPoint = {
  lat: number;
  lng: number;
  capturedAt: Date;
  accuracy?: number | null;
};

export function eligibleGpsDistanceKm(points: TimedGpsPoint[]) {
  const sorted = [...points].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  let total = 0;
  const warnings: string[] = [];
  const excludedByReason: Record<string, number> = {};
  const exclude = (reason: string) => {
    warnings.push(reason);
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  };
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], next = sorted[i];
    if (!prev || !next) continue;
    if (![prev.lat, prev.lng, next.lat, next.lng].every(Number.isFinite) ||
      Math.abs(prev.lat) > 90 || Math.abs(next.lat) > 90 ||
      Math.abs(prev.lng) > 180 || Math.abs(next.lng) > 180) {
      exclude("INVALID_COORDINATE");
      continue;
    }
    if (
      (prev.accuracy != null && prev.accuracy > MAX_TRUSTED_ACCURACY_METERS) ||
      (next.accuracy != null && next.accuracy > MAX_TRUSTED_ACCURACY_METERS)
    ) {
      exclude("POOR_ACCURACY");
      continue;
    }
    const segmentKm = haversineKm(prev, next);
    if (segmentKm * 1000 <= DUPLICATE_POINT_METERS) {
      exclude("DUPLICATE_OR_SAME_LOCATION");
      continue;
    }
    const elapsedMs = next.capturedAt.getTime() - prev.capturedAt.getTime();
    if (elapsedMs <= 0) {
      exclude("NON_MONOTONIC_TIMESTAMP");
      continue;
    }
    const hoursElapsed = Math.max(
      elapsedMs / 3_600_000,
      1 / 3600,
    );
    const impliedSpeedKmh = segmentKm / hoursElapsed;
    if (impliedSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
      exclude("IMPOSSIBLE_SPEED");
      continue;
    }
    total += segmentKm;
  }
  const excludedSegments = Object.values(excludedByReason).reduce((sum, count) => sum + count, 0);
  return {
    distanceKm: roundQuantity(total),
    excludedSegments,
    excludedByReason,
    warnings: [...new Set(warnings)],
    reviewRequired: warnings.some((warning) => warning !== "DUPLICATE_OR_SAME_LOCATION"),
    sampleCount: sorted.length,
    method: "CHECKPOINT_HAVERSINE_ESTIMATE" as const,
    calculationVersion: "v3-checkpoint-haversine-quality",
  };
}

// Whether a start/end point falls inside a configured HQ's geofence — returns the nearest HQ
// (by straight-line distance) regardless of whether it's actually inside, so callers can always
// show "nearest HQ is 4.2km away" even in the outside/exception case.
export function nearestHqWithin(
  point: { lat: number; lng: number },
  hqs: { id: string; lat: number; lng: number; radiusMeters: number }[],
) {
  if (!hqs.length) return { hq: null, distanceMeters: null, inside: false };
  let nearest = hqs[0]!;
  let nearestKm = haversineKm(point, nearest);
  for (const hq of hqs.slice(1)) {
    const km = haversineKm(point, hq);
    if (km < nearestKm) {
      nearest = hq;
      nearestKm = km;
    }
  }
  const distanceMeters = nearestKm * 1000;
  return { hq: nearest, distanceMeters, inside: distanceMeters <= nearest.radiusMeters };
}
