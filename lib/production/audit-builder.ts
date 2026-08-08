import { getSystemHealth } from "./health-monitor";
import { runSecurityValidation } from "./security-validator";
import { runPerformanceValidation } from "./performance-validator";
import { validateDeployment } from "./deployment-validator";
import { getGovernanceStatus } from "./governance-manager";
import { getVersionRegistry, MODULE_VERSIONS } from "./version-registry";
import type { AuditReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Audit Builder.
 *
 * "Generate structured audit reports... No chain-of-thought." Pure
 * assembly — every field here was already computed by one of this
 * module's own other files; nothing new is calculated. Mirrors the same
 * "Package Builder" pattern Module 6's `decision-package.ts` and Module
 * 7's `execution-package.ts` already established: bundle, don't compute.
 */

export async function generateAudit(): Promise<AuditReport> {
  const [health, security, performance, governance, deployment] = await Promise.all([
    getSystemHealth(),
    Promise.resolve(runSecurityValidation()),
    Promise.resolve(runPerformanceValidation()),
    getGovernanceStatus(),
    validateDeployment(),
  ]);

  const moduleStatus: Record<string, "FROZEN" | "IN_PROGRESS"> = {};
  for (const name of Object.keys(MODULE_VERSIONS)) {
    moduleStatus[name] = name.startsWith("Module 9") ? "IN_PROGRESS" : "FROZEN";
  }

  return {
    moduleStatus,
    health,
    security,
    performance,
    governance,
    version: getVersionRegistry(),
    readiness: deployment,
    generatedAt: new Date().toISOString(),
  };
}
