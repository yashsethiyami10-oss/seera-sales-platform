// RUN 2B: Founder-supplied Company→S.S. commercial-unit overrides.
//
// The generic SeeraSku.packSize/unitType describe the physical pack (e.g. "180 g", "1 L") — that is
// NOT always the same thing as the unit the Company→S.S. rate is quoted against. Several Seera SKUs
// are priced per case (Box/Bag), not per piece: e.g. Seera Detergent Cake Blue is "180g × 40 pcs /
// Box" at ₹298 PER BOX, not ₹298 per 180g piece. Inventing a per-piece conversion (÷40) was not
// requested and would silently change the Founder's stated commercial meaning, so this file records
// the order unit as its own fact, scoped specifically to the COMPANY_TO_SS tier — it must never be
// assumed to apply to SS_TO_DISTRIBUTOR/DISTRIBUTOR_TO_RETAILER pricing for the same SKU, which may
// legitimately be priced per piece.
//
// Canonical shared order-unit vocabulary (RUN 2B resume prompt Section C/D/E): PCS / BOX / BAG.
// `unitsPerOrderUnit` is informational pack-size context only (e.g. "Box of 40") — it is NEVER
// multiplied into `rate` or into order math. Order line total is always
// `SeeraPriceVersion.amount (already scoped to this orderUnit) × line quantity (number of
// orderUnits ordered)`, exactly as lib/sales-distribution/workflow-service.ts's createCompanyOrder
// already computes it — this file changes no pricing arithmetic, only what a "quantity of 1" means
// for a given SKU, and it's stamped into each order line's schemeSnapshot JSON (an existing nullable
// column, no schema change) as a conversion snapshot so historical orders keep their own unit
// context even if this table's mapping changes later.
//
// Two SKUs need a documented judgment call, not an invented conversion:
//   - SEERA-POWDER-1KG / SEERA-SHINEPLUS-POWDER-1KG: Founder rate is explicitly "per kg", and each
//     physical pack IS exactly 1 kg — so "1 kg" and "1 piece" are the same quantity for this SKU by
//     exact identity, not a derived ratio. Labeled PCS (not a 4th "KG" unit, to stay inside the
//     canonical 3-unit vocabulary) with rateBasis noting the per-kg origin. This is NOT the same
//     move as the Shine Plus 3kg/5kg case below — there the pack rate is NOT divisible per piece.
//   - SEERA-SHINEPLUS-POWDER-3KG / -5KG: Founder rate (₹1,380) is explicitly for the FULL
//     10-pc/6-pc pack, and explicitly "NOT per piece" — so PCS is not a valid order unit here at
//     all (there is no governed per-piece rate to show); the only governed order unit is the pack
//     itself, labeled BAG.
// STAGE 12 — Inventory Finalization (resolves the Pass 0F audit finding this comment used to flag
// as open): scripts/seera/seed-ss-to-distributor-price-list.ts independently ALSO prices the 3 cake
// SKUs per governed pack (₹315/Box, matching this file's Company→S.S. BOX unit), and
// createDistributorReplenishment/receiveIncomingOrder carry that same raw "quantity" through order
// bookkeeping with no conversion — confirmed by
// scripts/seera/smoke-stage1f-real-seera-distributor-replenishment.ts: ordering quantity:4 of Cake
// Blue costs 4×₹315 (the Company→S.S.→Distributor chain is self-consistently BOX-denominated end to
// end for these SKUs, and that commercial/order-unit bookkeeping is correct and untouched). The real
// defect, proven against the real TEST DB via scripts/seera/stage12-proof-box-unit-consistency.ts,
// was one level deeper: the PHYSICAL inventory ledger (SeeraInventoryMovement, which a RETAILER_ORDER
// ALSO writes to — always in individual pieces, since placeRetailerOrder has no BOX/PCS concept
// anywhere in its call path and a shopkeeper is never sold "12 boxes") was accumulating that same raw
// order-unit number directly, so a Distributor who received 2 Boxes (80 physical pieces) of Cake Blue
// only ever showed "2" available — a legitimate 50-piece retail order was rejected as insufficient
// stock despite 80 physical pieces on hand. wholesaleOrderUnitToCanonicalPieces/
// canonicalPiecesToWholesaleOrderUnit below are the one conversion boundary that closes this: order
// line quantities (orderedQuantity/acceptedQuantity/allocatedQuantity/dispatchedQuantity — always
// order-units, e.g. Boxes) are NEVER rewritten, but every SeeraInventoryMovement row derived from a
// COMPANY_REPLENISHMENT/DISTRIBUTOR_REPLENISHMENT order line is converted to canonical physical pieces
// before it reaches the ledger, in lib/sales-distribution/workflow-service.ts's receiveIncomingOrder/
// allocateOrderStock/dispatchAllocatedOrder. A RETAILER_ORDER line is never passed through this
// conversion (multiplier is implicitly 1 — it's already piece-denominated by design).
export type CompanyOrderUnit = "PCS" | "BOX" | "BAG";
export const COMPANY_ORDER_UNIT_OVERRIDES: Record<string, { orderUnit: CompanyOrderUnit; unitsPerOrderUnit?: number; rateBasis: string }> = {
  "SEERA-CAKE-BLUE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (180g each)" },
  "SEERA-CAKE-WHITE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (150g each)" },
  "SEERA-YUVA-CAKE-BLUE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (170g each)" },
  "SEERA-POWDER-1KG": { orderUnit: "PCS", unitsPerOrderUnit: 1, rateBasis: "Founder rate ₹56.50/kg — 1 pc = 1 kg exactly for this pack, so PCS rate = kg rate" },
  "SEERA-SHINEPLUS-POWDER-1KG": { orderUnit: "PCS", unitsPerOrderUnit: 1, rateBasis: "Founder rate ₹46/kg — 1 pc = 1 kg exactly for this pack, so PCS rate = kg rate" },
  "SEERA-SHINEPLUS-POWDER-3KG": { orderUnit: "BAG", unitsPerOrderUnit: 10, rateBasis: "Rate is for the full 10-pc pack — Founder explicit: NOT per piece" },
  "SEERA-SHINEPLUS-POWDER-5KG": { orderUnit: "BAG", unitsPerOrderUnit: 6, rateBasis: "Rate is for the full 6-pc pack — Founder explicit: NOT per piece" },
  "SEERA-BARTAN-300G": { orderUnit: "BOX", unitsPerOrderUnit: 36, rateBasis: "Rate per Box of 36 pcs" },
  "SEERA-BARTAN-500G": { orderUnit: "BOX", unitsPerOrderUnit: 24, rateBasis: "Rate per Box of 24 pcs" },
};

