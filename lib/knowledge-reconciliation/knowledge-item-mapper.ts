/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A), Phase 6.
 *
 * KnowledgeItem projection mapping — general, not-limited-to-one-product
 * MUV knowledge (brand, category, policy, approved FAQs, general care
 * guidance). Read-only: returns projections, never writes.
 */

import type { SourcePublishedKnowledgeRecord } from "./sources";
import type { GovernanceClassification, KnowledgeItemFileType, KnowledgeItemProjection, SourceReference } from "./types";
import { knowledgeItemKey } from "./identity";
import { normalizeApprovalStatusLabel, normalizeVersionIdentifier, normalizeWhitespace } from "./normalize";
import type { KnowledgeLayer } from "@prisma/client";

/**
 * Domains explicitly excluded from KnowledgeItem mapping in this pass:
 * `PRODUCT_KF` (fans into ProductIntelligence instead, see Phase 7) and
 * any record whose `sourcePath` targets a single product family folder.
 * Everything else — brand/company/category-level content — is in scope,
 * per Block 2C Section 9.
 */
const KNOWLEDGE_ITEM_DOMAINS = new Set(["MARKETING_KF", "INSTITUTIONAL_SALES_KF", "CUSTOMER_CARE_KF", "FOUNDER_INTELLIGENCE_KF"]);

function fileTypeForDomain(domain: string): KnowledgeItemFileType {
  if (domain === "CUSTOMER_CARE_KF") return "FAQ";
  if (domain === "MARKETING_KF" || domain === "INSTITUTIONAL_SALES_KF") return "POLICY";
  return "KNOWLEDGE_LIBRARY";
}

/**
 * Layer assignment — Block 2C Section 9's explicit rule: FOUNDER_INTELLIGENCE_KF
 * defaults to the most restrictive tier (CONFIDENTIAL) regardless of its
 * own source approval status; every other in-scope domain defaults to
 * INTERNAL. Nothing here ever defaults to PUBLIC — that requires a
 * separate, explicit Founder promotion (Decision 2), never inherited.
 */
function layerForDomain(domain: string): KnowledgeLayer {
  if (domain === "FOUNDER_INTELLIGENCE_KF") return "CONFIDENTIAL";
  return "INTERNAL";
}

/**
 * Governance classification per Block 2C Section 9's approval-status
 * mapping table:
 *  - APPROVED/REVIEW_READY -> FOUNDER_REVIEW_REQUIRED (still requires the
 *    explicit promotion-eligibility check before CUSTOMER_SAFE — source
 *    approval alone never suffices, per the Customer-Safe Promotion Policy)
 *  - DRAFT -> INTERNAL_ONLY
 *  - UNKNOWN/OPEN_PENDING_FOUNDER_INPUT -> FOUNDER_REVIEW_REQUIRED, flagged
 *    as unable-to-classify or awaiting-input respectively
 */
function classificationForApprovalStatus(approvalStatus: string, domain: string): GovernanceClassification {
  // FOUNDER_INTELLIGENCE_KF never exceeds INTERNAL_ONLY regardless of its
  // own source approval — Block 2C's explicit hard floor.
  if (domain === "FOUNDER_INTELLIGENCE_KF") return "INTERNAL_ONLY";
  if (approvalStatus === "APPROVED" || approvalStatus === "REVIEW_READY") return "FOUNDER_REVIEW_REQUIRED";
  if (approvalStatus === "DRAFT") return "INTERNAL_ONLY";
  return "FOUNDER_REVIEW_REQUIRED";
}

export function mapKnowledgeItemProjection(record: SourcePublishedKnowledgeRecord): KnowledgeItemProjection | null {
  if (!KNOWLEDGE_ITEM_DOMAINS.has(record.domain)) return null;

  const approvalStatus = normalizeApprovalStatusLabel(record.approvalStatus);
  const deterministicKey = knowledgeItemKey(record.domain, record.koid);
  const classification = classificationForApprovalStatus(approvalStatus, record.domain);
  const isGapRecord = record.isGapRecord;

  const source: SourceReference = {
    sourceType: "PUBLISHED_KNOWLEDGE_RECORD",
    sourceId: record.sourceId,
    sourceVersion: normalizeVersionIdentifier(record.version),
    sourceApprovalStatus: approvalStatus,
    label: `PublishedKnowledgeRecord:${record.sourceId}`,
  };

  const warnings = approvalStatus === "UNKNOWN" ? [{ code: "UNCLASSIFIABLE_APPROVAL_STATUS", message: "Source approval-status text could not be classified; excluded from any promotion consideration until corrected at the source." }] : [];

  const excludedFields = isGapRecord
    ? [{ field: "content", reason: "isGapRecord=true — this record documents an absence, never rendered as retrievable content." }]
    : [];

  return {
    deterministicKey,
    targetModel: "KnowledgeItem",
    targetRecordType: fileTypeForDomain(record.domain),
    sources: [source],
    sourcePriority: ["PUBLISHED_KNOWLEDGE_RECORD"],
    governanceClassification: isGapRecord ? "INTERNAL_ONLY" : classification,
    customerSafeEligible: false, // never true in this pass — Block 2C Decision 2 is unresolved; see policy.ts's safe default
    runtimeEligible: false,
    activeStatus: record.archivedAt ? "DEPRECATED" : "ACTIVE",
    conflictStatus: "NONE",
    confidence: approvalStatus === "APPROVED" ? "HIGH" : approvalStatus === "REVIEW_READY" ? "MODERATE" : "LOW",
    reviewStatus: "REQUIRED",
    mappedFields: isGapRecord ? [] : ["title", "content"],
    excludedFields,
    missingFields: [],
    warnings,
    errors: [],
    relationshipReferences: [],
    provenance: { content: source.label },
    proposedWriteOperation: { op: "SKIP", targetModel: "KnowledgeItem", reason: "Finalized by dry-run.ts against the existing-key index." },
    proposedRollbackIdentity: { targetModel: "KnowledgeItem", deterministicKey, previousVersionId: null },

    slug: deterministicKey,
    title: normalizeWhitespace(record.title),
    fileType: fileTypeForDomain(record.domain),
    layer: layerForDomain(record.domain),
    content: isGapRecord ? "" : normalizeWhitespace(record.content),
    productId: null,
  };
}

export function mapAllKnowledgeItemProjections(records: SourcePublishedKnowledgeRecord[]): KnowledgeItemProjection[] {
  const out: KnowledgeItemProjection[] = [];
  for (const record of records) {
    const projection = mapKnowledgeItemProjection(record);
    if (projection) out.push(projection);
  }
  return out;
}
