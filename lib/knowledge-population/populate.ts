/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 *
 * Orchestrates controlled population of the four intelligence tables from
 * a fresh, real reconciliation manifest. Population order is fixed:
 * KnowledgeItem → ProductIntelligence → ProblemIntelligence →
 * CareIntelligence — CareIntelligence's relations to ProductIntelligence
 * and ProblemIntelligence require those rows to already exist.
 *
 * Every projection is re-validated through the Block 2A mapper's own
 * `runGovernanceValidation()` immediately before writing — a projection
 * with an active population blocker is skipped and recorded, never
 * written, matching the Mapper Governance Contract's "reject unsafe or
 * ambiguous mappings" rule.
 */

import { runReconciliationDryRun } from "@/lib/knowledge-reconciliation";
import { validateProjection } from "@/lib/knowledge-reconciliation/governance-validation";
import { writeKnowledgeItemProjection } from "./knowledge-item-writer";
import { writeProductIntelligenceProjection } from "./product-intelligence-writer";
import { writeProblemIntelligenceProjection } from "./problem-intelligence-writer";
import { writeCareIntelligenceProjection } from "./care-intelligence-writer";
import { withTransientRetry } from "./retry";
import type { LayerWriteResult, PopulationReport, WriteAction } from "./types";

function summarize(results: LayerWriteResult[]) {
  const count = (a: WriteAction) => results.filter((r) => r.action === a).length;
  return { created: count("CREATED"), updated: count("UPDATED"), touched: count("TOUCHED"), archived: count("ARCHIVED"), skipped: count("SKIPPED"), results };
}

export async function runControlledPopulation(): Promise<PopulationReport> {
  const startedAt = new Date();
  const manifest = await runReconciliationDryRun();
  const errors: PopulationReport["errors"] = [];

  const knowledgeItemResults: LayerWriteResult[] = [];
  for (const projection of manifest.knowledgeItemProjections) {
    const findings = validateProjection(projection);
    const blocker = findings.find((f) => f.populationBlocker);
    if (blocker) {
      knowledgeItemResults.push({ deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", action: "SKIPPED", recordId: null, reason: `Governance blocker: ${blocker.ruleId} — ${blocker.failureReason}` });
      continue;
    }
    try {
      knowledgeItemResults.push(await withTransientRetry(() => writeKnowledgeItemProjection(projection)));
    } catch (err) {
      errors.push({ deterministicKey: projection.deterministicKey, targetModel: "KnowledgeItem", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const productIntelligenceResults: LayerWriteResult[] = [];
  for (const projection of manifest.productIntelligenceProjections) {
    const findings = validateProjection(projection);
    const blocker = findings.find((f) => f.populationBlocker);
    if (blocker) {
      productIntelligenceResults.push({ deterministicKey: projection.deterministicKey, targetModel: "ProductIntelligence", action: "SKIPPED", recordId: null, reason: `Governance blocker: ${blocker.ruleId} — ${blocker.failureReason}` });
      continue;
    }
    try {
      productIntelligenceResults.push(await withTransientRetry(() => writeProductIntelligenceProjection(projection)));
    } catch (err) {
      errors.push({ deterministicKey: projection.deterministicKey, targetModel: "ProductIntelligence", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const problemIntelligenceResults: LayerWriteResult[] = [];
  for (const projection of manifest.problemIntelligenceProjections) {
    const findings = validateProjection(projection);
    const blocker = findings.find((f) => f.populationBlocker);
    if (blocker) {
      problemIntelligenceResults.push({ deterministicKey: projection.deterministicKey, targetModel: "ProblemIntelligence", action: "SKIPPED", recordId: null, reason: `Governance blocker: ${blocker.ruleId} — ${blocker.failureReason}` });
      continue;
    }
    try {
      problemIntelligenceResults.push(await withTransientRetry(() => writeProblemIntelligenceProjection(projection)));
    } catch (err) {
      errors.push({ deterministicKey: projection.deterministicKey, targetModel: "ProblemIntelligence", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const careIntelligenceResults: LayerWriteResult[] = [];
  for (const projection of manifest.careIntelligenceProjections) {
    const findings = validateProjection(projection);
    const blocker = findings.find((f) => f.populationBlocker);
    if (blocker) {
      careIntelligenceResults.push({ deterministicKey: projection.deterministicKey, targetModel: "CareIntelligence", action: "SKIPPED", recordId: null, reason: `Governance blocker: ${blocker.ruleId} — ${blocker.failureReason}` });
      continue;
    }
    try {
      careIntelligenceResults.push(await withTransientRetry(() => writeCareIntelligenceProjection(projection)));
    } catch (err) {
      errors.push({ deterministicKey: projection.deterministicKey, targetModel: "CareIntelligence", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    mode: "PUBLISH",
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    knowledgeItem: summarize(knowledgeItemResults),
    productIntelligence: summarize(productIntelligenceResults),
    problemIntelligence: summarize(problemIntelligenceResults),
    careIntelligence: summarize(careIntelligenceResults),
    errors,
  };
}
