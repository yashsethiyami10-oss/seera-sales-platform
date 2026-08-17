import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { FoundationError } from "@/lib/foundation/errors";

type Db = PrismaClient | Prisma.TransactionClient;

export type CommercialLineInput = {
  skuId: string;
  quantity: number;
  rate: number;
  discountPct?: number;
  // Nullable, not just optional — a Draft may legitimately be saved before the SKU's GST rate is
  // configured (see buildLineSnapshots's enforceTax:false), and the client sends an explicit
  // `taxRate: null` for those lines (QuotationActions.tsx/BillingActions.tsx's line state defaults
  // to null, not undefined) rather than omitting the key.
  taxRate?: number | null;
};

// Single shared, testable source of truth for the zod shape backing every quotation/billing draft
// create/update API action (app/api/distribution/operations/route.ts) — previously duplicated
// inline 4 times, and the duplicated copies were the actual site of a real production bug: they
// used `.optional()` (permits an omitted key) instead of `.nullable().optional()` (also permits an
// explicit `null`), so a Save Draft request from the real UI — which always sends `taxRate: null`
// explicitly for an unconfigured line, never omits the key — was rejected with "Expected number,
// received null" even though the service layer underneath had already been relaxed to allow it.
export const commercialLineInputSchema = z.object({
  skuId: z.string(),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
});

export type PriceMode = "GST_INCLUSIVE" | "GST_EXCLUSIVE";

export type CommercialLineSnapshot = {
  skuId: string;
  skuCodeSnapshot: string;
  productNameSnapshot: string;
  packSnapshot: string;
  mrpSnapshot: number;
  hsnSnapshot: string;
  quantity: number;
  rate: number;
  discountPct: number;
  taxRate: number;
  priceMode: PriceMode;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
  // Whether this line's tax was taken from a real governed rate (explicit override or the SKU's
  // own taxRate+hsn) rather than defaulted to 0 because neither was configured yet. See
  // buildLineSnapshots's enforceTax parameter and assertLinesTaxConfigured below — a DRAFT may
  // legitimately contain unconfigured lines (Founder/Admin hasn't set GST/HSN for that SKU yet);
  // an ISSUED document must not.
  taxConfigured: boolean;
};

// GSTIN's first 2 characters are the official GST state code (e.g. "27" = Maharashtra) — a
// standard, publicly documented encoding, not an invented heuristic. Used to decide CGST+SGST
// (same state, intra-state supply) vs IGST (different states, inter-state supply) without needing
// a separate state field anywhere.
export function stateCodeFromGstin(gstin?: string | null): string | undefined {
  const code = gstin?.trim().slice(0, 2);
  return code && /^\d{2}$/.test(code) ? code : undefined;
}

// If either party's GSTIN is missing, intra- vs inter-state cannot be determined from data the
// system actually has — falls back to the existing IGST-only treatment rather than guessing.
export function taxSplit(issuerGstin: string | undefined, buyerGstin: string | undefined, taxAmount: number) {
  const issuerState = stateCodeFromGstin(issuerGstin);
  const buyerState = stateCodeFromGstin(buyerGstin);
  if (issuerState && buyerState && issuerState === buyerState)
    return { cgst: taxAmount / 2, sgst: taxAmount / 2, igst: 0 };
  return { cgst: 0, sgst: 0, igst: taxAmount };
}

export function draftNumber(idempotencyKey: string) {
  return `DRAFT-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16).toUpperCase()}`;
}

// GST-inclusive rate, global commercial rule (Founder decision): every rate a Sales Executive /
// Manager / Distributor / partner-facing user types in IS the final gross amount — GST is derived
// FROM it, never added on top. For a governed tax rate t (percent) and gross unit rate g:
//   taxableUnit = g / (1 + t/100)
//   taxUnit     = g - taxableUnit
// Discount is applied to the gross (still inclusive) line total first, then the discounted gross
// is split into taxable/tax — so lineTotal (what the buyer actually owes) is always exactly
// quantity*rate minus discount, never quantity*rate minus discount PLUS tax again.
export function deriveInclusiveTax(grossValue: number, taxRatePct: number) {
  const taxableValue = grossValue / (1 + taxRatePct / 100);
  const taxAmount = grossValue - taxableValue;
  return { taxableValue, taxAmount };
}

