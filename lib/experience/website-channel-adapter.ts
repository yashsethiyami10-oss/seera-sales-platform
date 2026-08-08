import { logger } from "@/lib/logger";
import { scanTextForConfidentiality, hasBlockingConfidentialityFindings } from "@/lib/knowledge-reconciliation/confidentiality-scanner";
import type { ExperienceResponse, WebsiteExperienceSegment, WebsiteExperienceView } from "./types";

const CONFIDENTIALITY_REDACTION_PLACEHOLDER = "We don't have that information available right now.";

/**
 * Corrective Confidentiality Hardening (post-Founder-audit Finding H1) —
 * the final leakage-prevention backstop, applied at the very last step
 * before any content becomes a customer-visible segment. Every upstream
 * layer (governance validation, population, retrieval) already excludes
 * restricted content by design; this exists so a failure at any one of
 * those layers can never be the *only* thing standing between a
 * formulation secret and a customer. Never silently drops the whole
 * response — replaces only the affected segment's own content with a
 * fixed, safe placeholder, and always logs the occurrence (never the
 * matched text itself) so a redaction is auditable, not invisible.
 */
export function backstopScanSegmentContent(content: string, segmentKind: string): string {
  const findings = scanTextForConfidentiality(content, `segment.${segmentKind}`);
  if (!hasBlockingConfidentialityFindings(findings)) return content;
  logger.error("experience:confidentiality-backstop-redacted-segment", {
    segmentKind,
    categories: findings.map((f) => f.category),
  });
  return CONFIDENTIALITY_REDACTION_PLACEHOLDER;
}

/**
 * MUV AI — Experience Platform (Module 8) Website Channel Adapter.
 *
 * "Website channel adaptation." The only channel this module implements —
 * WhatsApp/Email are explicitly Module 7's "later integrations," not built
 * here. Converts the channel-neutral `ExperienceResponse` (a structured
 * list of typed blocks) into a flat, ordered list of website-renderable
 * segments. A future channel adapter (e.g. a WhatsApp one) would consume
 * the same `ExperienceResponse` and produce a different shape — e.g. a
 * single concatenated text message — without this module's orchestrator
 * or response model needing to change, the same "channel-neutral core,
 * per-channel adapter" separation `lib/shipping`/`lib/messaging` already
 * established for provider swapping.
 */

export function adaptForWebsite(response: ExperienceResponse): WebsiteExperienceView {
  const segments: WebsiteExperienceSegment[] = response.blocks.map((block) => {
    switch (block.type) {
      case "MESSAGE":
        return { kind: "MESSAGE", content: backstopScanSegmentContent(block.text, "MESSAGE") };
      case "REFERENCE_CARD": {
        // `block.content` (Block B1) is only ever set for a resolved
        // ADMIN/STAFF caller — see response-model.ts. Concatenating it here
        // rather than adding a new segment kind keeps every existing
        // consumer of WebsiteExperienceView (widget rendering, tests)
        // working unchanged for the common case where content is absent.
        const raw = block.content ? `${block.label}\n\n${block.content}` : block.label;
        return {
          kind: "REFERENCE_CARD",
          content: backstopScanSegmentContent(raw, "REFERENCE_CARD"),
          meta: { referenceType: block.referenceType, id: block.id, label: block.label },
        };
      }
      case "FOLLOW_UP_QUESTION":
        return { kind: "FOLLOW_UP_QUESTION", content: backstopScanSegmentContent(block.question, "FOLLOW_UP_QUESTION") };
      case "ESCALATION_NOTICE":
        return { kind: "ESCALATION_NOTICE", content: backstopScanSegmentContent(block.message, "ESCALATION_NOTICE") };
    }
  });

  return {
    sessionId: response.sessionId,
    segments,
    requiresHandoff: response.requiresHandoff,
    allowFollowUp: response.allowFollowUp,
    executionStatus: response.executionStatus,
    generatedAt: response.generatedAt,
  };
}
