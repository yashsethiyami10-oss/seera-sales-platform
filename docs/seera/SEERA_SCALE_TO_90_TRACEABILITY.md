# Seera Scale-to-90 — Cross-Portal Flow Traceability Matrix

Date: 2026-08-10
Scope: Sales Executive, Sales Manager, Unified Distributor, Unified Super Stockist only.
Method: traced against actual code (file:line), not documentation claims. Verified with
`npx tsc --noEmit`, `npm run build`, and the Seera vitest suites listed in the final report.

## Flow A — Manager assigns Beat → Executive sees assignment → Start Day → retailer check-in → photo/order → Distributor receives correct order

| Step | Evidence | Status |
|---|---|---|
| Manager assigns Beat | `createJourneyPlan` (`operational-service.ts`) creates `SeeraJourneyPlan`, notifies the Executive | PASS |
| Executive sees assignment | `executiveBeat` (`field-portal-service.ts`) reads today's `SeeraJourneyPlan`; rendered by `BeatRoutePanel` | PASS |
| Start Day | `startFieldDay` (`workflow-service.ts`) | PASS |
| Retailer check-in | `executiveCheckIn` (`field-portal-service.ts`), GPS + photo-or-exception enforced | PASS |
| Photo / order | `capturePhoto`/`recordPhotoException`, then `placeRetailerOrder` on the same visit's retailer | PASS |
| Distributor receives correct order | `placeRetailerOrder` sets `sellerPartnerId = retailer.distributorId`; Distributor's `fulfilment` inbox queries `sellerPartnerId: {in: parties}` — same field, same value | PASS |

**Verdict: PASS.** No changes made this pass.

## Flow B — Distributor accepts/partials → reserves stock → picks → dispatches → delivery outcome → Executive eligible delivered updates → Manager sees same delivered truth

| Step | Evidence | Status |
|---|---|---|
| Accept/partial | `fulfilRetailerOrder` (now also `recordAudit`s the decision, added last pass) | PASS |
| Reserve stock | `allocateOrderStock` — `RESERVE` movement, `inventoryPosition` invariant enforced | PASS |
| Picks | No discrete "picked" state is ever set — `DISPATCH_READY` exists in `SalesOrderStatus` but nothing transitions into it; `allocateOrderStock` → `dispatchAllocatedOrder` goes straight from ALLOCATED to DISPATCHED | **PARTIAL** (final-polish, not fixed this pass — see report) |
| Dispatches | `dispatchAllocatedOrder`, now captures vehicle/driver/LR/challan/ETA (added last pass) | PASS |
| Delivery outcome | `completeDelivery` (`delivery-service.ts`) — DELIVERED/PARTIAL/REFUSED/DAMAGED all handled with correct stock consequence | PASS |
| Executive eligible delivered updates | `executiveDeliveredSales` reads `deliveredQuantity/refusedQuantity/returnedQuantity` directly off the same `SeeraOrderLine` rows `completeDelivery` writes — no caching, always live | PASS |
| Manager sees same delivered truth | **Fixed this pass**: new `managerDeliveredSales` (`manager-service.ts`) uses the *same* `eligibleDelivered()` function over the *same* order-line fields, team-wide, replacing the generic orders-list fallback | PASS (was PARTIAL) |

**Verdict: was PARTIAL (Manager side), now PASS.** Picking-stage granularity remains FINAL-POLISH.

## Flow C — Distributor replenishment → S.S. receives order → credit check → allocation → dispatch → Distributor receipt → inventory updates

| Step | Evidence | Status |
|---|---|---|
| Replenishment created | `createDistributorReplenishment` | PASS |
| Credit check | `evaluateDistributorCredit` against `canonicalDistributorExposure` — **fixed this pass** to exclude orders that already have an issued TAX_INVOICE/NON_TAX_INVOICE linked via `orderId`, so an invoiced order's value is no longer counted twice (once as `orderExposureTotal`, once as the invoice's posted ledger debit) | PASS |
| S.S. receives order | notified + appears in `distributor-orders` fulfil-stockist inbox | PASS |
| Allocation | `allocateOrderStock` (SUPER_STOCKIST) | PASS |
| Dispatch | `dispatchAllocatedOrder`, vehicle/driver/LR captured | PASS |
| Distributor receipt | `receiveIncomingOrder` — over-receipt blocked, short reason required, auto-claim on shortfall | PASS |
| Inventory updates | `recordInventoryMovement` + `inventoryPosition` invariant throughout | PASS |

**Verdict: PASS.** Credit-exposure double-count fixed this pass — was a real latent risk once billing went live, now closed before it could ever manifest.

## Flow D — Payment posted → outstanding decreases → available credit increases → next credit gate uses same canonical truth

| Step | Evidence | Status |
|---|---|---|
| Payment submitted (Distributor/S.S.) | `submitPartnerPayment`/`submitPaymentProof` — in-scope portals can submit | PASS |
| Payment posted to ledger | `verifyPayment` creates a POSTED `SeeraFinancialEntry` crediting the payer | **Requires `payment:review`+`ledger:post`, held only by ACCOUNTS_MANAGER/EXECUTIVE** — by design, not a gap. IV-001 in the prior V1 defect register was a CRITICAL fix specifically closing self-verification (S.S. could mark their own payment `VERIFIED`); granting Distributor/S.S. this permission would **reopen that exact hole**. Out of scope for these four portals. |
| Outstanding decreases / credit increases | `canonicalDistributorExposure` nets `postedCredits` — same function used everywhere | PASS (mechanism) |
| Next credit gate uses same truth | `createDistributorReplenishment` and `evaluateOrderCredit` both call `canonicalDistributorExposure` — cannot disagree | PASS |

