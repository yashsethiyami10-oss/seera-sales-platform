import {
  RULES_VERSION,
  CATEGORY_LABEL,
  CATEGORY_UNIT,
  ESTIMATED_UNIT_PRICE_INR,
  FORMULAS,
  type ConsumptionCategory,
} from "./consumption-rules";

type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface ConsumptionSurveyInput {
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
  monthlyConsumptionKnown: boolean;
  currentFloorCleaner: string | null;
  currentDetergent: string | null;
  currentGlassCleaner: string | null;
  currentToiletCleaner: string | null;
  currentHandWash: string | null;
  currentDishwash: string | null;
}

export interface CategoryEstimate {
  category: ConsumptionCategory;
  label: string;
  unit: string;
  estimatedMonthlyQty: number | null;
  monthlyOpportunityValueInr: number | null;
  annualOpportunityValueInr: number | null;
  confidence: Confidence;
  currentProduct: string | null;
  isCrossSellOpportunity: boolean;
  reasoning: string;
}

export interface ConsumptionInsight {
  type: "UNDER_CONSUMPTION" | "OUTSOURCING" | "EXPANSION" | "CROSS_SELL" | "UPSELL";
  category?: ConsumptionCategory;
  summary: string;
  reasoning: string;
  confidence: Confidence;
}

export interface QuantitySuggestion {
  category: ConsumptionCategory;
  label: string;
  qty: number;
  unit: string;
}

export interface ConsumptionEstimateResult {
  rulesVersion: string;
  estimates: CategoryEstimate[];
  potentialMonthlyOpportunityInr: number;
  potentialAnnualOpportunityInr: number;
  suggestedTrialQuantity: QuantitySuggestion[];
  suggestedFirstOrder: QuantitySuggestion[];
  insights: ConsumptionInsight[];
  overallConfidence: Confidence;
}

const CATEGORIES: ConsumptionCategory[] = ["FLOOR_CLEANER", "LAUNDRY_DETERGENT", "GLASS_CLEANER", "TOILET_CLEANER", "HAND_WASH", "DISHWASH"];

/**
 * Module 6 — MUV AI Consumption Intelligence. A pure, rule-based function
 * (no Prisma/network dependency, so it's independently testable): given
 * structured survey answers, estimates monthly consumption per product
 * category, prices the gap using the placeholder institutional rate card in
 * consumption-rules.ts, and generates explained, confidence-labeled
 * insights. Every number traces back to a stated `reasoning`; every
 * category the survey didn't give enough data for is null, never guessed.
 */
