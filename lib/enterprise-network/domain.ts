import { AppError, ConflictError } from "@/lib/errors";

export const NETWORK_PARTNER_TYPES = [
  "FRANCHISE", "DISTRIBUTOR", "SUPER_STOCKIST", "DEALER", "OUTLET", "INSTITUTIONAL_PARTNER",
] as const;

export const PARTNER_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["ONBOARDING", "ARCHIVED"],
  ONBOARDING: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["ONBOARDING", "PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "ONBOARDING"],
  APPROVED: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "INACTIVE", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  INACTIVE: ["ACTIVE", "TERMINATED", "ARCHIVED"],
  TERMINATED: ["ARCHIVED"],
  ARCHIVED: [],
};

export const AGREEMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["DRAFT", "PENDING_APPROVAL"],
  PENDING_APPROVAL: ["UNDER_REVIEW", "APPROVED"],
  APPROVED: ["PENDING_EXECUTION"],
  PENDING_EXECUTION: ["ACTIVE"],
  ACTIVE: ["EXPIRED", "TERMINATED", "SUPERSEDED"],
  EXPIRED: [],
  TERMINATED: [],
  SUPERSEDED: [],
};

export const FINALIZED_STATES = new Set([
  "APPROVED", "PENDING_EXECUTION", "ACTIVE", "EXPIRED", "TERMINATED", "SUPERSEDED", "FINALIZED", "REVERSED",
]);

export function assertTransition(current: string, next: string, graph: Readonly<Record<string, readonly string[]>>) {
  if (!graph[current]?.includes(next)) throw new ConflictError(`Invalid lifecycle transition from ${current} to ${next}`);
}

export function assertEditable(status: string) {
  if (FINALIZED_STATES.has(status)) throw new ConflictError("Finalized records are immutable; create a new version or correction");
}

export type CalculationRule = {
  mode: "FIXED" | "PERCENTAGE" | "TIERED";
  fixedAmount?: number;
  ratePercent?: number;
  tiers?: Array<{ upTo?: number; ratePercent: number }>;
  minimum?: number;
  cap?: number;
  excluded?: boolean;
};

export function calculateCommercialAmount(basis: number, rule: CalculationRule) {
  if (!Number.isFinite(basis) || basis < 0) throw new AppError("Calculation basis must be a non-negative number", 422);
  if (rule.excluded) return { amount: 0, trace: { basis, excluded: true } };
  let amount = 0;
  if (rule.mode === "FIXED") {
    if (!Number.isFinite(rule.fixedAmount)) throw new AppError("Fixed amount is required", 422);
    amount = rule.fixedAmount!;
  } else if (rule.mode === "PERCENTAGE") {
    if (!Number.isFinite(rule.ratePercent)) throw new AppError("Percentage rate is required", 422);
    amount = basis * rule.ratePercent! / 100;
  } else {
    if (!rule.tiers?.length) throw new AppError("At least one tier is required", 422);
    let previousLimit = 0;
    for (const tier of rule.tiers) {
      if (tier.ratePercent < 0 || (tier.upTo != null && tier.upTo <= previousLimit)) {
        throw new AppError("Tier configuration is invalid", 422);
      }
      if (tier.upTo != null) previousLimit = tier.upTo;
    }
    let remaining = basis;
    let floor = 0;
    for (const tier of rule.tiers) {
      const slice = tier.upTo == null ? remaining : Math.min(remaining, tier.upTo - floor);
      amount += Math.max(0, slice) * tier.ratePercent / 100;
      remaining -= Math.max(0, slice);
      floor = tier.upTo ?? floor;
      if (remaining <= 0) break;
    }
  }
  if (rule.minimum != null) amount = Math.max(amount, rule.minimum);
  if (rule.cap != null) amount = Math.min(amount, rule.cap);
  amount = Math.round((amount + Number.EPSILON) * 100) / 100;
  return { amount, trace: { basis, mode: rule.mode, rule, amount } };
}
