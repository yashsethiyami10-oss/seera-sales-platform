/**
 * MUV AI — Intelligence Population (Block 2B, Stage 3).
 *
 * Cross-layer integrity checks over the four populated intelligence
 * tables. Read-only — never mutates anything. Each check returns a list
 * of concrete findings (empty = clean) rather than a boolean, so a
 * caller/report can enumerate exactly what's wrong.
 */

import { prisma } from "@/lib/prisma";

export type IntegrityFinding = { check: string; recordId: string; detail: string };

/** ProductIntelligence/ProblemIntelligence/CareIntelligence rows whose
 * productId (or, for Care, relatedProducts) no longer resolves to a real
 * Product — a hard failure mode: the record would be un-groundable. */
export async function findOrphanedProductReferences(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const [productIntel, realProductIds] = await Promise.all([
    prisma.productIntelligence.findMany({ select: { id: true, productId: true } }),
    prisma.product.findMany({ select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  for (const pi of productIntel) {
    if (!realProductIds.has(pi.productId)) {
      findings.push({ check: "ORPHANED_PRODUCT_REFERENCE", recordId: pi.id, detail: `ProductIntelligence.productId=${pi.productId} does not resolve to a real Product.` });
    }
  }

  const careVersions = await prisma.careIntelligenceVersion.findMany({
    select: { id: true, careIntelligenceId: true, relatedProducts: { select: { id: true } } },
  });
  for (const v of careVersions) {
    for (const p of v.relatedProducts) {
      if (!realProductIds.has(p.id)) {
        findings.push({ check: "ORPHANED_PRODUCT_REFERENCE", recordId: v.careIntelligenceId, detail: `CareIntelligenceVersion ${v.id} relatedProducts includes non-existent Product ${p.id}.` });
      }
    }
  }
  return findings;
}

/** ProblemProductRelationship / CareIntelligence -> ProblemIntelligence
 * links whose target row has since disappeared (should be structurally
 * impossible given FK constraints, but checked directly rather than
 * assumed). */
export async function findBrokenCrossLayerLinks(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const [relationships, realProductIds, realProblemIds] = await Promise.all([
    prisma.problemProductRelationship.findMany({ select: { id: true, productId: true, versionId: true } }),
    prisma.product.findMany({ select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
    prisma.problemIntelligence.findMany({ select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  for (const rel of relationships) {
    if (!realProductIds.has(rel.productId)) {
      findings.push({ check: "BROKEN_CROSS_LAYER_LINK", recordId: rel.id, detail: `ProblemProductRelationship.productId=${rel.productId} does not resolve to a real Product.` });
    }
  }

  const careVersions = await prisma.careIntelligenceVersion.findMany({
    select: { id: true, careIntelligenceId: true, relatedProblemIntelligence: { select: { id: true } } },
  });
  for (const v of careVersions) {
    for (const pr of v.relatedProblemIntelligence) {
      if (!realProblemIds.has(pr.id)) {
        findings.push({ check: "BROKEN_CROSS_LAYER_LINK", recordId: v.careIntelligenceId, detail: `CareIntelligenceVersion ${v.id} relatedProblemIntelligence includes non-existent ProblemIntelligence ${pr.id}.` });
      }
    }
  }
  return findings;
}

/** Every ProductIntelligence row must key off a unique productId — the
 * frozen mapper's "one authoritative identity per Product" rule (a second
 * row for the same Product would mean two competing intelligence
 * authorities, which the writer's own upsert-by-productId already
 * prevents structurally; this re-verifies it directly against the DB). */
export async function findDuplicateProductIntelligenceIdentities(): Promise<IntegrityFinding[]> {
  const rows = await prisma.productIntelligence.findMany({ select: { id: true, productId: true } });
  const seen = new Map<string, string>();
  const findings: IntegrityFinding[] = [];
  for (const row of rows) {
    const prior = seen.get(row.productId);
    if (prior) {
      findings.push({ check: "DUPLICATE_PRODUCT_INTELLIGENCE_IDENTITY", recordId: row.id, detail: `productId=${row.productId} already claimed by ProductIntelligence ${prior}.` });
    } else {
      seen.set(row.productId, row.id);
    }
  }
  return findings;
}

/** Every KnowledgeItem/ProductIntelligence/ProblemIntelligence/
 * CareIntelligence version created by Block 2B population must carry a
 * "Source:" citation in its changeNote (this is where sourceTrace lives —
 * see lib/knowledge-population's writers, none of the 4 target schemas
 * has a dedicated citation column). A version missing this is
 * ungoverned: it can no longer be traced back to an approved source. */
export async function findMissingSourceTrace(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const [kv, piv, priv, civ] = await Promise.all([
    prisma.knowledgeVersion.findMany({ select: { id: true, itemId: true, changeNote: true } }),
    prisma.productIntelligenceVersion.findMany({ select: { id: true, productIntelligenceId: true, changeNote: true } }),
    prisma.problemIntelligenceVersion.findMany({ select: { id: true, problemIntelligenceId: true, changeNote: true } }),
    prisma.careIntelligenceVersion.findMany({ select: { id: true, careIntelligenceId: true, changeNote: true } }),
  ]);
  for (const v of kv) if (!v.changeNote?.includes("Source:")) findings.push({ check: "MISSING_SOURCE_TRACE", recordId: v.itemId, detail: `KnowledgeVersion ${v.id} has no "Source:" citation in changeNote.` });
  for (const v of piv) if (!v.changeNote?.includes("Source:")) findings.push({ check: "MISSING_SOURCE_TRACE", recordId: v.productIntelligenceId, detail: `ProductIntelligenceVersion ${v.id} has no "Source:" citation in changeNote.` });
  for (const v of priv) if (!v.changeNote?.includes("Source:")) findings.push({ check: "MISSING_SOURCE_TRACE", recordId: v.problemIntelligenceId, detail: `ProblemIntelligenceVersion ${v.id} has no "Source:" citation in changeNote.` });
  for (const v of civ) if (!v.changeNote?.includes("Source:")) findings.push({ check: "MISSING_SOURCE_TRACE", recordId: v.careIntelligenceId, detail: `CareIntelligenceVersion ${v.id} has no "Source:" citation in changeNote.` });
  return findings;
}

/** Every version above must carry an explicit governance-relevant status
 * (DRAFT/REVIEW/PUBLISHED/ARCHIVED) and every parent row an explicit
 * layer (PUBLIC/INTERNAL/CONFIDENTIAL) — both are non-nullable columns in
 * the schema, so this check is a defense-in-depth re-verification rather
 * than a plausible failure mode, matching the same discipline as
 * lib/retrieval/pipeline.ts's own "Filter by Layer" re-check. */
export async function findMissingGovernanceMetadata(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const VALID_STATUSES = new Set(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]);
  const VALID_LAYERS = new Set(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]);

  const [ki, pi, pri, ci] = await Promise.all([
    prisma.knowledgeItem.findMany({ select: { id: true, layer: true } }),
    prisma.productIntelligence.findMany({ select: { id: true, layer: true } }),
    prisma.problemIntelligence.findMany({ select: { id: true, layer: true } }),
    prisma.careIntelligence.findMany({ select: { id: true, layer: true } }),
  ]);
  for (const row of [...ki, ...pi, ...pri, ...ci]) {
    if (!VALID_LAYERS.has(row.layer)) findings.push({ check: "MISSING_GOVERNANCE_METADATA", recordId: row.id, detail: `Invalid or missing layer: ${String(row.layer)}` });
  }

  const [kv, piv, priv, civ] = await Promise.all([
    prisma.knowledgeVersion.findMany({ select: { id: true, itemId: true, status: true } }),
    prisma.productIntelligenceVersion.findMany({ select: { id: true, productIntelligenceId: true, status: true } }),
    prisma.problemIntelligenceVersion.findMany({ select: { id: true, problemIntelligenceId: true, status: true } }),
    prisma.careIntelligenceVersion.findMany({ select: { id: true, careIntelligenceId: true, status: true } }),
  ]);
  for (const v of kv) if (!VALID_STATUSES.has(v.status)) findings.push({ check: "MISSING_GOVERNANCE_METADATA", recordId: v.itemId, detail: `KnowledgeVersion ${v.id} invalid status: ${String(v.status)}` });
  for (const v of piv) if (!VALID_STATUSES.has(v.status)) findings.push({ check: "MISSING_GOVERNANCE_METADATA", recordId: v.productIntelligenceId, detail: `ProductIntelligenceVersion ${v.id} invalid status: ${String(v.status)}` });
  for (const v of priv) if (!VALID_STATUSES.has(v.status)) findings.push({ check: "MISSING_GOVERNANCE_METADATA", recordId: v.problemIntelligenceId, detail: `ProblemIntelligenceVersion ${v.id} invalid status: ${String(v.status)}` });
  for (const v of civ) if (!VALID_STATUSES.has(v.status)) findings.push({ check: "MISSING_GOVERNANCE_METADATA", recordId: v.careIntelligenceId, detail: `CareIntelligenceVersion ${v.id} invalid status: ${String(v.status)}` });
  return findings;
}

/** Family inheritance must never let a sibling SKU's fragrance/name bleed
 * into another SKU's own ProductIntelligence.sections — each of the 3
 * Liquid Detergent SKUs (and any other family) must carry its own
 * distinct identity in `sections`, never a merged/generic family blob
 * that erases what's specific to that one Product. */
export async function findInvalidFamilyInheritance(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const products = await prisma.product.findMany({ select: { id: true, name: true, fragranceNotes: true } });
  const productById = new Map(products.map((p) => [p.id, p]));
  // Family members are grouped by every OTHER family member's own
  // distinguishing marker (fragrance, else full name) — used below to
  // confirm a sibling's marker is never the *only* one present.
  const rows = await prisma.productIntelligence.findMany({
    select: { id: true, productId: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { sections: true } } },
  });
  for (const row of rows) {
    const product = productById.get(row.productId);
    const sections = row.versions[0]?.sections as Record<string, unknown> | undefined;
    if (!product || !sections) continue;
    const sectionsText = JSON.stringify(sections).toLowerCase();
    // A family SKU's own distinguishing marker is its fragrance where one
    // is recorded (family content legitimately describes shared identity
    // — e.g. "MUV Liquid Detergent™" — at the family level, so the full
    // commercial name is not required verbatim); fall back to the full
    // name only for single-SKU products with no fragrance distinction.
    const ownMarker = (product.fragranceNotes || product.name).toLowerCase();
    if (ownMarker && !sectionsText.includes(ownMarker)) {
      findings.push({ check: "INVALID_FAMILY_INHERITANCE", recordId: row.id, detail: `ProductIntelligence for "${product.name}" never mentions its own distinguishing marker ("${ownMarker}") anywhere in sections — the content may have inherited only a sibling's or the family's generic identity.` });
    }
  }
  return findings;
}

/** A ProductIntelligence/ProblemIntelligence/CareIntelligence row that
 * grounds itself in a Product whose own status is no longer ACTIVE
 * (DRAFT/ARCHIVED) is referencing an inactive source — real, but flagged
 * for Founder awareness rather than treated as fatal, since a since-
 * archived Product is a legitimate real-world event, not necessarily a
 * population bug. */
export async function findInactiveSourceReferences(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const products = await prisma.product.findMany({ select: { id: true, name: true, status: true } });
  const inactiveIds = new Set(products.filter((p) => p.status !== "ACTIVE").map((p) => p.id));
  if (inactiveIds.size === 0) return findings;

  const productIntel = await prisma.productIntelligence.findMany({ select: { id: true, productId: true } });
  for (const pi of productIntel) {
    if (inactiveIds.has(pi.productId)) {
      findings.push({ check: "INACTIVE_SOURCE_REFERENCE", recordId: pi.id, detail: `ProductIntelligence.productId=${pi.productId} references a Product that is no longer ACTIVE.` });
    }
  }
  const relationships = await prisma.problemProductRelationship.findMany({ select: { id: true, productId: true } });
  for (const rel of relationships) {
    if (inactiveIds.has(rel.productId)) {
      findings.push({ check: "INACTIVE_SOURCE_REFERENCE", recordId: rel.id, detail: `ProblemProductRelationship.productId=${rel.productId} references a Product that is no longer ACTIVE.` });
    }
  }
  return findings;
}

/** Within a single ProblemIntelligenceVersion, the same Product must
 * never carry two contradictory suitability relationships (e.g. both
 * SUITABLE and NOT_SUITABLE) without an explicit `overrideJustification`
 * — an unexplained contradiction is an unsafe, ungoverned signal. */
export async function findConflictingSafetyRelationships(): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];
  const relationships = await prisma.problemProductRelationship.findMany({
    select: { id: true, versionId: true, productId: true, suitability: true, overrideJustification: true },
  });
  const byVersionProduct = new Map<string, typeof relationships>();
  for (const rel of relationships) {
    const key = `${rel.versionId}::${rel.productId}`;
    const list = byVersionProduct.get(key) ?? [];
    list.push(rel);
    byVersionProduct.set(key, list);
  }
  for (const [key, rels] of byVersionProduct) {
    if (rels.length < 2) continue;
    const distinctSuitabilities = new Set(rels.map((r) => r.suitability));
    if (distinctSuitabilities.size > 1 && rels.some((r) => !r.overrideJustification)) {
      findings.push({ check: "CONFLICTING_SAFETY_RELATIONSHIP", recordId: rels[0]!.id, detail: `${key} carries contradictory suitability values [${[...distinctSuitabilities].join(", ")}] with no override justification.` });
    }
  }
  return findings;
}

export type IntegrityReport = {
  orphanedProductReferences: IntegrityFinding[];
  brokenCrossLayerLinks: IntegrityFinding[];
  duplicateProductIntelligenceIdentities: IntegrityFinding[];
  missingSourceTrace: IntegrityFinding[];
  missingGovernanceMetadata: IntegrityFinding[];
  invalidFamilyInheritance: IntegrityFinding[];
  inactiveSourceReferences: IntegrityFinding[];
  conflictingSafetyRelationships: IntegrityFinding[];
  totalFindings: number;
};

export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const [
    orphanedProductReferences,
    brokenCrossLayerLinks,
    duplicateProductIntelligenceIdentities,
    missingSourceTrace,
    missingGovernanceMetadata,
    invalidFamilyInheritance,
    inactiveSourceReferences,
    conflictingSafetyRelationships,
  ] = await Promise.all([
    findOrphanedProductReferences(),
    findBrokenCrossLayerLinks(),
    findDuplicateProductIntelligenceIdentities(),
    findMissingSourceTrace(),
    findMissingGovernanceMetadata(),
    findInvalidFamilyInheritance(),
    findInactiveSourceReferences(),
    findConflictingSafetyRelationships(),
  ]);
  const totalFindings =
    orphanedProductReferences.length +
    brokenCrossLayerLinks.length +
    duplicateProductIntelligenceIdentities.length +
    missingSourceTrace.length +
    missingGovernanceMetadata.length +
    invalidFamilyInheritance.length +
    inactiveSourceReferences.length +
    conflictingSafetyRelationships.length;
  return {
    orphanedProductReferences,
    brokenCrossLayerLinks,
    duplicateProductIntelligenceIdentities,
    missingSourceTrace,
    missingGovernanceMetadata,
    invalidFamilyInheritance,
    inactiveSourceReferences,
    conflictingSafetyRelationships,
    totalFindings,
  };
}
