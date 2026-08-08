import type { KnowledgePublicationStatus } from "@prisma/client";

/**
 * MUV Knowledge Publisher™ — shared types.
 *
 * Frozen architecture: Knowledge Factory -> Publisher -> Runtime Database
 * -> Embeddings/Search Index -> Knowledge API -> AI Gateway. This module is
 * the Publisher — a one-directional, read-the-files/write-the-database
 * pipeline. It never reads from `PublishedKnowledgeRecord`'s own table to
 * decide what to author (that would make the database a second source of
 * truth); it only reads it to diff against, so a re-run is idempotent.
 */

export type ValidationIssueLevel = "ERROR" | "WARNING";

export type ValidationIssue = {
  level: ValidationIssueLevel;
  /** Domain-qualified stable id ("{domain}:{koid}") even for a rejected
   * record with a malformed koid, so every issue is still traceable to
   * roughly where it came from. */
  sourceId: string;
  koid: string;
  domain: string;
  sourceFile: string;
  message: string;
};

/** The one, fully-normalized shape every valid Knowledge Object is mapped
 * into before it is ever compared against or written to the database —
 * matches `PublishedKnowledgeRecord`'s own columns 1:1 (minus DB-managed
 * fields like `id`/`version`/timestamps), so `publish.ts` never has to
 * re-derive anything `normalize.ts` already decided. */
export type NormalizedKnowledgeCandidate = {
  sourceId: string;
  koid: string;
  domain: string;
  title: string;
  content: string;
  sourcePath: string;
  /** Always null — see the schema's own comment on
   * `PublishedKnowledgeRecord.productId` for why this is never inferred. */
  productId: null;
  category: string | null;
  approvalStatus: string;
  publicationStatus: KnowledgePublicationStatus;
  accessLayer: "INTERNAL";
  contentHash: string;
  isGapRecord: boolean;
  escalationRequired: boolean;
  relationships: string[];
  rawFields: Record<string, string>;
  locale: "en";
};

export type PublishMode = "DRY_RUN" | "PUBLISH";

export type DomainTotals = {
  discovered: number;
  valid: number;
  rejected: number;
  published: number;
};

export type PublishReport = {
  mode: PublishMode;
  startedAt: string;
  durationMs: number;

  discovered: number;
  validCount: number;
  rejected: number;

  inserted: number;
  updated: number;
  unchanged: number;
  archived: number;

  embeddingsCreated: number;
  embeddingsUpdated: number;
  embeddingsSkipped: number;

  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  perDomainTotals: Record<string, DomainTotals>;
};