// GST-exclusive rate: the rate typed IS the base/taxable value already — GST is added ON TOP, never
// extracted from it. For a governed tax rate t (percent) and base unit rate b:
//   taxableUnit = b
//   taxUnit     = b * t/100
// Founder correction (overrides the previous blanket assumption that every rate in this system was
// GST-inclusive): MUV rates are the final GST-inclusive commercial price (deriveInclusiveTax above),
// but Seera/Yuva/Shine Plus rates are supplied as BASE/GST-exclusive figures — using the inclusive
// math on them would silently under-charge GST by extracting a tax portion from what is already the
// pre-tax base. See priceModeForBrand below for which brands use which path.
export function deriveExclusiveTax(baseValue: number, taxRatePct: number) {
  const taxableValue = baseValue;
  const taxAmount = baseValue * (taxRatePct / 100);
  return { taxableValue, taxAmount };
}

// Founder-authoritative price mode per brand (not per-SKU, not a stored column — brand is already a
// required, always-populated SeeraSku field, and the rule is a deterministic brand-level policy, not
// a per-product exception): MUV quotes GST-inclusive rates; every other brand in this catalog (Seera,
// Yuva, Shine Plus, and any future non-MUV brand) quotes GST-exclusive base rates. Do not special-case
// individual SKUs here — if a genuine per-SKU exception is ever needed, that is a business-rule
// decision for the Founder to make explicitly, not something to infer.
export function priceModeForBrand(brand: string): PriceMode {
  return /^muv$/i.test(brand.trim()) ? "GST_INCLUSIVE" : "GST_EXCLUSIVE";
}

// GST correctness fix (Founder UAT): issued documents were showing CGST=SGST=IGST=0 not because
// the inclusive-tax math was wrong (deriveInclusiveTax/taxSplit above were already correct) but
// because real SeeraSku rows carry taxRate=null/hsn=null — an earlier pass deliberately refused to
// invent a rate the Founder never supplied (see seed-company-to-ss-price-list.ts's own comment) —
// and nothing stopped a taxable document from issuing anyway with a silently-zero tax line. This
// blocks that silent path; it does not invent a rate. A caller MAY still pass an explicit
// line.taxRate (e.g. a governed override), which bypasses this gate exactly like the existing
// `taxRate ?? Number(sku.taxRate ?? 0)` fallback already did.
export function assertTaxConfigured(sku: { code: string; taxRate: unknown; hsn: string | null }, explicitTaxRate?: number | null) {
  if (explicitTaxRate != null) return;
  if (sku.taxRate == null || !sku.hsn)
    throw new FoundationError(
      "TAX_CONFIGURATION_REQUIRED",
      `SKU ${sku.code} has no governed GST rate/HSN configured — a taxable document cannot be issued until Founder/Admin sets it under Masters`,
      409,
    );
}

// Save/Update a draft passes enforceTax:false — draft persistence must not be blocked by missing
// GST master data (Founder-reported P0: Save Draft silently failed for every SKU lacking a
// governed tax rate/HSN, meaning not one commercial document could ever be saved in production). A
// draft is explicitly "editable, recoverable, not posted prematurely" (spec) — an unconfigured
// line is simply flagged (taxConfigured:false, taxRate defaults to 0) instead of rejected outright.
// The real, still-strict gate moved to assertLinesTaxConfigured below, enforced once at
// issueQuotation/issueBillingDraft — so an ISSUED document can never silently carry a zero tax
// line, exactly preserving the governance intent assertTaxConfigured originally existed for, just
// at the correct lifecycle point instead of blocking the draft that precedes it.
export async function buildLineSnapshots(
  db: Db,
  lines: CommercialLineInput[],
  options: { enforceTax: boolean },
): Promise<CommercialLineSnapshot[]> {
  if (!lines.length)
    throw new FoundationError("INVALID_DOCUMENT_LINES", "At least one line is required", 400);
  return Promise.all(
    lines.map(async (line) => {
      if (line.quantity <= 0 || line.rate < 0)
        throw new FoundationError("INVALID_DOCUMENT_LINES", "Invalid line values", 400);
      const sku = await db.seeraSku.findUniqueOrThrow({ where: { id: line.skuId } });
      const taxConfigured = line.taxRate != null || (sku.taxRate != null && Boolean(sku.hsn));
      if (options.enforceTax) assertTaxConfigured(sku, line.taxRate);
      const discountPct = line.discountPct ?? 0;
      const taxRate = line.taxRate ?? Number(sku.taxRate ?? 0);
      const gross = line.rate * line.quantity;
      const grossAfterDiscount = gross - (gross * discountPct) / 100;
      // Do not use one math path for both price modes (Founder correction): MUV rates are already
      // GST-inclusive (tax extracted from the gross); every other brand's rate is the GST-exclusive
      // base (tax added on top) — see priceModeForBrand/deriveExclusiveTax above.
      const priceMode = priceModeForBrand(sku.brand);
      const { taxableValue, taxAmount } =
        priceMode === "GST_INCLUSIVE"
          ? deriveInclusiveTax(grossAfterDiscount, taxRate)
          : deriveExclusiveTax(grossAfterDiscount, taxRate);
      const lineTotal = priceMode === "GST_INCLUSIVE" ? grossAfterDiscount : taxableValue + taxAmount;
      return {
        skuId: sku.id,
        skuCodeSnapshot: sku.code,
        productNameSnapshot: sku.productName,
        packSnapshot: `${sku.packSize} ${sku.unitType}`,
        mrpSnapshot: Number(sku.mrp),
        hsnSnapshot: sku.hsn ?? "",
        quantity: line.quantity,
        rate: line.rate,
        discountPct,
        taxRate,
        priceMode,
        taxableValue,
        taxAmount,
        lineTotal,
        taxConfigured,
      };
    }),
  );
}

