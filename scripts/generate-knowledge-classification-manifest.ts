import { writeFileSync } from "fs";
import { getManifestAsFounderApprovalRequirement } from "../lib/gateway/knowledge-governance/manifest";

/**
 * MUV AI Gateway — Production Rollout v1.0, Stage 2. Generates the
 * Founder-reviewable Knowledge Classification Manifest as two files:
 *   - a machine-readable JSON (the full manifest + summary)
 *   - a human-reviewable Markdown summary (counts + the short candidate
 *     list a Founder should actually look at — not all 1,000+ rows)
 *
 * Read-only: reads the in-memory Knowledge Factory index, writes two new
 * report files, touches no database row and no enforcement code.
 *
 * Run: `npx tsx scripts/generate-knowledge-classification-manifest.ts`.
 */

function main() {
  const requirement = getManifestAsFounderApprovalRequirement();
  const { summary, candidatesForReview, fullManifest } = requirement;

  writeFileSync(
    "KNOWLEDGE_CLASSIFICATION_MANIFEST.json",
    JSON.stringify({ requiresFounderApproval: true, summary, candidatesForReview, fullManifest }, null, 2)
  );

  const lines: string[] = [];
  lines.push("# Knowledge Classification Manifest — Founder Approval Required");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");
  lines.push("This manifest is a PROPOSAL only. Nothing here has been applied to real");
  lines.push("enforcement (`lib/gateway/knowledge/authorization.ts`'s `kfDomainLayer`). Every");
  lines.push("Knowledge Factory record remains exactly as restricted as it was before this");
  lines.push("file was generated.");
  lines.push("");
  lines.push(`**Total records surveyed:** ${summary.totalRecords}`);
  lines.push("");
  lines.push("## By domain");
  lines.push("");
  lines.push("| Domain | Count |");
  lines.push("|---|---|");
  for (const [domain, count] of Object.entries(summary.byDomain)) lines.push(`| ${domain} | ${count} |`);
  lines.push("");
  lines.push("## By proposed customer visibility");
  lines.push("");
  lines.push("| Proposed visibility | Count |");
  lines.push("|---|---|");
  for (const [key, count] of Object.entries(summary.byProposedVisibility)) lines.push(`| ${key} | ${count} |`);
  lines.push("");
  lines.push(`## Candidates for Founder review (${candidatesForReview.length})`);
  lines.push("");
  lines.push("These are the ONLY records proposed as potentially customer-safe. Every one");
  lines.push("still requires an explicit Founder decision via the Knowledge Governance");
  lines.push("classification workflow before it could ever become customer-visible — and");
  lines.push("even then, applying that decision to real enforcement is a separate, future");
  lines.push("change, not a consequence of appearing on this list.");
  lines.push("");
  if (candidatesForReview.length === 0) {
    lines.push("_None at this time._");
  } else {
    lines.push("| KO ID | Domain | Title | Source |");
    lines.push("|---|---|---|---|");
    for (const c of candidatesForReview) lines.push(`| ${c.koId} | ${c.domain} | ${c.title} | ${c.sourcePath} |`);
  }
  lines.push("");
  lines.push("Full per-record detail (all fields, all records): `KNOWLEDGE_CLASSIFICATION_MANIFEST.json`.");
  lines.push("");

  writeFileSync("KNOWLEDGE_CLASSIFICATION_MANIFEST.md", lines.join("\n"));

  console.log(`Wrote KNOWLEDGE_CLASSIFICATION_MANIFEST.json (${fullManifest.length} records) and KNOWLEDGE_CLASSIFICATION_MANIFEST.md (${candidatesForReview.length} candidates for review).`);
}

main();
