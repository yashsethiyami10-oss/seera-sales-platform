import fs from "fs";
import path from "path";
import type { VersionRegistry } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Version Registry.
 *
 * "Track: Architecture Version, Module Versions, Schema Version, AI
 * Version, Build Version, Deployment Timestamp. No automatic migrations."
 * Everything here is a fixed constant or a value read from an existing
 * file/env var — nothing is computed by inspecting `prisma/schema.prisma`
 * or running a migration command, which is exactly what "no automatic
 * migrations" rules out.
 */

export const ARCHITECTURE_VERSION = "MUV AI v1.0";
export const AI_VERSION = "MUV AI v1.0";

/** Bumped manually alongside genuine `prisma/schema.prisma` changes —
 * never derived automatically from the schema file itself, per "no
 * automatic migrations." */
export const SCHEMA_VERSION = "1.0";

/** One entry per frozen module (1–8) plus this one, in-progress. Bumped
 * manually when a module's own architecture is revised (e.g. Module 7's
 * post-founder-review safety short-circuit correction would have earned a
 * "1.1" here, had this registry existed at the time). */
export const MODULE_VERSIONS: Record<string, string> = {
  "Module 1 - Knowledge Foundation": "1.0",
  "Module 2 - Product Intelligence Foundation": "1.0",
  "Module 3 - Problem Intelligence Foundation": "1.0",
  "Module 4 - Care Intelligence Foundation": "1.0",
  "Module 5 - Knowledge Retrieval Core": "1.0",
  "Module 6 - Intelligence Core": "1.0",
  "Module 7 - Execution Core": "1.0",
  "Module 8 - Experience Platform": "1.0",
  "Module 9 - Production Readiness & AI Governance": "1.0",
};

function readBuildVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * No real deployment pipeline exists in this project (infrastructure
 * provisioning is explicitly out of this module's scope) — so there is no
 * genuine "when was this deployed" signal to read. `DEPLOYMENT_TIMESTAMP`
 * is honored if a deploy step sets it; otherwise this honestly reports
 * the running process's own start time, labeled as such rather than
 * pretending it's a real deployment timestamp.
 */
function readDeploymentTimestamp(): { value: string; source: "env" | "process-start" } {
  const fromEnv = process.env.DEPLOYMENT_TIMESTAMP;
  if (fromEnv) return { value: fromEnv, source: "env" };
  const processStart = new Date(Date.now() - process.uptime() * 1000).toISOString();
  return { value: processStart, source: "process-start" };
}

export function getVersionRegistry(): VersionRegistry {
  const deployment = readDeploymentTimestamp();
  return {
    architectureVersion: ARCHITECTURE_VERSION,
    aiVersion: AI_VERSION,
    schemaVersion: SCHEMA_VERSION,
    buildVersion: readBuildVersion(),
    moduleVersions: MODULE_VERSIONS,
    deploymentTimestamp: deployment.value,
    deploymentTimestampSource: deployment.source,
  };
}
