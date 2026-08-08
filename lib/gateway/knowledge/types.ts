/**
 * MUV AI Gateway (Phase 5.2, Module 3) — Knowledge API shared types.
 *
 * This is the ONE normalized shape every Knowledge API function returns,
 * regardless of which underlying source actually answered the query
 * (Module 5's DB-backed Knowledge Retrieval Core, the file-backed MUV
 * Knowledge Factory index, or a live Prisma catalog lookup for
 * availability). A caller of this API (the Experience Orchestrator, or
 * whatever future module wires it in) never needs to know which of those
 * three answered — exactly the same "the frontend must never know which
 * provider is active" discipline Module 2 established, applied here to
 * knowledge sources instead of LLM providers.
 */

export type KnowledgeApiSourceType =
  | "PRODUCT_KNOWLEDGE"
  | "POLICY"
  | "FAQ"
  | "SAFETY"
  | "USAGE"
  | "CARE_GUIDE"
  | "INSTITUTIONAL"
  | "AVAILABILITY"
  | "GENERAL_KNOWLEDGE";

/** "LIVE" marks a result that came from the real-time product catalog
 * (Prisma `Product`/`ProductVariant`/`Inventory`), never from static
 * Knowledge Factory content — the concrete marker of FR-001 (Knowledge
 * Factory Commercial Separation) at the API boundary: a caller can tell
 * "this fact is live" from "this fact is documented knowledge" just by
 * checking this field, without inspecting `sourceType`. */
export type KnowledgeApiGovernanceLayer = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "LIVE";

export type KnowledgeApiGovernance = {
  layer: KnowledgeApiGovernanceLayer;
  /** The Knowledge Factory's own literal approval status text
   * (APPROVED/REVIEW_READY/DRAFT/OPEN_PENDING_FOUNDER_INPUT/UNKNOWN), or
   * `null` for DB-backed/live results, which have no such concept. */
  approvalTier: string | null;
  /** True only for a KO the Knowledge Factory itself explicitly marks as
   * a documented gap ("this isn't written yet") — real, honest content,
   * never presented as grounding for a factual claim. */
  isGapRecord: boolean;
  escalationRequired: boolean;
};

export type KnowledgeApiFreshness = {
  versionNumber: number | null;
  status: string | null;
  retrievedAt: string;
};

/** Only ever populated by `fetchAvailability()`, and only from a live
 * catalog read — never from Knowledge Factory content, per FR-001. */
export type KnowledgeApiCommercialVariant = {
  variantId: string;
  sku: string;
  size: string;
  price: number;
  mrp: number;
  inStock: boolean;
  quantity: number;
};

export type KnowledgeApiResult = {
  sourceId: string;
  sourceType: KnowledgeApiSourceType;
  title: string;
  content: string;
  /** Deterministic 0-100, never AI-estimated — reused directly from
   * whichever underlying engine computed it (Module 5's ranking weights,
   * or Stage 6D's keyword scoring), or set to 100 for a direct, unranked
   * live/verified lookup (e.g. a specific product's own `safety` field). */
  confidence: number;
  /** 0-100. For most results this equals `confidence`; kept as a
   * separate field because relevance (how well this matched the query)
   * and confidence (how much to trust the content itself) are
   * conceptually different signals that happen to share a formula today
   * — a future engine could score them independently without a shape
   * change here. */
  relevanceScore: number;
  productId: string | null;
  categoryId: string | null;
  freshness: KnowledgeApiFreshness;
  governance: KnowledgeApiGovernance;
  /** Present only on `sourceType: "AVAILABILITY"` results. */
  commercial?: KnowledgeApiCommercialVariant[];
};

export type KnowledgeApiStatus = "OK" | "EMPTY" | "LOW_CONFIDENCE" | "INVALID_QUERY";

/**
 * Every Knowledge API function returns this, never a bare array and
 * never a thrown exception for "nothing found" — the concrete mechanism
 * behind "if verified knowledge is unavailable, return a structured
 * 'knowledge unavailable' result instead of fabricating an answer."
 * `status !== "OK"` is the caller's (or a future LLM grounding step's)
 * signal to say "I don't have verified information on this" rather than
 * inventing one.
 */
export type KnowledgeApiResponse = {
  status: KnowledgeApiStatus;
  message: string;
  results: KnowledgeApiResult[];
};
