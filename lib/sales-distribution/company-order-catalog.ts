import type { Prisma, PrismaClient } from "@prisma/client";

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
// `basis` (Final 100% Closure, 23-Aug): distinguishes what SeeraPriceVersion.amount (COMPANY_TO_SS)
// actually represents for this SKU — "PACK_TOTAL" (the default, and every pre-existing entry below)
// means the stored amount IS ALREADY the full Box/Bag price (e.g. Cake Blue's ₹298 is the whole
// 40-pc box, not ₹298/pc) — order total stays exactly `amount * quantity`, quantity = pack count,
// UNCHANGED from before this field existed. "PER_PC" means the stored amount is the per-piece/per-kg
// governed base rate and must be MULTIPLIED by unitsPerOrderUnit to get the price for one ordered
// unit of `orderUnit` — see companyOrderLineMultiplier below, the single place this multiplication
// happens (both the catalog DISPLAY rate and the actual charged order total derive from the exact
// same function, so they can never disagree). Introduced specifically so Powder 1kg's governed
// ₹56.50/₹46 PER-KG base rate can default to a BAG(25) order unit — Founder-approved formula:
// BAG rate = governed base PC rate × pack factor — WITHOUT superseding/duplicating the base
// COMPANY_TO_SS price version itself (that stays exactly what Founder approved, per-kg).
export const COMPANY_ORDER_UNIT_OVERRIDES: Record<string, { orderUnit: CompanyOrderUnit; unitsPerOrderUnit?: number; rateBasis: string; basis?: "PACK_TOTAL" | "PER_PC" }> = {
  "SEERA-CAKE-BLUE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (180g each)" },
  "SEERA-CAKE-WHITE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (150g each)" },
  "SEERA-YUVA-CAKE-BLUE": { orderUnit: "BOX", unitsPerOrderUnit: 40, rateBasis: "Rate per Box of 40 pcs (170g each)" },
  "SEERA-POWDER-1KG": { orderUnit: "BAG", unitsPerOrderUnit: 25, basis: "PER_PC", rateBasis: "Governed base rate ₹56.50/kg (PC) × pack factor 25 = ₹1,412.50/BAG — derived live from the base rate, never a separately stored BAG price" },
  "SEERA-SHINEPLUS-POWDER-1KG": { orderUnit: "BAG", unitsPerOrderUnit: 25, basis: "PER_PC", rateBasis: "Governed base rate ₹46/kg (PC) × pack factor 25 = ₹1,150/BAG — derived live from the base rate, never a separately stored BAG price" },
  "SEERA-SHINEPLUS-POWDER-3KG": { orderUnit: "BAG", unitsPerOrderUnit: 10, rateBasis: "Rate is for the full 10-pc pack — Founder explicit: NOT per piece" },
  "SEERA-SHINEPLUS-POWDER-5KG": { orderUnit: "BAG", unitsPerOrderUnit: 6, rateBasis: "Rate is for the full 6-pc pack — Founder explicit: NOT per piece" },
  "SEERA-BARTAN-300G": { orderUnit: "BOX", unitsPerOrderUnit: 36, rateBasis: "Rate per Box of 36 pcs" },
  "SEERA-BARTAN-500G": { orderUnit: "BOX", unitsPerOrderUnit: 24, rateBasis: "Rate per Box of 24 pcs" },
};

// Single source of truth for the PER_PC -> pack-total conversion — used identically by the catalog
// DISPLAY rate (OperationalWorkspace.tsx) and the actual charged order total (createCompanyOrder,
// workflow-service.ts), so they can never independently drift or disagree. Returns 1 (no-op) for
// every PACK_TOTAL-basis SKU (the default), which is every SKU that existed before this field —
// zero behavior change for those.
export function companyOrderLineMultiplier(skuCode: string): number {
  const override = COMPANY_ORDER_UNIT_OVERRIDES[skuCode];
  return override?.basis === "PER_PC" ? (override.unitsPerOrderUnit ?? 1) : 1;
}

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

// PERFORMANCE PHASE 2: the Sales Executive retailer-order catalog (ACTIVE SKUs + their current
// DISTRIBUTOR_TO_RETAILER price) is not actor/partner/role-scoped — it's the same ~44-SKU list for
// every executive — yet OperationalWorkspace.tsx re-ran this query from scratch on every single
// router.refresh() (i.e. after every check-in/checkout/order/photo, not just when the catalog
// itself changed). A short in-process TTL cache removes that redundant DB round trip from the vast
// majority of portal reloads without ever serving data more than 2 minutes stale. Module-level
// (not unstable_cache) deliberately: this process only ever talks to one database at a time (TEST
// or production, enforced by lib/database/identity-guard.ts's caller), so there's no cross-database
// leakage risk, and it avoids Next's data-cache key-serialization concerns around passing a
// PrismaClient argument. Rate is editable by the Executive at order time regardless (see
// OperationalWorkspace.tsx), so a briefly-stale suggested price carries no governance risk — it is
// never the number actually charged.
type RetailerCatalogSku = Awaited<ReturnType<PrismaClient["seeraSku"]["findMany"]>>[number] & {
  prices: Array<{ amount: Prisma.Decimal }>;
};
let retailerCatalogCache: { data: RetailerCatalogSku[]; expiresAt: number } | null = null;
const RETAILER_CATALOG_CACHE_TTL_MS = 120_000;

