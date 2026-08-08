import type { DiscoveredKnowledgeObject } from "./discover";
import type { ValidationIssue } from "./types";

/**
 * MUV Knowledge Publisher™ — Stage 2: Validate.
 *
 * Every rule here is a real, checkable condition — never a heuristic
 * guess. A record that fails any ERROR-level check is entirely excluded
 * from `valid` (never partially published); a WARNING-level condition
 * (today, only an unclassifiable approval status) still allows the
 * record through to Normalize/Publish, since it is real, findable content
 * — it just can never be marked PUBLISHED (see normalize.ts's status
 * mapping) and is always surfaced so a human can fix the source text.
 */

const KNOWN_DOMAINS = new Set(["PRODUCT_KF", "MARKETING_KF", "INSTITUTIONAL_SALES_KF", "FOUNDER_INTELLIGENCE_KF", "CUSTOMER_CARE_KF"]);
const KNOWN_APPROVAL_TIERS = new Set(["APPROVED", "REVIEW_READY", "DRAFT", "OPEN_PENDING_FOUNDER_INPUT", "UNKNOWN"]);

export type ValidationResult = {
  valid: DiscoveredKnowledgeObject[];
  issues: ValidationIssue[];
};

export function validateKnowledgeObjects(records: DiscoveredKnowledgeObject[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const valid: DiscoveredKnowledgeObject[] = [];

  // Stable KO ID is domain-qualified ("{domain}:{koid}") — grouping by
  // this key, not the bare koid, is what makes "duplicate IDs rejected"
  // check the ACTUAL upsert key the Publisher will use, not a narrower
  // or looser notion of uniqueness.
  const bySourceId = new Map<string, DiscoveredKnowledgeObject[]>();
  for (const r of records) {
    const sourceId = `${r.domainFactory}:${r.koid}`;
    const group = bySourceId.get(sourceId) ?? [];
    group.push(r);
    bySourceId.set(sourceId, group);
  }

  for (const [sourceId, group] of bySourceId) {
    const isDuplicate = group.length > 1;

    for (const r of group) {
      const domain = r.domainFactory;
      const errorMessages: string[] = [];

      if (!r.koid || !r.koid.trim()) errorMessages.push("Missing or empty KO ID.");
      if (!r.title || !r.title.trim()) errorMessages.push("Missing or empty title.");
      if (!KNOWN_DOMAINS.has(domain)) errorMessages.push(`Unrecognized domain "${domain}" — not one of the 5 known Knowledge Factories.`);
      // A Gap Record is real, honest "not documented yet" content and is
      // legitimately allowed to have empty/near-empty content; anything
      // else with empty content is an incomplete object, not real
      // knowledge, and must be reported rather than silently published
      // as if it were substantive.
      if (!r.isGapRecord && (!r.content || !r.content.trim())) errorMessages.push("Empty content for a non-gap-record object.");
      if (!KNOWN_APPROVAL_TIERS.has(r.approvalTier)) errorMessages.push(`Unrecognized approval-tier classification "${r.approvalTier}".`);
      if (isDuplicate) {
        errorMessages.push(
          `Duplicate KO ID "${sourceId}" found in ${group.length} source files: ${group.map((g) => g.relativeSourcePath).join(", ")}.`
        );
      }

      if (errorMessages.length > 0) {
        for (const message of errorMessages) {
          issues.push({ level: "ERROR", sourceId, koid: r.koid, domain, sourceFile: r.relativeSourcePath, message });
        }
        continue;
      }

      // Real, valid content — but the Knowledge Factory's own approval
      // text could not be classified. Never silently guessed into
      // eligible-or-not; always reported, and normalize.ts will map this
      // to UNKNOWN_STATUS, never PUBLISHED.
      if (r.approvalTier === "UNKNOWN") {
        issues.push({
          level: "WARNING",
          sourceId,
          koid: r.koid,
          domain,
          sourceFile: r.relativeSourcePath,
          message: "Approval status text could not be classified as APPROVED/REVIEW_READY/DRAFT/OPEN_PENDING_FOUNDER_INPUT — stored for visibility, never eligible for publication.",
        });
      }

      valid.push(r);
    }
  }

  return { valid, issues };
}
