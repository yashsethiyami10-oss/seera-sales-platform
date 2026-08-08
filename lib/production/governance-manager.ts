import { ARCHITECTURE_VERSION, MODULE_VERSIONS } from "./version-registry";
import { validateDeployment } from "./deployment-validator";
import type { FounderApprovalStatus, GovernanceStatus } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Governance Manager.
 *
 * "Prepare governance metadata... No database redesign unless necessary."
 * Everything here is derived from fixed constants
 * (`ARCHITECTURE_VERSION`/`MODULE_VERSIONS`) and this module's own
 * `deployment-validator.ts` — no new table, no workflow engine. Founder
 * approval status is recorded here as a fixed, hand-maintained map
 * reflecting this conversation's own actual history (Module 7 was
 * corrected once and then approved; every other module was approved
 * as-delivered) — not dynamically tracked, since no approval-workflow
 * system exists or was requested.
 */

const FROZEN_MODULES = [
  "Module 1 - Knowledge Foundation",
  "Module 2 - Product Intelligence Foundation",
  "Module 3 - Problem Intelligence Foundation",
  "Module 4 - Care Intelligence Foundation",
  "Module 5 - Knowledge Retrieval Core",
  "Module 6 - Intelligence Core",
  "Module 7 - Execution Core",
  "Module 8 - Experience Platform",
];

const FOUNDER_APPROVAL_STATUS: Record<string, FounderApprovalStatus> = {
  "Module 1 - Knowledge Foundation": "APPROVED",
  "Module 2 - Product Intelligence Foundation": "APPROVED",
  "Module 3 - Problem Intelligence Foundation": "APPROVED",
  "Module 4 - Care Intelligence Foundation": "APPROVED",
  "Module 5 - Knowledge Retrieval Core": "APPROVED",
  "Module 6 - Intelligence Core": "APPROVED",
  "Module 7 - Execution Core": "CORRECTED_AND_APPROVED",
  "Module 8 - Experience Platform": "APPROVED",
  "Module 9 - Production Readiness & AI Governance": "PENDING_REVIEW",
};

export async function getGovernanceStatus(): Promise<GovernanceStatus> {
  const deployment = await validateDeployment();

  return {
    activeVersion: ARCHITECTURE_VERSION,
    approvedModules: Object.keys(FOUNDER_APPROVAL_STATUS).filter((m) => FOUNDER_APPROVAL_STATUS[m] !== "PENDING_REVIEW"),
    frozenModules: FROZEN_MODULES,
    founderApprovalStatus: FOUNDER_APPROVAL_STATUS,
    deploymentStatus: deployment.ready ? "READY" : "NOT_READY",
    upgradeReadiness: Object.keys(MODULE_VERSIONS).length === 9
      ? "Module 9 is the last implemented module; no Module 10 specification exists yet — no pending upgrade."
      : "Module version registry is inconsistent with the expected 9-module count — upgrade readiness cannot be confirmed.",
    generatedAt: new Date().toISOString(),
  };
}
