import { prisma } from "@/lib/prisma";
import type { NormalizedKnowledgeCandidate } from "./types";

export type ExistingRecordSummary = {
  id: string;
  sourceId: string;
  contentHash: string;
  publicationStatus: string;
};

export type PublishPlan = {
  toInsert: NormalizedKnowledgeCandidate[];
  /** Existing rows whose content changed, OR whose row was previously
   * ARCHIVED/SOURCE_MISSING and has now reappeared (revived) — both cases
   * need a real write, so both are handled identically by publish.ts. */
  toUpdate: { existingId: string; candidate: NormalizedKnowledgeCandidate }[];
  /** Existing row ids that matched with an identical content hash and an
   * already-active status — "must not be rewritten unnecessarily" means
   * only `lastSeenAt` is touched for these, never the content columns. */
  toTouch: string[];
  /** Existing rows whose source KO was not rediscovered this run —
   * candidates for the deletion policy (archive, never hard-delete). */
  toArchive: ExistingRecordSummary[];
};

/**
 * MUV Knowledge Publisher™ — the diffing step shared by both dry-run
 * (compute only) and live publish (compute, then write) modes, so the
 * "what would change" logic is defined exactly once.
 */
export async function computePublishPlan(candidates: NormalizedKnowledgeCandidate[]): Promise<PublishPlan> {
  const existingRows: ExistingRecordSummary[] = await prisma.publishedKnowledgeRecord.findMany({
    select: { id: true, sourceId: true, contentHash: true, publicationStatus: true },
  });
  const existingBySourceId = new Map(existingRows.map((r) => [r.sourceId, r]));
  const discoveredSourceIds = new Set(candidates.map((c) => c.sourceId));

  const toInsert: NormalizedKnowledgeCandidate[] = [];
  const toUpdate: PublishPlan["toUpdate"] = [];
  const toTouch: string[] = [];

  for (const candidate of candidates) {
    const existing = existingBySourceId.get(candidate.sourceId);
    if (!existing) {
      toInsert.push(candidate);
      continue;
    }
    const wasInactive = existing.publicationStatus === "ARCHIVED" || existing.publicationStatus === "SOURCE_MISSING";
    if (existing.contentHash !== candidate.contentHash || wasInactive) {
      toUpdate.push({ existingId: existing.id, candidate });
    } else {
      toTouch.push(existing.id);
    }
  }

  const toArchive = existingRows.filter(
    (r) => !discoveredSourceIds.has(r.sourceId) && r.publicationStatus !== "ARCHIVED" && r.publicationStatus !== "SOURCE_MISSING"
  );

  return { toInsert, toUpdate, toTouch, toArchive };
}
