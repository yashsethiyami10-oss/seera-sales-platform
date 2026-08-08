import { resolveCallerClearance, layerAllowed } from "@/lib/retrieval/permissions";
import type { CallerClearance, PermissionLayer } from "@/lib/retrieval/types";
import type { KnowledgeFactorySourceType, RuntimeKnowledgeResult } from "@/lib/runtime/types";

/**
 * MUV AI Gateway — Phase 5.2.1 Foundation Stabilization, Task 2/3:
 * Knowledge Access Layer + Approval Enforcement.
 *
 * Reuses Module 5's EXISTING permission model (`PermissionLayer`:
 * PUBLIC/INTERNAL/CONFIDENTIAL, `CallerClearance`, `resolveCallerClearance()`,
 * `layerAllowed()`) rather than inventing a new tier system — "or
 * equivalent existing access model" per the Founder's own instruction.
 * The DB-backed half of the Knowledge API (`db-source.ts`) already goes
 * through this exact model inside `runRetrievalPipeline` — this file
 * brings the Knowledge-Factory-sourced half up to the same standard, it
 * does not create a second, parallel authorization system.
 *
 * DOMAIN -> LAYER MAPPING IS DELIBERATELY CONSERVATIVE: every Knowledge
 * Factory domain defaults to INTERNAL (STAFF/ADMIN only) except Founder
 * Intelligence (CONFIDENTIAL, ADMIN only). No domain is mapped to PUBLIC
 * today. Reason: the Knowledge Factory's own file-type breakdown mixes
 * genuinely customer-safe content (FAQs, safety info, usage guidance)
 * with internal-only content (Manufacturing SOP, Batch Reconciliation,
 * Quality Control) WITHIN the same domain (e.g. PRODUCT_KF), and no
 * structural per-KO field reliably distinguishes them. Per the Founder's
 * own "if ambiguity exists, never guess": this fails closed until a
 * real, Founder-reviewed per-category classification exists — a real,
 * separate follow-up, not something invented here. This has zero effect
 * on current behavior: nothing customer-facing calls the Knowledge API
 * yet, so no caller today loses access to anything it previously had.
 */
const KF_DOMAIN_LAYER: Record<KnowledgeFactorySourceType, PermissionLayer> = {
  PRODUCT_KF: "INTERNAL",
  MARKETING_KF: "INTERNAL",
  CUSTOMER_CARE_KF: "INTERNAL",
  INSTITUTIONAL_SALES_KF: "INTERNAL",
  FOUNDER_INTELLIGENCE_KF: "CONFIDENTIAL",
};

export function kfDomainLayer(domain: KnowledgeFactorySourceType): PermissionLayer {
  return KF_DOMAIN_LAYER[domain];
}

/**
 * The Knowledge API's own clearance resolution — always server-derived
 * from the real session, never accepted as a parameter from a caller.
 * Every Knowledge API function calls this itself; "the Knowledge API
 * becomes responsible for authorization, callers should never implement
 * their own filtering" means exactly this: a caller never passes
 * clearance in, and never has to re-check or re-filter a result
 * afterward — by the time a result is returned, it has already passed
 * this gate.
 */
export async function resolveKnowledgeCallerClearance(): Promise<CallerClearance> {
  return resolveCallerClearance();
}

/**
 * Only APPROVED-tier content may ever be returned. REVIEW_READY, DRAFT,
 * OPEN_PENDING_FOUNDER_INPUT, and an unclassifiable ("UNKNOWN") approval
 * status are all excluded identically — none of them is a production-
 * ready state, and none is silently treated as "probably fine."
 * `RuntimeKnowledgeResult.status` carries the Knowledge Factory's
 * literal approval-tier text for KF-sourced results (see
 * `knowledge-factory-retrieval.ts`'s `toRuntimeResult()`) — this is the
 * one, single check that decides eligibility.
 */
function isApprovedForRetrieval(record: RuntimeKnowledgeResult): boolean {
  return record.status === "APPROVED";
}

/**
 * The single authorization + approval gate every Knowledge-Factory-
 * sourced result passes through before it can ever appear in a Knowledge
 * API response. Pure and synchronous (unlike `resolveKnowledgeCallerClearance()`,
 * which needs a request context) — independently testable with a
 * synthetic clearance and synthetic results, no auth/session required.
 *
 * A result missing domain provenance (should never happen given how
 * `knowledge-factory-retrieval.ts` builds `internalMetadata`, but never
 * assumed) is excluded rather than guessed into a layer.
 */
export function authorizeKfResults(results: RuntimeKnowledgeResult[], clearance: CallerClearance): RuntimeKnowledgeResult[] {
  return results.filter((r) => {
    if (!isApprovedForRetrieval(r)) return false;
    const meta = r.internalMetadata as { koFactoryDomain?: KnowledgeFactorySourceType } | null;
    const domain = meta?.koFactoryDomain;
    if (!domain) return false;
    return layerAllowed(kfDomainLayer(domain), clearance);
  });
}