// The one conversion boundary between commercial order-unit quantities (Boxes/Bags, as ordered) and
// canonical physical pieces (the single basis the shared inventory ledger must use — see the STAGE 12
// comment above). Never used for a RETAILER_ORDER line — those are already piece-denominated.
export function wholesaleOrderUnitToCanonicalPieces(skuCode: string, orderUnitQuantity: number): number {
  const unitsPerOrderUnit = COMPANY_ORDER_UNIT_OVERRIDES[skuCode]?.unitsPerOrderUnit ?? 1;
  return orderUnitQuantity * unitsPerOrderUnit;
}
// Inverse — used only to translate an already-converted physical-piece ledger sum back into
// order-units for a bookkeeping comparison (e.g. "how many Boxes have already been received"),
// never to silently truncate/round: throws rather than guess if the pieces figure isn't an exact
// multiple of the SKU's governed pack size, since that would mean the ledger itself is corrupt.
export function canonicalPiecesToWholesaleOrderUnit(skuCode: string, pieces: number): number {
  const unitsPerOrderUnit = COMPANY_ORDER_UNIT_OVERRIDES[skuCode]?.unitsPerOrderUnit ?? 1;
  if (pieces % unitsPerOrderUnit !== 0) throw new Error(`INVENTORY_UNIT_CONVERSION_MISALIGNED: ${pieces} physical pieces is not an exact multiple of the governed pack size (${unitsPerOrderUnit}) for ${skuCode}`);
  return pieces / unitsPerOrderUnit;
}

