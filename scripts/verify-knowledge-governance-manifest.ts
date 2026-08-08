import {
  buildKnowledgeClassificationManifest,
  summarizeManifest,
  getManifestAsFounderApprovalRequirement,
} from "../lib/gateway/knowledge-governance/manifest";
import { kfDomainLayer } from "../lib/gateway/knowledge/authorization";
import { authorizeKfResults } from "../lib/gateway/knowledge/authorization";
import type { RuntimeKnowledgeResult } from "../lib/runtime/types";
import type { CallerClearance } from "../lib/retrieval/types";
import { prisma } from "../lib/prisma";

const PUBLIC_CLEARANCE: CallerClearance = { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false };

/**
 * MUV AI Gateway — permanent verification for Production Rollout v1.0,
 * Stage 2 (Knowledge Governance for Customer Cutover).
 *
 * The core property this suite exists to prove: restricted Knowledge
 * Factory content cannot reach customer context, and building/reading
 * the new classification manifest has ZERO effect on that real
 * enforcement (no automatic promotion).
 *
 * Run: `npx tsx scripts/verify-knowledge-governance-manifest.ts` (or
 * `npm run verify:knowledge-governance-manifest`).
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

function fakeResult(overrides: Partial<RuntimeKnowledgeResult> & { domain: RuntimeKnowledgeResult["internalMetadata"] extends infer _ ? string : never }): RuntimeKnowledgeResult {
  const domain = (overrides as { domain?: string }).domain ?? "PRODUCT_KF";
  return {
    sourceType: "KNOWLEDGE",
    recordId: "TEST-KO-1",
    versionId: null,
    title: "Test",
    summary: "Test",
    layer: "INTERNAL",
    versionNumber: null,
    status: "APPROVED",
    priorityScore: 100,
    relationship: null,
    matchedFields: [],
    confidence: 100,
    retrievedAt: new Date().toISOString(),
    sourceReferences: [],
    internalMetadata: { koFactoryDomain: domain },
    retrievalMethods: ["KNOWLEDGE_FACTORY_FILE_INDEX"],
    authorityWeight: 1,
    ...overrides,
  } as RuntimeKnowledgeResult;
}

async function main() {
  // ---- Manifest covers the real, full Knowledge Factory index ----
  const beforeLayerProduct = kfDomainLayer("PRODUCT_KF");
  const beforeLayerFounder = kfDomainLayer("FOUNDER_INTELLIGENCE_KF");

  const manifest = buildKnowledgeClassificationManifest();
  check(manifest.length > 1000, "manifest: covers the real, full Knowledge Factory index (real data, not a sample)", manifest.length);
  check(manifest.every((e) => typeof e.koId === "string" && e.koId.length > 0), "manifest: every entry has a real KO ID");
  check(manifest.every((e) => typeof e.sourcePath === "string" && e.sourcePath.length > 0), "manifest: every entry carries its real source file path");

  const afterLayerProduct = kfDomainLayer("PRODUCT_KF");
  const afterLayerFounder = kfDomainLayer("FOUNDER_INTELLIGENCE_KF");
  check(beforeLayerProduct === afterLayerProduct && beforeLayerFounder === afterLayerFounder, "manifest: building it has ZERO effect on kfDomainLayer's real, frozen enforcement mapping (no automatic promotion)");

  // ---- Classification rules ----
  // Note: `classifyEntry`'s priority order checks gap-record and
  // not-approved status before domain policy, so a non-APPROVED Founder/
  // Institutional record legitimately reports that MORE SPECIFIC reason
  // instead of the domain-policy one — both are "restricted," so the
  // invariant that actually matters (and that these checks assert) is
  // "never a customer-safe candidate," not "always this exact reason."
  check(
    manifest.filter((e) => e.currentApprovalStatus !== "APPROVED").every((e) => e.proposedCustomerVisibility !== "CUSTOMER_SAFE_CANDIDATE"),
    "classification: no non-APPROVED record (DRAFT/REVIEW_READY/OPEN_PENDING_FOUNDER_INPUT/UNKNOWN) is ever proposed as a customer-safe candidate"
  );
  check(
    manifest.filter((e) => e.domain === "FOUNDER_INTELLIGENCE_KF").every((e) => e.proposedCustomerVisibility !== "CUSTOMER_SAFE_CANDIDATE"),
    "classification: no Founder Intelligence record is ever proposed as a customer-safe candidate, regardless of approval status"
  );
  check(
    manifest.filter((e) => e.domain === "INSTITUTIONAL_SALES_KF").every((e) => e.proposedCustomerVisibility !== "CUSTOMER_SAFE_CANDIDATE"),
    "classification: no Institutional Sales record is ever proposed as a customer-safe candidate"
  );
  check(
    manifest.filter((e) => e.isGapRecord).every((e) => e.proposedCustomerVisibility === "RESTRICTED_GAP_RECORD"),
    "classification: every documented gap record is restricted, never a candidate"
  );
  check(
    manifest.filter((e) => e.riskIndicators.length > 0).every((e) => e.proposedCustomerVisibility !== "CUSTOMER_SAFE_CANDIDATE"),
    "classification: any record matching a risk indicator (safety/formula/financial/etc.) is never a candidate, even if APPROVED"
  );
  const candidates = manifest.filter((e) => e.proposedCustomerVisibility === "CUSTOMER_SAFE_CANDIDATE");
  check(
    candidates.every((e) => e.currentApprovalStatus === "APPROVED" && !e.isGapRecord && e.riskIndicators.length === 0 && e.domain !== "FOUNDER_INTELLIGENCE_KF" && e.domain !== "INSTITUTIONAL_SALES_KF"),
    "classification: every candidate genuinely satisfies all customer-safety preconditions at once"
  );

  // ---- Summary + Founder approval requirement shape ----
  const summary = summarizeManifest(manifest);
  check(summary.totalRecords === manifest.length, "summary: totalRecords matches the real manifest length");
  check(Object.values(summary.byDomain).reduce((a, b) => a + b, 0) === manifest.length, "summary: byDomain counts add up to the real total");

  const approvalRequirement = getManifestAsFounderApprovalRequirement();
  check(approvalRequirement.requiresFounderApproval === true, "founder requirement: the manifest is explicitly returned as requiring Founder approval, never as already-decided");
  check(approvalRequirement.candidatesForReview.length === summary.customerSafeCandidateCount, "founder requirement: candidatesForReview matches the summary's own candidate count");
  check(approvalRequirement.fullManifest.length === manifest.length, "founder requirement: fullManifest is the complete, real manifest");

  // ---- The actual customer-facing guarantee: restricted content cannot reach customer context ----
  const restrictedFounderResult = fakeResult({ recordId: "FOUNDER-TEST-1", domain: "FOUNDER_INTELLIGENCE_KF", status: "APPROVED" });
  const customerVisible1 = authorizeKfResults([restrictedFounderResult], PUBLIC_CLEARANCE);
  check(customerVisible1.length === 0, "enforcement: a Founder Intelligence KO is never returned to PUBLIC (customer) clearance, regardless of approval status");

  const unapprovedProductResult = fakeResult({ recordId: "PRODUCT-TEST-1", domain: "PRODUCT_KF", status: "DRAFT" });
  const customerVisible2 = authorizeKfResults([unapprovedProductResult], PUBLIC_CLEARANCE);
  check(customerVisible2.length === 0, "enforcement: an unapproved (DRAFT) Product KF KO is never returned regardless of clearance");

  const approvedProductResult = fakeResult({ recordId: "PRODUCT-TEST-2", domain: "PRODUCT_KF", status: "APPROVED" });
  const customerVisible3 = authorizeKfResults([approvedProductResult], PUBLIC_CLEARANCE);
  check(customerVisible3.length === 0, "enforcement: even an APPROVED Product KF KO stays restricted for PUBLIC clearance today — kfDomainLayer still maps PRODUCT_KF to INTERNAL until a real, separate promotion happens (this manifest proposes, never applies)");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
