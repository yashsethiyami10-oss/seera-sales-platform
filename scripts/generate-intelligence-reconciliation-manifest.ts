import { writeFileSync, readFileSync } from "fs";
import path from "node:path";

// ---- Database-safety gate: refuse unless this resolves to ep-falling-heart ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart.`);
}
console.log("[reconciliation-manifest] Resolved read target host:", resolvedHost);

import { runReconciliationDryRun } from "../lib/knowledge-reconciliation";

/**
 * MUV AI Intelligence Reconciliation — Block 2B, Stage 1. Generates the
 * Founder-reviewable real dry-run manifest as two files:
 *   - a machine-readable JSON (the full manifest, unmodified from what
 *     `runReconciliationDryRun()` returns)
 *   - a human-reviewable Markdown summary (counts, exclusions, conflicts,
 *     the Founder-review queue, and a short representative sample —
 *     not a full dump of 500+ projections)
 *
 * Read-only, matching `scripts/generate-knowledge-classification-manifest.ts`'s
 * exact discipline: reads real ep-falling-heart data via the already-tested
 * Block 2A mapper, writes two new report files, touches no database row.
 *
 * Run: `npx tsx scripts/generate-intelligence-reconciliation-manifest.ts`
 * (DATABASE_URL must resolve to ep-falling-heart — see the mapper's own
 * `sources.ts`, which uses the shared `@/lib/prisma` client configured from
 * the environment already loaded by the process running this script).
 */