export function generateConsumptionEstimate(survey: ConsumptionSurveyInput): ConsumptionEstimateResult {
  const currentByCategory: Record<ConsumptionCategory, string | null> = {
    FLOOR_CLEANER: survey.currentFloorCleaner,
    LAUNDRY_DETERGENT: survey.currentDetergent,
    GLASS_CLEANER: survey.currentGlassCleaner,
    TOILET_CLEANER: survey.currentToiletCleaner,
    HAND_WASH: survey.currentHandWash,
    DISHWASH: survey.currentDishwash,
  };

  const estimates: CategoryEstimate[] = CATEGORIES.map((category) => {
    const formulaResult = FORMULAS[category](survey);
    const currentProduct = currentByCategory[category];
    const isCrossSellOpportunity = !currentProduct || currentProduct.trim() === "";

    if (!formulaResult) {
      return {
        category, label: CATEGORY_LABEL[category], unit: CATEGORY_UNIT[category],
        estimatedMonthlyQty: null, monthlyOpportunityValueInr: null, annualOpportunityValueInr: null,
        confidence: "LOW", currentProduct: currentProduct ?? null, isCrossSellOpportunity,
        reasoning: "Not enough survey data to estimate this category.",
      };
    }

    const monthlyValue = formulaResult.qty * ESTIMATED_UNIT_PRICE_INR[category];
    return {
      category, label: CATEGORY_LABEL[category], unit: CATEGORY_UNIT[category],
      estimatedMonthlyQty: Math.round(formulaResult.qty * 10) / 10,
      monthlyOpportunityValueInr: Math.round(monthlyValue),
      annualOpportunityValueInr: Math.round(monthlyValue * 12),
      confidence: formulaResult.confidence,
      currentProduct: currentProduct ?? null,
      isCrossSellOpportunity,
      reasoning: formulaResult.basis,
    };
  });

  const potentialMonthlyOpportunityInr = estimates.reduce((sum, e) => sum + (e.monthlyOpportunityValueInr ?? 0), 0);
  const potentialAnnualOpportunityInr = potentialMonthlyOpportunityInr * 12;

  const estimable = estimates.filter((e): e is CategoryEstimate & { estimatedMonthlyQty: number } => e.estimatedMonthlyQty !== null);
  // A trial should be small enough to approve quickly but large enough to
  // prove out — 15% of one month's estimated use, rounded to a usable size.
  const suggestedTrialQuantity: QuantitySuggestion[] = estimable.map((e) => ({
    category: e.category, label: e.label, unit: e.unit,
    qty: Math.max(1, Math.round(e.estimatedMonthlyQty * 0.15 * 10) / 10),
  }));
  const suggestedFirstOrder: QuantitySuggestion[] = estimable.map((e) => ({
    category: e.category, label: e.label, unit: e.unit, qty: Math.ceil(e.estimatedMonthlyQty),
  }));

  const insights: ConsumptionInsight[] = [];
  for (const e of estimates) {
    if (!e.estimatedMonthlyQty) continue;
    if (e.isCrossSellOpportunity) {
      insights.push({
        type: "CROSS_SELL", category: e.category, confidence: e.confidence,
        summary: `No current ${e.label} vendor on file`,
        reasoning: `The facility shows estimated demand for ${e.label} (${e.reasoning}) but no incumbent product was recorded — a clean cross-sell opportunity with no displacement needed.`,
      });
    } else {
      insights.push({
        type: "UPSELL", category: e.category, confidence: e.confidence,
        summary: `Currently using "${e.currentProduct}" for ${e.label}`,
        reasoning: `An incumbent product is already in place; position MUV's ${e.label} as an upgrade at the next trial or contract renewal.`,
      });
    }
  }
  if (!survey.monthlyConsumptionKnown) {
    insights.push({
      type: "UNDER_CONSUMPTION", confidence: "LOW",
      summary: "Customer does not track current monthly consumption",
      reasoning: "No baseline consumption figure was available, so actual usage could be materially below what the facility's scale would justify. Recommend a short usage audit during the trial before finalizing order quantities.",
    });
  }
  if ((survey.laundryStaff ?? 0) === 0 && (survey.beds ?? 0) > 0) {
    insights.push({
      type: "OUTSOURCING", category: "LAUNDRY_DETERGENT", confidence: "MEDIUM",
      summary: "No laundry staff recorded despite guest/bed capacity",
      reasoning: "This facility likely outsources laundry to a third party. If MUV can supply that outsourced vendor directly, or the customer insources in future, this is a monitorable expansion path — not a current-quarter order.",
    });
  }
  if ((survey.floors ?? 0) >= 3 || (survey.rooms ?? 0) >= 40) {
    insights.push({
      type: "EXPANSION", confidence: "LOW",
      summary: "Facility scale suggests multi-site or future-phase potential",
      reasoning: `${survey.floors ?? "Several"} floors / ${survey.rooms ?? "many"} rooms indicates an established, larger operation — worth asking whether the group operates other properties MUV could also serve.`,
    });
  }

  const confidences = estimable.map((e) => e.confidence);
  const overallConfidence: Confidence =
    confidences.length === 0 ? "LOW" : confidences.every((c) => c === "HIGH") ? "HIGH" : confidences.some((c) => c !== "LOW") ? "MEDIUM" : "LOW";

  return {
    rulesVersion: RULES_VERSION, estimates, potentialMonthlyOpportunityInr, potentialAnnualOpportunityInr,
    suggestedTrialQuantity, suggestedFirstOrder, insights, overallConfidence,
  };
}