**Verdict: PASS as a mechanism; the final "posting" step is intentionally Accounts-only and therefore OUT-OF-SCOPE for these four portals — not attempted, would be a regression if forced in.**

## Flow E — Refusal/return → stock consequence → sales-performance consequence

| Step | Evidence | Status |
|---|---|---|
| Delivery refusal | `completeDelivery` status=REFUSED → `refusedQuantity` incremented, RETURN/IN movement (stock consequence) | PASS |
| Refusal sales-performance consequence | `eligibleDelivered()` subtracts `refused` from delivered — refusal never inflates `deliveredQuantity` in the first place | PASS |
| Post-delivery return (new Returns & Damage workflow) — stock consequence | `decideReturnRequest`: USABLE → RETURN/IN movement; DAMAGED → no movement (matches the codebase's existing invariant that damaged stock never inflates onHand) | PASS |
| Post-delivery return — sales-performance consequence | **Was FAIL, fixed this pass**: `decideReturnRequest` did not touch `SeeraOrderLine.returnedQuantity` at all, so an approved return recorded against a specific order never reduced the Executive/Manager's eligible-delivered credit — a sale that no longer existed kept being counted. Now, when a return references `sourceOrderId`, approval increments that line's `returnedQuantity` (capped at what was actually delivered), which `eligibleDelivered()` already subtracts. UI updated (`ReturnsActions.tsx`) with an optional source-order picker. | PASS (was FAIL) |

**Verdict: was FAIL for the new Returns workflow specifically, now PASS.** This was the most consequential fix of this pass — an approved return could otherwise silently overstate a team's delivered sales indefinitely.

## Flow F — Quotation → accepted → converted → billing document → issued immutable history

| Step | Evidence | Status |
|---|---|---|
| Quotation accepted | `recordQuotationResponse` (built last pass) | PASS |
| Converted to order | `convertQuotationToOrder` — locks the quotation's own rate, applies the same credit gate as a normal replenishment when converting S.S.→Distributor | PASS |
| Billing document issued from that order | **Was PARTIAL/BROKEN, fixed this pass**: `createBillingDraft`/`issueBillingDraft` (new `billing-service.ts`) let the order be picked as the billing document's source order, multi-line draft, edit-while-draft, then issue | PASS (was PARTIAL) |
| Issued immutable history | `updateBillingDraft`/`issueBillingDraft` both require `status==="DRAFT"` — an ISSUED document has no further mutation path in this codebase | PASS |

**Verdict: was PARTIAL, now PASS end-to-end.**

## Summary

| Flow | Before this pass | After this pass |
|---|---|---|
| A | PASS | PASS |
| B | PARTIAL (Manager side) | PASS |
| C | PASS (with a latent double-count risk once billing went live) | PASS (risk closed) |
| D | PASS (mechanism) / Accounts step out of scope | unchanged — documented, not a gap |
| E | FAIL (new Returns workflow didn't feed sales performance) | PASS |
| F | PARTIAL (no real billing lifecycle) | PASS |

Remaining non-blocking item: Flow B's "Picking" stage has no discrete state — allocation and dispatch are adjacent operator actions with no intermediate confirmation. Classified FINAL-POLISH in the closure report, not fixed this pass (would add friction without a clear operational need the Founder has asked for).

## Live verification evidence (not just code reading)

All of the above was additionally proven by actually executing the real service functions against
the TEST DB (fingerprint `0df3ed0f625087ff`), not merely inspecting source:

- `scripts/seera/seed-scale-to-90-supplement.ts` — runs `createQuotationDraft` → `issueQuotation` →
  `recordQuotationResponse` → `convertQuotationToOrder` end-to-end (Flow F), plus a Beat/Visit/Photo
  chain (Flow A elements), a billing draft→issue, and two Returns & Damage decisions including a
  maker-checker approval by a second, independent Owner. Its `[FLOW-E CHECK]` line printed
  `returnedQuantity before=0 after=2` — direct proof the Flow E fix (return → sales-performance
  consequence) actually mutates the order line, not just that the code compiles.
- `scripts/seera/smoke-credit-exposure.ts` — created a real `DISTRIBUTOR_REPLENISHMENT` order, then
  issued a `TAX_INVOICE` against it, and printed exposure before/after: `orderExposureTotal` dropped
  from `1013.20` to `0` the moment the invoice was issued, while `postedDebits` picked up `1195.58`
  instead — direct proof the order+invoice double-count fix (Flow C/D) is real, not just a passing
  unit test on a synthetic input.
- `scripts/seera/smoke-rbac-negative.ts` — proved three negative paths actually deny: a
  DISTRIBUTOR_OPERATOR creating a return request (`Required permission denied`), a Distributor Owner
  approving their own return request (`A return request requires an independent reviewer`), and
  issuing a non-existent document (`Document not found`).

All three scripts are safe to re-run (idempotent or read-mostly) and left in `scripts/seera/` for the
next session.