async function main() {
  const manifest = await runReconciliationDryRun();

  writeFileSync("INTELLIGENCE_RECONCILIATION_MANIFEST.json", JSON.stringify(manifest, null, 2));

  const lines: string[] = [];
  lines.push("# MUV AI — Real Reconciliation Dry-Run Manifest (Block 2B, Stage 1)");
  lines.push("");
  lines.push(`Generated: ${manifest.generatedAt}`);
  lines.push(`Duration: ${manifest.durationMs}ms`);
  lines.push(`Founder Policy version: ${manifest.founderPolicyVersion}`);
  lines.push("");
  lines.push("This manifest is a PROPOSAL only. Nothing here has been written to any");
  lines.push("database table. Every intelligence table remains exactly as it was before");
  lines.push("this file was generated (see the companion Stage 1 report for the direct");
  lines.push("before/after row-count proof).");
  lines.push("");

  lines.push("## Source inventory (real, live ep-falling-heart data)");
  lines.push("");
  lines.push(`- Product: ${manifest.sourceInventory.productCount}`);
  lines.push(`- ProductVariant: ${manifest.sourceInventory.variantCount}`);
  lines.push(`- ProductContent: ${manifest.sourceInventory.productContentCount}`);
  lines.push(`- PublishedKnowledgeRecord: ${manifest.sourceInventory.publishedKnowledgeRecordCount}`);
  lines.push("");

  lines.push("## Derived projections (this run)");
  lines.push("");
  lines.push("| Target layer | Count |");
  lines.push("|---|---|");
  lines.push(`| KnowledgeItem | ${manifest.knowledgeItemProjections.length} |`);
  lines.push(`| ProductIntelligence | ${manifest.productIntelligenceProjections.length} |`);
  lines.push(`| ProblemIntelligence | ${manifest.problemIntelligenceProjections.length} |`);
  lines.push(`| CareIntelligence | ${manifest.careIntelligenceProjections.length} |`);
  lines.push("");

  lines.push("## Governance decisions (proposed classification totals)");
  lines.push("");
  lines.push("| Classification | Count |");
  lines.push("|---|---|");
  lines.push(`| CUSTOMER_SAFE | ${manifest.totals.customerSafeEligible} |`);
  lines.push(`| INTERNAL_ONLY | ${manifest.totals.internalOnly} |`);
  lines.push(`| FOUNDER_REVIEW_REQUIRED | ${manifest.totals.founderReviewRequired} |`);
  lines.push(`| REJECTED | ${manifest.totals.rejected} |`);
  lines.push(`| DEPRECATED | ${manifest.totals.deprecated} |`);
  lines.push("");
  lines.push("| Proposed write operation | Count |");
  lines.push("|---|---|");
  lines.push(`| CREATE | ${manifest.totals.proposedCreate} |`);
  lines.push(`| UPDATE | ${manifest.totals.proposedUpdate} |`);
  lines.push(`| TOUCH | ${manifest.totals.proposedTouch} |`);
  lines.push(`| ARCHIVE | ${manifest.totals.proposedArchive} |`);
  lines.push(`| SKIP | ${manifest.totals.proposedSkip} |`);
  lines.push("");

  lines.push("## Unresolved conflicts");
  lines.push("");
  if (manifest.conflicts.length === 0) {
    lines.push("None detected in this run.");
  } else {
    for (const c of manifest.conflicts) lines.push(`- \`${c.deterministicKey}\`: ${c.description}`);
  }
  lines.push("");

  lines.push("## Excluded records (rejected candidates — never silently dropped)");
  lines.push("");
  lines.push(`Total: ${manifest.excludedRecords.length}`);
  for (const e of manifest.excludedRecords.slice(0, 20)) {
    lines.push(`- **${e.sourceId}** (${e.sourceType}): ${e.reason}`);
  }
  if (manifest.excludedRecords.length > 20) lines.push(`- ...and ${manifest.excludedRecords.length - 20} more (see JSON manifest for the full list).`);
  lines.push("");

  lines.push("## Blocked records (governance validation population blockers)");
  lines.push("");
  lines.push(`Total: ${manifest.blockedRecords.length}`);
  for (const b of manifest.blockedRecords.slice(0, 20)) {
    lines.push(`- **${b.deterministicKey}** (${b.targetModel}): ${b.reason}`);
  }
  if (manifest.blockedRecords.length > 20) lines.push(`- ...and ${manifest.blockedRecords.length - 20} more (see JSON manifest for the full list).`);
  lines.push("");

  lines.push("## Governance validation result");
  lines.push("");
  lines.push(`- Passed: ${manifest.governance.passed}`);
  lines.push(`- Total findings: ${manifest.governance.findings.length}`);
  lines.push(`- Population blockers: ${manifest.governance.blockerCount}`);
  lines.push("");

  lines.push("## Founder-review queue (sample — first 15 of " + manifest.founderReviewQueue.length + ")");
  lines.push("");
  lines.push("| Key | Target | Reason |");
  lines.push("|---|---|---|");
  for (const f of manifest.founderReviewQueue.slice(0, 15)) {
    lines.push(`| \`${f.deterministicKey}\` | ${f.targetModel} | ${f.reason.slice(0, 120)} |`);
  }
  lines.push("");

  lines.push("## Representative ProductIntelligence sample (Cool Water Liquid Detergent)");
  lines.push("");
  const coolWater = manifest.productIntelligenceProjections.find((p) => p.productName === "Muv Cool Water Liquid Detergent");
  if (coolWater) {
    lines.push("```json");
    lines.push(JSON.stringify({ ...coolWater, fieldResolutions: undefined }, null, 2));
    lines.push("```");
  }
  lines.push("");

  lines.push("## Representative Black Phenyl citation condition (must remain visible)");
  lines.push("");
  const blackPhenyl = manifest.productIntelligenceProjections.find((p) => p.productName === "Muv Black Phenyl");
  if (blackPhenyl) {
    lines.push(`- reviewStatus: ${blackPhenyl.reviewStatus}`);
    lines.push(`- warnings: ${JSON.stringify(blackPhenyl.warnings)}`);
  }
  lines.push("");

  writeFileSync("docs/muv-ai/MUV_AI_BLOCK_2B_REAL_DRY_RUN_REPORT.md", lines.join("\n"));

  console.log("Wrote INTELLIGENCE_RECONCILIATION_MANIFEST.json and docs/muv-ai/MUV_AI_BLOCK_2B_REAL_DRY_RUN_REPORT.md");
  console.log(JSON.stringify(manifest.totals, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
