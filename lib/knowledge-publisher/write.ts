import { prisma } from "@/lib/prisma";
import type { PublishPlan } from "./diff";

/**
 * MUV Knowledge Publisher™ — Stage 4/10: Publish + Rollback safety.
 *
 * Every write for one publish run happens inside a single interactive
 * transaction — if any operation throws partway through (a constraint
 * violation, a connection drop), Prisma rolls back everything in this
 * function, so a failed publish can never leave the runtime database
 * half-updated. Embeddings are deliberately NOT inside this transaction
 * (see `publisher.ts`) — an embedding failure must never undo an
 * otherwise-successful record publish.
 *
 * `toInsert` uses one batched `createMany` rather than N individual
 * `create()` calls — every inserted row is a flat, independent record
 * (no nested writes), so there is no correctness reason to pay N round
 * trips instead of one; `toUpdate` still needs per-row `update()` calls
 * since each row's data genuinely differs. The transaction's own timeout
 * is raised well above Prisma's 5s default — the Knowledge Factory's real
 * size (1,187 Knowledge Objects today) means a first publish is a
 * thousand-plus-row operation, not a request-sized one.
 */
// Phase 5.2.1 — raised from 120s: a real run where every existing row
// needed the per-row `toUpdate` path (e.g. reviving a large batch from
// ARCHIVED) took long enough to hit the previous limit. This is an
// operational/robustness parameter only — it does not change what the
// Publisher decides or computes, only how much time one transaction may
// take. The underlying per-row `toUpdate` loop's own scaling limit is a
// separate, already-tracked technical-debt item, not addressed here.
const TRANSACTION_TIMEOUT_MS = 300_000;
const TRANSACTION_MAX_WAIT_MS = 15_000;

export async function applyPublishPlan(plan: PublishPlan, now: Date): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      if (plan.toInsert.length > 0) {
        await tx.publishedKnowledgeRecord.createMany({
          data: plan.toInsert.map((c) => ({
            sourceId: c.sourceId,
            koid: c.koid,
            domain: c.domain,
            title: c.title,
            content: c.content,
            sourcePath: c.sourcePath,
            productId: c.productId,
            category: c.category,
            approvalStatus: c.approvalStatus,
            publicationStatus: c.publicationStatus,
            accessLayer: c.accessLayer,
            version: 1,
            contentHash: c.contentHash,
            isGapRecord: c.isGapRecord,
            escalationRequired: c.escalationRequired,
            relationships: c.relationships,
            rawFields: c.rawFields,
            locale: c.locale,
            publishedAt: c.publicationStatus === "PUBLISHED" ? now : null,
            lastSeenAt: now,
          })),
        });
      }

      for (const { existingId, candidate: c } of plan.toUpdate) {
        await tx.publishedKnowledgeRecord.update({
          where: { id: existingId },
          data: {
            title: c.title,
            content: c.content,
            sourcePath: c.sourcePath,
            category: c.category,
            approvalStatus: c.approvalStatus,
            publicationStatus: c.publicationStatus,
            accessLayer: c.accessLayer,
            version: { increment: 1 },
            contentHash: c.contentHash,
            isGapRecord: c.isGapRecord,
            escalationRequired: c.escalationRequired,
            relationships: c.relationships,
            rawFields: c.rawFields,
            locale: c.locale,
            publishedAt: c.publicationStatus === "PUBLISHED" ? now : null,
            // Un-archives a previously ARCHIVED/SOURCE_MISSING row whose
            // source KO reappeared — see diff.ts's `wasInactive` check
            // for why a reappearance always lands here, not in
            // `toTouch`, even when its content is byte-for-byte
            // identical to before.
            archivedAt: null,
            lastSeenAt: now,
          },
        });
      }

      if (plan.toTouch.length > 0) {
        await tx.publishedKnowledgeRecord.updateMany({
          where: { id: { in: plan.toTouch } },
          data: { lastSeenAt: now },
        });
      }

      if (plan.toArchive.length > 0) {
        await tx.publishedKnowledgeRecord.updateMany({
          where: { id: { in: plan.toArchive.map((r) => r.id) } },
          data: { publicationStatus: "ARCHIVED", archivedAt: now },
        });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS }
  );
}