export async function activeRetailerCatalog(db: PrismaClient | Prisma.TransactionClient, now: Date): Promise<RetailerCatalogSku[]> {
  if (retailerCatalogCache && retailerCatalogCache.expiresAt > now.getTime()) return retailerCatalogCache.data;
  const skus = (await db.seeraSku.findMany({
    where: { status: "ACTIVE" },
    include: {
      prices: {
        where: {
          tier: "DISTRIBUTOR_TO_RETAILER",
          status: "ACTIVE",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
    orderBy: [{ brand: "asc" }, { productName: "asc" }],
    take: 200,
  })) as RetailerCatalogSku[];
  retailerCatalogCache = { data: skus, expiresAt: now.getTime() + RETAILER_CATALOG_CACHE_TTL_MS };
  return skus;
}

// Governed free-goods scheme lookup — reads real SeeraScheme rows (never a hardcoded map). A
// scheme is display-only, informational entitlement text on the order line: it is NEVER deducted
// from or folded into the line/order total (createCompanyOrder/createDistributorReplenishment
// price math is untouched by this), matching the explicit "no hidden discount, no artificially
// lowered rate" governance for free goods. `eligibilityType` is the plain-string scope tag this
// codebase's seed data already uses (e.g. "COMPANY_TO_SS_DISPLAY_ONLY") — no JSON-path query needed.
export async function activeSchemeNotesForSkus(
  db: PrismaClient | Prisma.TransactionClient,
  skuIds: string[],
  eligibilityType: "COMPANY_TO_SS_DISPLAY_ONLY" | "SS_TO_DISTRIBUTOR_DISPLAY_ONLY",
  now: Date,
): Promise<Map<string, string>> {
  const schemes = await db.seeraScheme.findMany({
    where: { skuId: { in: skuIds }, eligibilityType, status: "ACTIVE", effectiveFrom: { lte: now }, effectiveTo: { gt: now } },
  });
  const notes = new Map<string, string>();
  // `name` is the already-correct, unit-specific display text set at scheme-authoring time (e.g.
  // "Buy 1 BOX -> +1 PC FREE") — reusing it directly instead of reconstructing a generic note from
  // minimumQuantity/freeQuantity avoids losing the BOX/BAG unit context this function has no other
  // way to know (SeeraScheme itself carries no order-unit field).
  for (const s of schemes) {
    if (!s.skuId) continue;
    notes.set(s.skuId, s.name);
  }
  return notes;
}

// The Founder's canonical 37-variant list uses "Phenyl 1L / Phenyl 5L" with no brand qualifier,
// alongside a separately-named "Black Phenyl 1L" line. The canonical MUV catalog has no plain
// "Phenyl" product — only "MUV White Phenyl" (1L/5L, code MUV-WP-STD-1000/5000) and "MUV Black
// Phenyl" (1L, code MUV-BP-STD-1000). Unqualified "Phenyl" resolves to White Phenyl — the only
// other Phenyl product existing in both requested pack sizes. This is a governed alias resolution,
// not a duplicate SKU creation; flagged here rather than assumed silently.
export const MUV_PHENYL_ALIAS_NOTE =
  "Unqualified 'Phenyl 1L/5L' resolves to canonical MUV White Phenyl (MUV-WP-STD-1000 / MUV-WP-STD-5000) — the only Phenyl product existing in both requested pack sizes. 'Black Phenyl 1L' maps to its own SKU, MUV-BP-STD-1000.";

// Historical note: MUV-BP-STD-1000 (Black Phenyl 1L) was previously excluded/unpriced (no approved
// MRP existed anywhere). The Founder's current 37-variant restoration list supplies complete data
// for it (MRP 80, Company→S.S. 60.00, S.S.→Distributor 64.80) — it is created/activated like every
// other MUV SKU this pass, not excluded.

// IMPORTANT: no active "Additional MUV scheme" (e.g. the historical "2.5% on each buy" note) may be
// created, calculated, displayed, or referenced anywhere — the Founder has explicitly confirmed no
// such scheme is part of the current live commercial configuration. There is deliberately no
// MUV_SCHEME_NOTE export in this file; see activeSchemeNotesForSkus() above for the only governed,
// DB-backed scheme mechanism, which reads real SeeraScheme rows and was never wired to any MUV SKU.
