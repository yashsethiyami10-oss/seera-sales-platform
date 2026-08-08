import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { DiscoveredKnowledgeObject } from "./discover";
import type { NormalizedKnowledgeCandidate } from "./types";
import type { DomainTotals, PublishMode, PublishReport, ValidationIssue } from "./types";

/**
 * MUV Knowledge Publisher™ — Stage 9: Publish report.
 *
 * Per-domain totals are computed from the same discovered/candidate/
 * issue lists every stage already produced — no second pass over the
 * Knowledge Factory files.
 */
export function buildPerDomainTotals(
  discovered: DiscoveredKnowledgeObject[],
  candidates: NormalizedKnowledgeCandidate[],
  errors: ValidationIssue[]
): Record<string, DomainTotals> {
  const totals: Record<string, DomainTotals> = {};
  const ensure = (domain: string) => (totals[domain] ??= { discovered: 0, valid: 0, rejected: 0, published: 0 });

  for (const d of discovered) ensure(d.domainFactory).discovered += 1;
  for (const c of candidates) {
    const t = ensure(c.domain);
    t.valid += 1;
    if (c.publicationStatus === "PUBLISHED") t.published += 1;
  }
  const rejectedSourceIds = new Set(errors.map((e) => e.sourceId));
  const domainByRejectedSourceId = new Map(errors.map((e) => [e.sourceId, e.domain]));
  for (const sourceId of rejectedSourceIds) {
    ensure(domainByRejectedSourceId.get(sourceId)!).rejected += 1;
  }

  return totals;
}

export type ReportInputs = {
  mode: PublishMode;
  startedAt: Date;
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

export function buildReport(inputs: ReportInputs): PublishReport {
  return {
    mode: inputs.mode,
    startedAt: inputs.startedAt.toISOString(),
    durationMs: inputs.durationMs,
    discovered: inputs.discovered,
    validCount: inputs.validCount,
    rejected: inputs.rejected,
    inserted: inputs.inserted,
    updated: inputs.updated,
    unchanged: inputs.unchanged,
    archived: inputs.archived,
    embeddingsCreated: inputs.embeddingsCreated,
    embeddingsUpdated: inputs.embeddingsUpdated,
    embeddingsSkipped: inputs.embeddingsSkipped,
    warnings: inputs.warnings,
    errors: inputs.errors,
    perDomainTotals: inputs.perDomainTotals,
  };
}

/**
 * Persists a live PUBLISH run's report for later audit — never called for
 * a dry-run (dry-run's own explicit contract is "writes nothing"; its
 * report is returned to the caller only, never persisted). Best-effort,
 * matching `lib/retrieval/pipeline.ts`'s `logRetrieval()` precedent: a
 * logging failure is reported but never thrown, since a run that
 * genuinely succeeded should not be reported as failed just because its
 * own audit trail write failed afterward.
 */
export async function persistPublishRun(report: PublishReport): Promise<void> {
  try {
    await prisma.knowledgePublishRun.create({
      data: {
        mode: report.mode,
        startedAt: new Date(report.startedAt),
        durationMs: report.durationMs,
        discovered: report.discovered,
        validCount: report.validCount,
        rejected: report.rejected,
        inserted: report.inserted,
        updated: report.updated,
        unchanged: report.unchanged,
        archived: report.archived,
        embeddingsCreated: report.embeddingsCreated,
        embeddingsUpdated: report.embeddingsUpdated,
        embeddingsSkipped: report.embeddingsSkipped,
        warnings: report.warnings,
        errors: report.errors,
        perDomainTotals: report.perDomainTotals,
      },
    });
  } catch (err) {
    logger.error("knowledge-publisher:report-persist-failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