// MUV: no case-pack rate was ever supplied by the Founder for any MUV SKU — every MUV Company→S.S.
// rate is per single bottle/pack. Per Section D, PCS is the only governed unit for MUV; BOX/BAG are
// deliberately NOT fabricated for any MUV SKU (no entry in this table = defaults to PCS, see
// OperationalWorkspace.tsx's catalog-building code).
export const DEFAULT_MUV_ORDER_UNIT: CompanyOrderUnit = "PCS";

// Display-only scheme notes (Founder Section 8/RUN 2B): SeeraScheme rows carry this same text as
// their `name`, but the model has no wired application-to-order-total mechanism anywhere in this
// codebase today (grep confirms zero reads of SeeraScheme outside seed scripts), so a scheme is
// shown as information only — never deducted from a line/order total here, to avoid inventing an
// unGoverned financial posting rule.
export const COMPANY_ORDER_SCHEME_NOTES: Record<string, string> = {
  "SEERA-CAKE-BLUE": "1 pc Free per Box",
  "SEERA-CAKE-WHITE": "1 pc Free per Box",
  "SEERA-YUVA-CAKE-BLUE": "2 pcs Free per Box",
};

// Founder's RUN 2B source list says "Phenyl 1L / Phenyl 5L" with no brand qualifier. The canonical
// MUV catalog (PRODUCTION_CATALOG_MANIFEST.json) has no plain "Phenyl" product — only "MUV White
// Phenyl" (1L/5L, code MUV-WP-STD-1000/5000) and "MUV Black Phenyl" (1L only, code MUV-BP-STD-1000,
// still DRAFT/no MRP). Since the Founder's own list separately and explicitly names "Black Phenyl
// 1L" as its own line, "Phenyl" without a qualifier is read as White Phenyl — the only other Phenyl
// product that exists in both requested pack sizes (1L and 5L). This is a governed alias resolution,
// not a duplicate SKU creation; flagged here rather than assumed silently.
export const MUV_PHENYL_ALIAS_NOTE =
  "Founder RUN 2B list's unqualified 'Phenyl 1L/5L' resolved to canonical MUV White Phenyl (MUV-WP-STD-1000 / MUV-WP-STD-5000) — the only Phenyl product existing in both requested pack sizes. 'Black Phenyl 1L' from the same list maps to MUV-BP-STD-1000, which is intentionally NOT priced this pass (see below).";

// Founder's list also prices "Black Phenyl 1L = ₹60.00", but the canonical MUV-BP-STD-1000 SKU is
// still DRAFT status with no real MRP anywhere in the approved catalog manifest (kept as a
// placeholder per an earlier phase's explicit instruction: "Once a real MRP is supplied, create the
// variant... do not recreate or delete the Product row"). RUN 2B Section 7 says "If source list
// contains a SKU currently excluded/inactive in canonical MUV: do not silently activate it" — so
// this SKU is deliberately left unpriced and excluded from the Company Order catalog this pass.
export const MUV_BLACK_PHENYL_EXCLUDED_NOTE =
  "MUV-BP-STD-1000 (Black Phenyl 1L) intentionally left unpriced/inactive — DRAFT status, no approved MRP anywhere in the catalog manifest. Not activated per governance instruction not to silently activate an excluded SKU.";

export const MUV_SCHEME_NOTE = "Additional 2.5% Scheme on Each Buy (informational — application mechanism not governed, not applied to order totals)";
