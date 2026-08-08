/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) shared types.
 *
 * `KnowledgeSourceType` is a plain string union, not a Prisma enum — new
 * source types (the spec's own "Future Sources") should never require a
 * migration just to be referenced in TypeScript, matching the same
 * extensibility reasoning behind `KnowledgeRetrievalLog.sourceTypesQueried`
 * being `String[]` in the schema.
 */
export type KnowledgeSourceType = "KNOWLEDGE" | "PRODUCT_INTELLIGENCE" | "PROBLEM_INTELLIGENCE" | "CARE_INTELLIGENCE";

export const ALL_SOURCE_TYPES: KnowledgeSourceType[] = ["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE"];

export type PermissionLayer = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";

/**
 * "Version Resolution" — what slice of a record's version history to
 * retrieve. `draft`/`review`/`archived`/`history` are only ever honored
 * for a caller whose resolved clearance allows non-published access
 * (STAFF/ADMIN) — enforced in lib/retrieval/sources.ts's statusesFor(),
 * never left to the caller's word alone.
 */
export type VersionSelectorMode = "published" | "latest" | "specific" | "draft" | "review" | "archived" | "history";

export type VersionSelector = {
  mode: VersionSelectorMode;
  /** Only meaningful when mode === "specific". */
  versionId?: string;
};

/**
 * The caller's actual, server-derived retrieval clearance — never
 * accepted from the client. See lib/retrieval/permissions.ts's
 * resolveCallerClearance(), which is the only place this type is
 * constructed from a real session.
 */
export type CallerClearance = {
  role: "ANONYMOUS" | "CUSTOMER" | "STAFF" | "ADMIN";
  maxLayer: PermissionLayer;
  canAccessNonPublished: boolean;
};

/** "Retrieval Context" — the structured query shape every pipeline stage
 * operates on. */
export type RetrievalContext = {
  knowledgeId?: string;
  slug?: string;
  tags?: string[];
  keywords?: string;
  category?: string;
  productId?: string;
  problemIntelligenceId?: string;
  careIntelligenceId?: string;
  sourceTypes?: KnowledgeSourceType[];
  versionSelector?: VersionSelector;
  limit?: number;
};

/** A single structured cross-module reference — never the referenced
 * record's full content, per "the resolver must return structured
 * references... never duplicate content." */
export type SourceReference = {
  type: KnowledgeSourceType | "PRODUCT";
  id: string;
  label?: string;
  /** "direct" = a real foreign key/relation exists; "via-product" = both
   * records reference the same Product, no direct relation between them. */
  linkKind: "direct" | "via-product";
};

/** "Retrieval Result Model" — the normalized shape every source adapter
 * (lib/retrieval/sources.ts) maps its own module's rows into. */
export type RetrievalResult = {
  sourceType: KnowledgeSourceType;
  recordId: string;
  versionId: string | null;
  title: string;
  summary: string | null;
  layer: PermissionLayer;
  versionNumber: number | null;
  status: string | null;
  priorityScore: number;
  relationship: string | null;
  matchedFields: string[];
  /** Deterministic 0–100 score derived from matchedFields/ranking weights
   * — never an AI-generated confidence. Set by lib/retrieval/ranking.ts,
   * 0 before ranking runs. */
  confidence: number;
  retrievedAt: string;
  sourceReferences: SourceReference[];
  /** Stripped to null for any caller without canAccessNonPublished — see
   * lib/retrieval/sources.ts. */
  internalMetadata: Record<string, unknown> | null;
};

export type RetrievalScopeValidation = {
  valid: boolean;
  reason?: string;
  effectiveClearance: CallerClearance;
  effectiveSourceTypes: KnowledgeSourceType[];
  effectiveVersionSelector: VersionSelector;
};
