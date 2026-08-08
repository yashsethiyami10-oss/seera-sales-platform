import { getKnowledgeFactoryIndex } from "@/lib/runtime/knowledge-factory-loader";
import type { KnowledgeFactoryRecord } from "@/lib/runtime/types";
import { kfDomainLayer } from "@/lib/gateway/knowledge/authorization";
import type { PermissionLayer } from "@/lib/retrieval/types";

/**
 * MUV AI Gateway — Production Rollout v1.0, Stage 2 (Knowledge Governance
 * for Customer Cutover).
 *
 * Scope, explicitly: the 1,187-KO file-backed MUV Knowledge Factory
 * (`lib/runtime/knowledge-factory-loader.ts`) is the ONE repository that
 * genuinely has no Founder-reviewed customer-visibility decision yet —
 * `lib/gateway/knowledge/authorization.ts`'s `kfDomainLayer()` already
 * says so in its own header ("fails closed until a real, Founder-reviewed
 * per-category classification exists"). The DB-backed KnowledgeItem/
 * ProductIntelligence/ProblemIntelligence/CareIntelligence tables (Module
 * 5) are deliberately OUT of scope here: each of those rows already
 * carries its own real, Founder-set `layer` (PUBLIC/INTERNAL/CONFIDENTIAL)
 * via existing CMS tooling, and Module 5's frozen `runRetrievalPipeline`
 * already enforces it correctly — there is no open governance question to
 * report there, and this manifest must not imply one exists.
 *
 * This module is 100% read-only and has ZERO effect on real enforcement:
 * it reads the same in-memory KO index `kf-source.ts` already reads, and
 * proposes a `proposedCustomerVisibility` value that nothing in the
 * running system consults. Applying any of these proposals to
 * `kfDomainLayer`'s real mapping is a distinct, separately authorized
 * future change — "no automatic promotion," same discipline as
 * `classification-service.ts`.
 */

export type RiskIndicator =
  | "safety" | "medical" | "legal" | "confidential" | "formula" | "internal"
  | "founder" | "pricing" | "operational" | "manufacturing" | "sales" | "financial" | "unpublished";

const RISK_PATTERNS: Record<RiskIndicator, RegExp> = {
  safety: /\b(safety|hazard|caution|warning|toxic|irritant|msds|allergen|poison)\b/i,
  medical: /\b(medical|medicine|diagnos|treat(ment|s)?|therapeutic|clinical|prescription|disease|cure)\b/i,
  legal: /\b(legal|litigation|liability|contract clause|compliance violation|lawsuit|regulatory action)\b/i,
  confidential: /\b(confidential|do not (share|distribute)|restricted access|nda\b)\b/i,
  formula: /\b(formula(tion)?|ingredient ratio|active concentration|raw material spec|recipe|batch composition)\b/i,
  internal: /\b(internal only|internal use|sop\b|standard operating procedure|staff only)\b/i,
  founder: /\b(founder|promoter|board[- ]only|ceo[- ]only)\b/i,
  pricing: /\b(margin|cost price|wholesale price|discount structure|price list|landed cost)\b/i,
  operational: /\b(operations manual|escalation matrix|vendor contract|warehouse process|logistics sop)\b/i,
  manufacturing: /\b(manufactur|production line|batch record|quality control|qc\b|reconciliation)\b/i,
  sales: /\b(sales negotiation|deal terms|institutional (contract|negotiation)|account strategy)\b/i,
  financial: /\b(revenue|profit|p&l|balance sheet|financial statement|ebitda|gross margin)\b/i,
  unpublished: /\b(unpublished|not yet released|embargo(ed)?|pre-launch)\b/i,
};

export type ProposedCustomerVisibility =
  | "CUSTOMER_SAFE_CANDIDATE"
  | "RESTRICTED_NOT_APPROVED"
  | "RESTRICTED_FOUNDER_ONLY"
  | "RESTRICTED_RISK_INDICATORS"
  | "RESTRICTED_DOMAIN_POLICY"
  | "RESTRICTED_GAP_RECORD";

export type KnowledgeManifestEntry = {
  koId: string;
  domain: string;
  title: string;
  currentApprovalStatus: string;
  currentAccessLayer: PermissionLayer;
  proposedCustomerVisibility: ProposedCustomerVisibility;
  reason: string;
  riskIndicators: RiskIndicator[];
  productCategoryLinkage: string | null;
  sourcePath: string;
  isGapRecord: boolean;
};

function detectRiskIndicators(record: KnowledgeFactoryRecord): RiskIndicator[] {
  const haystack = `${record.title}\n${record.category ?? ""}\n${record.content}\n${Object.values(record.fields).join("\n")}`;
  return (Object.keys(RISK_PATTERNS) as RiskIndicator[]).filter((flag) => RISK_PATTERNS[flag].test(haystack));
}

