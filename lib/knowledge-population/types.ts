/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 *
 * This module is deliberately separate from `lib/knowledge-reconciliation/`
 * (the Block 2A mapper), which remains frozen and read-only per its own
 * commit. This module CONSUMES the mapper's projections and performs the
 * actual, real, idempotent Prisma writes — the one thing Block 2A's own
 * contract explicitly forbids itself from doing.
 *
 * Every write in this module:
 *  - never sets `layer: PUBLIC` (no automatic CUSTOMER_SAFE promotion —
 *    Block 2C Section 8's frozen rule)
 *  - never sets a version `status` above DRAFT (publishing is a distinct,
 *    separately-authorized, staff-gated action via the existing
 *    `actions/*-intelligence.ts` Server Actions, never this writer)
 *  - is wrapped in one transaction per target item (Block 1 Section 15's
 *    frozen transaction-boundary design)
 *  - is idempotent: a natural-key lookup decides CREATE vs UPDATE vs TOUCH
 *    before any write, mirroring `lib/knowledge-publisher/diff.ts`'s
 *    established pattern
 */

export type WriteAction = "CREATED" | "UPDATED" | "TOUCHED" | "ARCHIVED" | "SKIPPED";

export type LayerWriteResult = {
  deterministicKey: string;
  targetModel: string;
  action: WriteAction;
  recordId: string | null;
  reason: string;
};

export type PopulationReport = {
  mode: "PUBLISH";
  startedAt: string;
  durationMs: number;

  knowledgeItem: { created: number; updated: number; touched: number; archived: number; skipped: number; results: LayerWriteResult[] };
  productIntelligence: { created: number; updated: number; touched: number; archived: number; skipped: number; results: LayerWriteResult[] };
  problemIntelligence: { created: number; updated: number; touched: number; archived: number; skipped: number; results: LayerWriteResult[] };
  careIntelligence: { created: number; updated: number; touched: number; archived: number; skipped: number; results: LayerWriteResult[] };

  errors: { deterministicKey: string; targetModel: string; message: string }[];
};
