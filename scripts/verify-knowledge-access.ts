import { authorizeKfResults, kfDomainLayer } from "../lib/gateway/knowledge/authorization";
import { searchKnowledgeFactories } from "../lib/runtime/knowledge-factory-retrieval";
import type { CallerClearance } from "../lib/retrieval/types";
import type { RuntimeKnowledgeResult, KnowledgeFactorySourceType } from "../lib/runtime/types";

/**
 * MUV AI Gateway — permanent verification for Phase 5.2.1, Task 2/3
 * (Knowledge Access Layer + Approval Enforcement). Same
 * `scripts/verify-*.ts` convention as `verify-knowledge-publisher.ts` —
 * see that file's header for why (the newer Vitest suite is currently
 * broken in this environment for reasons unrelated to this task).
 *
 * `authorizeKfResults()` is deliberately pure and synchronous (no
 * `resolveCallerClearance()`/`auth()` call inside it) specifically so it
 * can be tested directly with synthetic clearances, without needing a
 * real Next.js request context — see `lib/gateway/knowledge/
 * authorization.ts`'s own doc comment.
 *
 * Run: `npx tsx scripts/verify-knowledge-access.ts` (or
 * `npm run verify:knowledge-access`).
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

const CLEARANCE: Record<"ANONYMOUS" | "CUSTOMER" | "STAFF" | "ADMIN", CallerClearance> = {
  ANONYMOUS: { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false },
  CUSTOMER: { role: "CUSTOMER", maxLayer: "PUBLIC", canAccessNonPublished: false },
  STAFF: { role: "STAFF", maxLayer: "INTERNAL", canAccessNonPublished: true },
  ADMIN: { role: "ADMIN", maxLayer: "CONFIDENTIAL", canAccessNonPublished: true },
};

function fakeResult(overrides: Partial<RuntimeKnowledgeResult> & { domain: KnowledgeFactorySourceType; approvalStatus: string }): RuntimeKnowledgeResult {
  const { domain, approvalStatus, ...rest } = overrides;
  return {
    sourceType: "KNOWLEDGE",
    recordId: "KO-FAKE-001",
    versionId: null,
    title: "Fake KO",
    summary: "Fake summary",
    layer: "INTERNAL",
    versionNumber: null,
    status: approvalStatus,
    priorityScore: 50,
    relationship: null,
    matchedFields: ["keyword"],
    confidence: 50,
    retrievedAt: new Date().toISOString(),
    sourceReferences: [],
    internalMetadata: { koFactoryDomain: domain, koid: "KO-FAKE-001", isGapRecord: false, sourceFile: "fake.md", fields: {} },
    retrievalMethods: ["KNOWLEDGE_FACTORY_FILE_INDEX"],
    authorityWeight: 0.8,
    ...rest,
  } as RuntimeKnowledgeResult;
}

async function main() {
  // ---- Domain -> layer mapping ----
  check(kfDomainLayer("FOUNDER_INTELLIGENCE_KF") === "CONFIDENTIAL", "domain mapping: FOUNDER_INTELLIGENCE_KF is CONFIDENTIAL");
  check(kfDomainLayer("INSTITUTIONAL_SALES_KF") === "INTERNAL", "domain mapping: INSTITUTIONAL_SALES_KF is INTERNAL");
  check(kfDomainLayer("PRODUCT_KF") === "INTERNAL", "domain mapping: PRODUCT_KF is INTERNAL (conservative default)");
  check(kfDomainLayer("MARKETING_KF") === "INTERNAL", "domain mapping: MARKETING_KF is INTERNAL (conservative default)");
  check(kfDomainLayer("CUSTOMER_CARE_KF") === "INTERNAL", "domain mapping: CUSTOMER_CARE_KF is INTERNAL (conservative default)");

  // ---- Approval enforcement: only APPROVED may ever pass ----
  const approvalStates = ["APPROVED", "REVIEW_READY", "DRAFT", "OPEN_PENDING_FOUNDER_INPUT", "UNKNOWN"];
  for (const status of approvalStates) {
    const result = fakeResult({ domain: "PRODUCT_KF", approvalStatus: status });
    const authorized = authorizeKfResults([result], CLEARANCE.ADMIN); // highest possible clearance
    const shouldPass = status === "APPROVED";
    check(
      authorized.length === (shouldPass ? 1 : 0),
      `approval enforcement: ${status} ${shouldPass ? "IS" : "is NOT"} returned even to ADMIN clearance`,
      { status, returned: authorized.length }
    );
  }

  // ---- Access-layer enforcement: caller clearance gates domain access ----
  const founderResult = fakeResult({ domain: "FOUNDER_INTELLIGENCE_KF", approvalStatus: "APPROVED" });
  check(authorizeKfResults([founderResult], CLEARANCE.ANONYMOUS).length === 0, "access layer: ANONYMOUS cannot see FOUNDER_INTELLIGENCE_KF");
  check(authorizeKfResults([founderResult], CLEARANCE.CUSTOMER).length === 0, "access layer: CUSTOMER cannot see FOUNDER_INTELLIGENCE_KF");
  check(authorizeKfResults([founderResult], CLEARANCE.STAFF).length === 0, "access layer: STAFF cannot see FOUNDER_INTELLIGENCE_KF (CONFIDENTIAL > INTERNAL)");
  check(authorizeKfResults([founderResult], CLEARANCE.ADMIN).length === 1, "access layer: ADMIN CAN see FOUNDER_INTELLIGENCE_KF");

  const institutionalResult = fakeResult({ domain: "INSTITUTIONAL_SALES_KF", approvalStatus: "APPROVED" });
  check(authorizeKfResults([institutionalResult], CLEARANCE.ANONYMOUS).length === 0, "access layer: ANONYMOUS cannot see INSTITUTIONAL_SALES_KF");
  check(authorizeKfResults([institutionalResult], CLEARANCE.CUSTOMER).length === 0, "access layer: CUSTOMER cannot see INSTITUTIONAL_SALES_KF");
  check(authorizeKfResults([institutionalResult], CLEARANCE.STAFF).length === 1, "access layer: STAFF CAN see INSTITUTIONAL_SALES_KF (INTERNAL)");
  check(authorizeKfResults([institutionalResult], CLEARANCE.ADMIN).length === 1, "access layer: ADMIN CAN see INSTITUTIONAL_SALES_KF");

  const productResult = fakeResult({ domain: "PRODUCT_KF", approvalStatus: "APPROVED" });
  check(authorizeKfResults([productResult], CLEARANCE.CUSTOMER).length === 0, "access layer: CUSTOMER cannot see PRODUCT_KF today (conservative INTERNAL default)");
  check(authorizeKfResults([productResult], CLEARANCE.STAFF).length === 1, "access layer: STAFF CAN see PRODUCT_KF");

  // ---- Missing domain provenance -> never guess, exclude ----
  const noDomainResult = fakeResult({ domain: "PRODUCT_KF", approvalStatus: "APPROVED", internalMetadata: null });
  check(authorizeKfResults([noDomainResult], CLEARANCE.ADMIN).length === 0, "never-guess: a result with no verifiable domain is excluded even for ADMIN");

  // ---- Combined: approval AND access must both pass ----
  const approvedButConfidential = fakeResult({ domain: "FOUNDER_INTELLIGENCE_KF", approvalStatus: "APPROVED" });
  const unapprovedButAccessible = fakeResult({ domain: "PRODUCT_KF", approvalStatus: "DRAFT" });
  check(authorizeKfResults([approvedButConfidential], CLEARANCE.STAFF).length === 0, "combined: approved-but-over-clearance is excluded");
  check(authorizeKfResults([unapprovedButAccessible], CLEARANCE.ADMIN).length === 0, "combined: accessible-but-unapproved is excluded even for ADMIN");

  // ---- Real-world sanity check against the actual Knowledge Factory ----
  const realFounderResults = searchKnowledgeFactories({ domains: ["FOUNDER_INTELLIGENCE_KF"], keywords: "founder", limit: 20 });
  if (realFounderResults.length > 0) {
    const realAuthorizedForCustomer = authorizeKfResults(realFounderResults, CLEARANCE.CUSTOMER);
    check(realAuthorizedForCustomer.length === 0, "real-world: real Founder Intelligence content is never returned to a CUSTOMER clearance");
  } else {
    console.log("(skipped real-world Founder Intelligence check — no matching real results for this keyword)");
  }

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
