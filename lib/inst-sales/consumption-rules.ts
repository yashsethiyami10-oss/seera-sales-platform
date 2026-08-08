/**
 * Module 6 — MUV AI Consumption Intelligence — configurable business rules.
 *
 * Explicitly rule-based per the milestone spec ("Initially use configurable
 * business rules and calculation formulas. Do NOT build machine learning
 * models in this milestone."). Every constant here is a tunable estimate,
 * not a measured fact — that's why they live in one named-constant file
 * instead of being inlined into the engine, and why every output the engine
 * produces carries a `rulesVersion` and a `confidence` alongside the number.
 *
 * `estimatedUnitPriceInr` is a placeholder institutional price list, not a
 * lookup into the real storefront `Product` catalog: MUV's seeded catalog is
 * a D2C personal-care range (MUV Noir/Bloom/Renew/…), not SKU'd institutional
 * bulk chemicals — matching by name would silently produce nonsense. When
 * MUV Products for these bulk categories exist, replace this table with a
 * real lookup; until then these ₹/unit figures are what make the ₹
 * opportunity numbers approximate, and every consumer of this module must
 * treat them as such.
 */
export const RULES_VERSION = "1.0.0";

export type ConsumptionCategory =
  | "FLOOR_CLEANER"
  | "LAUNDRY_DETERGENT"
  | "GLASS_CLEANER"
  | "TOILET_CLEANER"
  | "HAND_WASH"
  | "DISHWASH";

export const CATEGORY_LABEL: Record<ConsumptionCategory, string> = {
  FLOOR_CLEANER: "Floor Cleaner",
  LAUNDRY_DETERGENT: "Laundry Detergent",
  GLASS_CLEANER: "Glass Cleaner",
  TOILET_CLEANER: "Toilet Cleaner",
  HAND_WASH: "Hand Wash",
  DISHWASH: "Dishwash",
};

export const CATEGORY_UNIT: Record<ConsumptionCategory, string> = {
  FLOOR_CLEANER: "Ltr",
  LAUNDRY_DETERGENT: "Kg",
  GLASS_CLEANER: "Ltr",
  TOILET_CLEANER: "Ltr",
  HAND_WASH: "Ltr",
  DISHWASH: "Ltr",
};

/** Placeholder institutional price list — see file header. */
export const ESTIMATED_UNIT_PRICE_INR: Record<ConsumptionCategory, number> = {
  FLOOR_CLEANER: 110,
  LAUNDRY_DETERGENT: 90,
  GLASS_CLEANER: 140,
  TOILET_CLEANER: 130,
  HAND_WASH: 160,
  DISHWASH: 150,
};

/**
 * Cleaning-frequency multiplier applied to area-based formulas —
 * `cleaningFrequency` is free text on the survey (e.g. "Daily", "Alternate
 * days", "Weekly"); this is a best-effort keyword match, defaulting to
 * daily (the institutional norm) when the text doesn't match a known
 * pattern, never silently to zero.
 */
export function frequencyMultiplier(cleaningFrequency: string | null | undefined): number {
  const text = (cleaningFrequency ?? "").toLowerCase();
  if (text.includes("week")) return 0.3;
  if (text.includes("alternate") || text.includes("every other")) return 0.6;
  if (text.includes("twice")) return 1.8;
  return 1; // daily — the institutional default when unspecified
}

/**
 * Per-category monthly-quantity formulas. Each takes the subset of survey
 * fields it needs and returns null when it has no usable input at all
 * (never a fabricated non-zero number from missing data).
 */
export const FORMULAS: Record<
  ConsumptionCategory,
  (survey: {
    cleaningAreaSqft: number | null;
    outdoorAreaSqft: number | null;
    floors: number | null;
    rooms: number | null;
    beds: number | null;
    washrooms: number | null;
    kitchens: number | null;
    hasLobby: boolean;
    housekeepingStaff: number | null;
    laundryStaff: number | null;
    cleaningStaff: number | null;
    laundryCapacity: string | null;
    cleaningFrequency: string | null;
  }) => { qty: number; confidence: "LOW" | "MEDIUM" | "HIGH"; basis: string } | null
> = {
  FLOOR_CLEANER: (s) => {
    if (s.cleaningAreaSqft && s.cleaningAreaSqft > 0) {
      const qty = s.cleaningAreaSqft * 0.004 * frequencyMultiplier(s.cleaningFrequency);
      return { qty, confidence: "HIGH", basis: `${s.cleaningAreaSqft} sqft cleaning area × 0.004 Ltr/sqft × cleaning-frequency factor` };
    }
    if (s.rooms || s.floors) {
      const proxyArea = (s.rooms ?? 0) * 180 + (s.floors ?? 0) * 1000;
      const qty = proxyArea * 0.004 * frequencyMultiplier(s.cleaningFrequency);
      return { qty, confidence: "LOW", basis: "estimated from room/floor count — no cleaning area on file" };
    }
    return null;
  },
  LAUNDRY_DETERGENT: (s) => {
    const capacityKg = s.laundryCapacity ? parseFloat(s.laundryCapacity) : NaN;
    if (!Number.isNaN(capacityKg) && capacityKg > 0) {
      const qty = capacityKg * 26 * 0.08;
      return { qty, confidence: "HIGH", basis: `${capacityKg} Kg/day laundry capacity × 26 operating days × 0.08 Kg detergent per Kg laundry` };
    }
    if (s.laundryStaff && s.laundryStaff > 0) {
      const qty = s.laundryStaff * 40;
      return { qty, confidence: "LOW", basis: `estimated from ${s.laundryStaff} laundry staff — no laundry capacity on file` };
    }
    if (s.beds && s.beds > 0) {
      const qty = s.beds * 2.5;
      return { qty, confidence: "LOW", basis: `estimated from ${s.beds} beds (linen load) — no laundry capacity or staff on file` };
    }
    return null;
  },
  GLASS_CLEANER: (s) => {
    if (!s.floors && !s.hasLobby) return null;
    const qty = (s.floors ?? 1) * 1.2 + (s.hasLobby ? 3 : 0);
    return { qty, confidence: s.floors ? "MEDIUM" : "LOW", basis: `${s.floors ?? 0} floors × 1.2 Ltr + lobby glass frontage allowance` };
  },
  TOILET_CLEANER: (s) => {
    if (!s.washrooms || s.washrooms <= 0) return null;
    const qty = s.washrooms * 1.5 * frequencyMultiplier(s.cleaningFrequency);
    return { qty, confidence: "HIGH", basis: `${s.washrooms} washrooms × 1.5 Ltr × cleaning-frequency factor` };
  },
  HAND_WASH: (s) => {
    const touchpoints = (s.washrooms ?? 0) + (s.kitchens ?? 0);
    if (touchpoints === 0 && !s.beds) return null;
    const qty = touchpoints * 1 + (s.beds ?? 0) * 0.06;
    return { qty, confidence: touchpoints ? "MEDIUM" : "LOW", basis: `${s.washrooms ?? 0} washrooms + ${s.kitchens ?? 0} kitchens as dispenser touchpoints, plus occupancy allowance` };
  },
  DISHWASH: (s) => {
    if (!s.kitchens || s.kitchens <= 0) return null;
    const qty = s.kitchens * 8;
    return { qty, confidence: "HIGH", basis: `${s.kitchens} kitchen(s) × 8 Ltr/month (commercial kitchen benchmark)` };
  },
};
