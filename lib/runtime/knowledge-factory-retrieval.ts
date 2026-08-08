import { getKnowledgeFactoryIndex } from "./knowledge-factory-loader";
import type { KnowledgeFactoryRecord, KnowledgeFactorySourceType, KOApprovalTier, RuntimeKnowledgeResult } from "./types";

/**
 * MUV AI — Stage 6D, Knowledge Factory Integration. Deterministic keyword/
 * KOID search over the real, file-backed Knowledge Factory index built by
 * `knowledge-factory-loader.ts`. Same "no model, fixed scoring, every
 * result carries its literal matched evidence" discipline as Module 5's
 * `lib/retrieval/ranking.ts` and Module 6's `eq-engine.ts` — this is
 * keyword/field matching, never a real embedding similarity search (same
 * honest limitation already documented for the 4 DB-backed sources in
 * `semantic-retrieval.ts`).
 *
 * Every result is mapped into the exact `RetrievalResult` shape Module 5's
 * `RetrievalResult` type defines (via `RuntimeKnowledgeResult`), reusing
 * `sourceType: "KNOWLEDGE"` rather than widening Module 5's own type union
 * — this keeps Module 5/6's frozen type contracts completely untouched.
 * The KO's REAL repository identity (which of the 4 Knowledge Factories,
 * its real KOID, its real approval status, its real source file) is
 * preserved in `internalMetadata`, which every runtime module already
 * treats as an opaque, staff-only bag — nothing here is lost, only kept out
 * of Module 5/6's own strict fields, per "preserve repository boundaries."
 */

const BASE_AUTHORITY: Record<KnowledgeFactorySourceType, number> = {
  PRODUCT_KF: 0.85,
  MARKETING_KF: 0.8,
  INSTITUTIONAL_SALES_KF: 0.8,
  // Deliberately the lowest base weight — FD-AIC-002's own clarifying
  // nuance: "Founder Intelligence may guide reasoning, but may not
  // overwrite verified domain facts." Never treated as equal-authority to
  // the domain KFs for factual arbitration (see conflict-resolution
  // -runtime.ts's dedicated guard).
  FOUNDER_INTELLIGENCE_KF: 0.6,
  // Stage 8 — deliberately BELOW Marketing/Institutional Sales (0.8). The
  // Customer Care Knowledge Factory is ~100% Citation-only KOs pointing
  // back into those repositories (see its own CUSTOMER_CARE_MASTER.md) —
  // it should never outrank the repository it is citing in a conflict; a
  // citation losing to its own source is correct, not a bug. Still above
  // Founder Intelligence (0.6) because it is real, Founder-Review-Ready
  // organizing content, not advisory reasoning.
  CUSTOMER_CARE_KF: 0.75,
};

const TIER_MULTIPLIER: Record<KOApprovalTier, number> = {
  APPROVED: 1.0,
  REVIEW_READY: 0.95,
  DRAFT: 0.7,
  OPEN_PENDING_FOUNDER_INPUT: 0.4,
  UNKNOWN: 0.6,
};

export function authorityWeightFor(record: Pick<KnowledgeFactoryRecord, "domainFactory" | "approvalTier" | "isGapRecord">): number {
  const base = BASE_AUTHORITY[record.domainFactory] * TIER_MULTIPLIER[record.approvalTier];
  return record.isGapRecord ? Number((base * 0.1).toFixed(3)) : Number(base.toFixed(3));
}

export type KFSearchQuery = {
  keywords?: string;
  koid?: string;
  domains: KnowledgeFactorySourceType[];
  limit?: number;
};

const STOPWORDS = new Set(["a", "an", "the", "is", "it", "of", "to", "for", "and", "or", "in", "on", "this", "that", "with", "do", "does", "i", "my", "me"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + "…";
}

export function searchKnowledgeFactories(query: KFSearchQuery): RuntimeKnowledgeResult[] {
  if (!query.domains.length) return [];
  const index = getKnowledgeFactoryIndex();
  const scoped = index.filter((r) => query.domains.includes(r.domainFactory));
  const limit = Math.max(1, Math.min(query.limit ?? 10, 50));

  if (query.koid) {
    const exact = scoped.find((r) => r.koid.toUpperCase() === query.koid!.toUpperCase());
    if (!exact) return [];
    return [toRuntimeResult(exact, 100, ["koid"], ["KOID_LOOKUP", "KNOWLEDGE_FACTORY_FILE_INDEX"])];
  }

  const words = tokenize(query.keywords ?? "");
  if (!words.length) return [];

  const scored: { record: KnowledgeFactoryRecord; score: number; matchedFields: string[] }[] = [];
  for (const record of scoped) {
    const titleLower = record.title.toLowerCase();
    const categoryLower = (record.category ?? "").toLowerCase();
    const contentLower = record.content.toLowerCase();
    let score = 0;
    const matchedFields: string[] = [];

    for (const w of words) {
      if (titleLower.includes(w)) {
        score += 40;
        if (!matchedFields.includes("title")) matchedFields.push("title");
      }
      if (categoryLower.includes(w)) {
        score += 20;
        if (!matchedFields.includes("category")) matchedFields.push("category");
      }
      if (contentLower.includes(w)) {
        score += 15;
        if (!matchedFields.includes("content")) matchedFields.push("content");
      }
    }

    // Deliberately NOT capped here — capping before sorting was a real bug
    // found during this stage's own verification: many KOs within the
    // same product/chapter share an identical title prefix (e.g. every
    // Dishwash Gel KO's title starts with "MUV Dishwash Gel™"), so once
    // title-match score alone reached the old 100 cap, additional
    // content-word specificity (e.g. "LABSA" appearing in exactly one
    // KO's real content) could no longer change the ranking — ties were
    // broken by array/file order, not relevance. The raw, uncapped score
    // is what orders results; only the displayed `confidence` is clamped
    // to the conventional 0–100 range afterward.
    if (score > 0) scored.push({ record, score, matchedFields });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => toRuntimeResult(s.record, Math.min(100, s.score), s.matchedFields, ["KNOWLEDGE_FACTORY_FILE_INDEX"]));
}

function toRuntimeResult(record: KnowledgeFactoryRecord, score: number, matchedFields: string[], retrievalMethods: RuntimeKnowledgeResult["retrievalMethods"]): RuntimeKnowledgeResult {
  const versionRaw = record.fields["Version"];
  const versionNumber = versionRaw ? Number.parseFloat(versionRaw) : null;

  return {
    sourceType: "KNOWLEDGE",
    recordId: record.koid,
    versionId: versionRaw ?? null,
    title: record.title,
    summary: record.isGapRecord ? `[Documented gap — no content yet] ${truncate(record.content || record.fields["Scope"] || "", 200)}` : truncate(record.content, 300),
    layer: "INTERNAL",
    versionNumber: Number.isFinite(versionNumber) ? versionNumber : null,
    status: record.approvalTier,
    priorityScore: score,
    relationship: null,
    matchedFields,
    confidence: score,
    retrievedAt: new Date().toISOString(),
    sourceReferences: record.relationships.map((koid) => ({ type: "KNOWLEDGE" as const, id: koid, linkKind: "direct" as const })),
    internalMetadata: {
      koFactoryDomain: record.domainFactory,
      koid: record.koid,
      isGapRecord: record.isGapRecord,
      sourceFile: record.sourceFile,
      fields: record.fields,
    },
    retrievalMethods,
    authorityWeight: authorityWeightFor(record),
  };
}
