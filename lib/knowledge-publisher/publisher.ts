import { discoverKnowledgeObjects } from "./discover";
import { validateKnowledgeObjects } from "./validate";
import { normalizeKnowledgeObject } from "./normalize";
import { computePublishPlan } from "./diff";
import { applyPublishPlan } from "./write";
import { embedPublishedRecord } from "./embeddings";
import { buildPerDomainTotals, buildReport, persistPublishRun } from "./report";
import type { NormalizedKnowledgeCandidate, PublishReport } from "./types";

export type RunPublisherOptions = {
  /** Parse, validate, and compute the full plan, but never write to
   * `PublishedKnowledgeRecord`, `KnowledgeEmbedding`, or
   * `KnowledgePublishRun` — the Publisher's dry-run contract. */
  dryRun?: boolean;
};

/**
 * MUV Knowledge Publisher™ — the public entry point.
 *
 * Discover -> Validate -> Normalize -> (diff against the runtime
 * database) -> [dry-run: stop here] -> Publish (one transaction) ->
 * Embed (only PUBLISHED records, only insert/update, never touch-only)
 * -> Report.
 *
 * Deliberately has no `auth()`/RBAC check of its own — this is a pure,
 * request-context-independent batch function so it can run from a
 * Server Action (`actions/knowledge-publisher.ts`, which IS
 * `requireAdmin()`-gated) or from an offline script identically. Never
 * call this from anywhere reachable by a customer or by STAFF below
 * ADMIN — bulk-writing the runtime knowledge database is an admin-grade
 * operation.
 */
export async function runPublisher(options: RunPublisherOptions = {}): Promise<PublishReport> {
  const dryRun = options.dryRun ?? false;
  const startedAt = new Date();
  const startTime = Date.now();

  const discovered = discoverKnowledgeObjects();
  const { valid, issues } = validateKnowledgeObjects(discovered);
  const errors = issues.filter((i) => i.level === "ERROR");
  const warnings = issues.filter((i) => i.level === "WARNING");
  // Distinct rejected KOs, not distinct error messages — one KO can carry
  // more than one ERROR-level issue (e.g. both an empty title AND an
  // unrecognized domain).
  const rejected = new Set(errors.map((e) => e.sourceId)).size;

  const candidates: NormalizedKnowledgeCandidate[] = valid.map(normalizeKnowledgeObject);
  const perDomainTotals = buildPerDomainTotals(discovered, candidates, errors);

  const plan = await computePublishPlan(candidates);

  if (dryRun) {
    return buildReport({
      mode: "DRY_RUN",
      startedAt,
      durationMs: Date.now() - startTime,
      discovered: discovered.length,
      validCount: candidates.length,
      rejected,
      inserted: plan.toInsert.length,
      updated: plan.toUpdate.length,
      unchanged: plan.toTouch.length,
      archived: plan.toArchive.length,
      embeddingsCreated: 0,
      embeddingsUpdated: 0,
      // Dry-run never generates embeddings — every eligible candidate is
      // reported as skipped rather than silently omitted from the count.
      embeddingsSkipped: candidates.filter((c) => c.publicationStatus === "PUBLISHED").length,
      warnings,
      errors,
      perDomainTotals,
    });
  }

  const now = new Date();
  await applyPublishPlan(plan, now);

  // Embeddings run AFTER the transaction commits, per-record, with
  // per-record failure isolation — see write.ts's own comment for why
  // this is deliberately outside the transaction. Only PUBLISHED
  // records are embedded (DRAFT/PENDING_REVIEW/PENDING_FOUNDER_INPUT/
  // UNKNOWN_STATUS content is never retrievable in production, so
  // embedding it would be pure wasted work); unchanged (touch-only)
  // records are never re-embedded, satisfying "regenerate embeddings
  // only when normalized content changes."
  let embeddingsCreated = 0;
  let embeddingsUpdated = 0;
  let embeddingsSkipped = plan.toTouch.length;

  for (const c of plan.toInsert) {
    if (c.publicationStatus !== "PUBLISHED") {
      embeddingsSkipped++;
      continue;
    }
    const ok = await embedPublishedRecord(c.sourceId, c.title, c.content);
    if (ok) embeddingsCreated++;
    else embeddingsSkipped++;
  }
  for (const { candidate: c } of plan.toUpdate) {
    if (c.publicationStatus !== "PUBLISHED") {
      embeddingsSkipped++;
      continue;
    }
    const ok = await embedPublishedRecord(c.sourceId, c.title, c.content);
    if (ok) embeddingsUpdated++;
    else embeddingsSkipped++;
  }

  const report = buildReport({
    mode: "PUBLISH",
    startedAt,
    durationMs: Date.now() - startTime,
    discovered: discovered.length,
    validCount: candidates.length,
    rejected,
    inserted: plan.toInsert.length,
    updated: plan.toUpdate.length,
    unchanged: plan.toTouch.length,
    archived: plan.toArchive.length,
    embeddingsCreated,
    embeddingsUpdated,
    embeddingsSkipped,
    warnings,
    errors,
    perDomainTotals,
  });

  await persistPublishRun(report);
  return report;
}