function classifyEntry(record: KnowledgeFactoryRecord): Pick<KnowledgeManifestEntry, "proposedCustomerVisibility" | "reason" | "riskIndicators"> {
  const riskIndicators = detectRiskIndicators(record);

  if (record.isGapRecord) {
    return { proposedCustomerVisibility: "RESTRICTED_GAP_RECORD", reason: "This is a documented gap record (no substantive content yet) — never customer-safe.", riskIndicators };
  }
  if (record.approvalTier !== "APPROVED") {
    return {
      proposedCustomerVisibility: "RESTRICTED_NOT_APPROVED",
      reason: `Approval status is ${record.approvalTier}, not APPROVED — APPROVED is necessary but not sufficient for customer visibility, and this record doesn't even reach that bar yet.`,
      riskIndicators,
    };
  }
  if (record.domainFactory === "FOUNDER_INTELLIGENCE_KF") {
    return { proposedCustomerVisibility: "RESTRICTED_FOUNDER_ONLY", reason: "Founder Intelligence defaults to restricted regardless of approval status (FD-AIC-002).", riskIndicators };
  }
  if (record.domainFactory === "INSTITUTIONAL_SALES_KF") {
    return { proposedCustomerVisibility: "RESTRICTED_DOMAIN_POLICY", reason: "Institutional Sales content (negotiation/account-specific) is never customer-facing.", riskIndicators };
  }
  if (riskIndicators.length > 0) {
    return {
      proposedCustomerVisibility: "RESTRICTED_RISK_INDICATORS",
      reason: `Matched risk indicator(s): ${riskIndicators.join(", ")} — requires explicit Founder review before any customer-visibility proposal.`,
      riskIndicators,
    };
  }
  return {
    proposedCustomerVisibility: "CUSTOMER_SAFE_CANDIDATE",
    reason: "APPROVED, not a gap record, no risk indicators matched, and from a customer-adjacent domain (Product/Marketing/Customer Care) — a CANDIDATE for Founder review only, not an automatic promotion.",
    riskIndicators,
  };
}

function toManifestEntry(record: KnowledgeFactoryRecord): KnowledgeManifestEntry {
  const { proposedCustomerVisibility, reason, riskIndicators } = classifyEntry(record);
  return {
    koId: record.koid,
    domain: record.domainFactory,
    title: record.title,
    currentApprovalStatus: record.approvalTier,
    currentAccessLayer: kfDomainLayer(record.domainFactory),
    proposedCustomerVisibility,
    reason,
    riskIndicators,
    productCategoryLinkage: record.category ?? null,
    sourcePath: record.sourceFile,
    isGapRecord: record.isGapRecord,
  };
}

/** Pure, deterministic, zero I/O beyond the already-cached in-memory KO
 * index — safe to call as often as needed for a Founder review surface. */
export function buildKnowledgeClassificationManifest(): KnowledgeManifestEntry[] {
  return getKnowledgeFactoryIndex().map(toManifestEntry);
}

export type KnowledgeManifestSummary = {
  totalRecords: number;
  byDomain: Record<string, number>;
  byProposedVisibility: Record<ProposedCustomerVisibility, number>;
  customerSafeCandidateCount: number;
  generatedAt: string;
};

export function summarizeManifest(entries: KnowledgeManifestEntry[] = buildKnowledgeClassificationManifest()): KnowledgeManifestSummary {
  const byDomain: Record<string, number> = {};
  const byProposedVisibility: Record<string, number> = {};
  for (const entry of entries) {
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;
    byProposedVisibility[entry.proposedCustomerVisibility] = (byProposedVisibility[entry.proposedCustomerVisibility] ?? 0) + 1;
  }
  return {
    totalRecords: entries.length,
    byDomain,
    byProposedVisibility: byProposedVisibility as Record<ProposedCustomerVisibility, number>,
    customerSafeCandidateCount: byProposedVisibility.CUSTOMER_SAFE_CANDIDATE ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The literal object Stage 2 calls "the classification manifest as a
 * Founder approval requirement" — a single, self-describing payload a
 * Founder-facing surface (or this stage's own report) can present as-is.
 * Returning it changes nothing; it is a report, not an action.
 */
export function getManifestAsFounderApprovalRequirement(): {
  requiresFounderApproval: true;
  summary: KnowledgeManifestSummary;
  candidatesForReview: KnowledgeManifestEntry[];
  fullManifest: KnowledgeManifestEntry[];
} {
  const fullManifest = buildKnowledgeClassificationManifest();
  return {
    requiresFounderApproval: true,
    summary: summarizeManifest(fullManifest),
    candidatesForReview: fullManifest.filter((e) => e.proposedCustomerVisibility === "CUSTOMER_SAFE_CANDIDATE"),
    fullManifest,
  };
}
