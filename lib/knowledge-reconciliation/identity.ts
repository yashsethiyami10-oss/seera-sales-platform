/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Deterministic identity and idempotency (Phase 14). Mirrors
 * `lib/knowledge-publisher/diff.ts`'s `PublishPlan` shape
 * (toInsert/toUpdate/toTouch/toArchive) deliberately, so a future writer
 * can reuse the exact same mental model the Publisher already established
 * — never a competing convention.
 */

import { createHash } from "node:crypto";
import type { AnyProjection, ProposedWriteOperation, RollbackIdentity, TargetModel } from "./types";

/** sha256 of the normalized content — same technique
 * `PublishedKnowledgeRecord.contentHash` already uses, so "did this
 * actually change" stays a single, consistent idiom across the whole
 * Knowledge platform. */
export function computeContentHash(input: unknown): string {
  const stable = JSON.stringify(sortKeysDeep(input));
  return createHash("sha256").update(stable).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function knowledgeItemKey(domain: string, koid: string): string {
  return `kf-${domain.toLowerCase()}-${koid.toLowerCase()}`;
}

export function productIntelligenceKey(productId: string): string {
  return `pi-${productId}`;
}

export function problemIntelligenceKey(category: string, canonicalName: string): string {
  const slug = canonicalName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `problem-${category.toLowerCase()}-${slug}`;
}

export function careIntelligenceKey(workflowName: string): string {
  const slug = workflowName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `care-${slug}`;
}

export type ExistingKeyIndex = {
  knowledgeItem: Map<string, string>; // slug -> id
  productIntelligence: Map<string, string>; // productId -> id
  problemIntelligence: Map<string, string>; // slug -> id
  careIntelligence: Map<string, string>; // slug -> id
};

export function buildExistingKeyIndex(existing: {
  knowledgeItems: { id: string; slug: string }[];
  productIntelligence: { id: string; productId: string }[];
  problemIntelligence: { id: string; slug: string }[];
  careIntelligence: { id: string; slug: string }[];
}): ExistingKeyIndex {
  return {
    knowledgeItem: new Map(existing.knowledgeItems.map((r) => [r.slug, r.id])),
    productIntelligence: new Map(existing.productIntelligence.map((r) => [r.productId, r.id])),
    problemIntelligence: new Map(existing.problemIntelligence.map((r) => [r.slug, r.id])),
    careIntelligence: new Map(existing.careIntelligence.map((r) => [r.slug, r.id])),
  };
}

function existingIdFor(index: ExistingKeyIndex, targetModel: TargetModel, naturalKey: string): string | undefined {
  switch (targetModel) {
    case "KnowledgeItem":
      return index.knowledgeItem.get(naturalKey);
    case "ProductIntelligence":
      return index.productIntelligence.get(naturalKey);
    case "ProblemIntelligence":
      return index.problemIntelligence.get(naturalKey);
    case "CareIntelligence":
      return index.careIntelligence.get(naturalKey);
  }
}

/**
 * Computes the proposed write operation + rollback identity for one
 * projection, given the current (today: always empty) state of its target
 * table. Never performs the write itself — returns data only, per this
 * block's own frozen constraint.
 *
 * `naturalKey` is the natural-key value the existing-row lookup uses
 * (KnowledgeItem.slug, ProductIntelligence.productId, etc.) — distinct from
 * `deterministicKey`, which is this mapper's own internal projection id and
 * may not match the target table's real unique column 1:1 for every model.
 */
export function computeProposedOperation(
  targetModel: TargetModel,
  naturalKey: string,
  contentHash: string,
  previousContentHash: string | null,
  existingIndex: ExistingKeyIndex
): { op: ProposedWriteOperation; rollback: RollbackIdentity; deterministicKey: string } {
  const existingId = existingIdFor(existingIndex, targetModel, naturalKey);
  const deterministicKey = naturalKey;

  if (!existingId) {
    return {
      op: { op: "CREATE", targetModel },
      rollback: { targetModel, deterministicKey, previousVersionId: null },
      deterministicKey,
    };
  }
  if (previousContentHash !== null && previousContentHash === contentHash) {
    return {
      op: { op: "TOUCH", targetModel, existingId },
      rollback: { targetModel, deterministicKey, previousVersionId: existingId },
      deterministicKey,
    };
  }
  return {
    op: { op: "UPDATE", targetModel, existingId },
    rollback: { targetModel, deterministicKey, previousVersionId: existingId },
    deterministicKey,
  };
}

/** Confirms Phase 14's determinism requirement directly: given the same
 * projection list twice, every deterministicKey + contentHash pair must be
 * identical. Used by tests, not by the mapper itself at runtime. */
export function assertDeterministicRerun(runA: AnyProjection[], runB: AnyProjection[]): { stable: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (runA.length !== runB.length) {
    mismatches.push(`projection count differs: ${runA.length} vs ${runB.length}`);
  }
  const byKeyA = new Map(runA.map((p) => [p.deterministicKey, p]));
  const byKeyB = new Map(runB.map((p) => [p.deterministicKey, p]));
  for (const [key, a] of byKeyA) {
    const b = byKeyB.get(key);
    if (!b) {
      mismatches.push(`key ${key} present in run A, missing in run B`);
      continue;
    }
    if (computeContentHash(a) !== computeContentHash(b)) {
      mismatches.push(`key ${key} content differs between runs`);
    }
  }
  return { stable: mismatches.length === 0, mismatches };
}