// The actual governance choke point (moved from buildLineSnapshots, see its comment above) —
// called once, right before a document transitions out of DRAFT, against whatever lineSnapshot is
// already stored. Lists every offending SKU by code so the error is immediately actionable instead
// of a generic failure.
export function assertLinesTaxConfigured(lines: CommercialLineSnapshot[]) {
  const unconfigured = lines.filter((l) => !l.taxConfigured);
  if (unconfigured.length)
    throw new FoundationError(
      "TAX_CONFIGURATION_REQUIRED",
      `The following product(s) have no governed GST rate/HSN configured and must be set by Founder/Admin under Masters before this document can be issued: ${unconfigured.map((l) => l.skuCodeSnapshot).join(", ")}`,
      409,
    );
}

export function totalsOf(lines: CommercialLineSnapshot[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.rate * l.quantity, 0);
  const grandTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const taxTotal = lines.reduce((sum, l) => sum + l.taxAmount, 0);
  const discountTotal = lines.reduce((sum, l) => sum + (l.rate * l.quantity * l.discountPct) / 100, 0);
  return { subtotal, discountTotal, taxTotal, grandTotal };
}

// PDF correctness fix (Founder UAT): issued documents were rendering raw JSON like
// {"city":"JHANSI","line":"..."} in the address block — partySnapshot handed the stored address
// object straight to JSON.stringify instead of formatting it. Addresses are free-form JSON (no
// fixed schema across SeeraRetailer.address / SeeraPartner.addresses), but every write site in this
// codebase (createSuperStockist, createDistributorForSuperStockist, createRetailer) uses the same
// {line, area, city, state, pincode} shape — pull those out defensively and join only what's
// actually present, rather than assuming a rigid schema.
export function formatAddress(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const a = value as Record<string, unknown>;
  const parts = [a.line, a.area, a.city, a.state, a.pincode].filter((p) => typeof p === "string" && p.trim());
  if (parts.length) return parts.join(", ");
  // Unrecognized shape — still never dump raw JSON; join whatever plain string values exist.
  return Object.values(a).filter((v) => typeof v === "string" && v.trim()).join(", ");
}

export async function partySnapshot(
  db: Db,
  partyType: string,
  partyId: string,
): Promise<{ legalName: string; tradeName?: string; gstin?: string; address: string; state?: string; stateCode?: string }> {
  if (partyType === "RETAILER") {
    const retailer = await db.seeraRetailer.findUniqueOrThrow({ where: { id: partyId } });
    return {
      legalName: retailer.businessName,
      gstin: retailer.gstin ?? undefined,
      address: formatAddress(retailer.address),
      stateCode: stateCodeFromGstin(retailer.gstin),
    };
  }
  const partner = await db.seeraPartner.findUniqueOrThrow({ where: { id: partyId } });
  return {
    legalName: partner.legalName,
    tradeName: partner.tradeName ?? undefined,
    gstin: partner.gstin ?? undefined,
    address: formatAddress(partner.addresses),
    stateCode: stateCodeFromGstin(partner.gstin),
  };
}
