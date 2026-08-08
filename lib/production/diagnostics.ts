import { validateEnv } from "@/lib/env";
import { evaluatePriority } from "@/lib/intelligence/priority-engine";
import { executePipeline } from "@/lib/execution/execution-orchestrator";
import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import { getSystemHealth } from "./health-monitor";
import { getFeatureFlags } from "./feature-flags";
import { getVersionRegistry, MODULE_VERSIONS } from "./version-registry";
import type { DiagnosticCheck, DiagnosticsReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) System Diagnostics.
 *
 * "Validate: Required modules loaded, Missing dependencies, Invalid
 * configuration, Version mismatch, Broken references. Return structured
 * diagnostics." Five fixed categories, each a deterministic, computation
 * -only check — no network calls beyond the DB round-trips
 * `getSystemHealth()` already performs.
 */

function checkModulesLoaded(): DiagnosticCheck {
  const requiredFunctions: [string, unknown][] = [
    ["evaluatePriority (Module 6)", evaluatePriority],
    ["executePipeline (Module 7)", executePipeline],
    ["runRetrievalPipeline (Module 5)", runRetrievalPipeline],
  ];
  const missing = requiredFunctions.filter(([, fn]) => typeof fn !== "function").map(([name]) => name);
  return {
    category: "MODULES_LOADED",
    passed: missing.length === 0,
    message: missing.length === 0 ? "All required module entry points loaded." : `Missing entry points: ${missing.join(", ")}`,
  };
}

function checkDependencies(): DiagnosticCheck {
  const { ok, missing } = validateEnv();
  return {
    category: "DEPENDENCIES",
    passed: ok,
    message: ok ? "All unconditionally-required environment variables are set." : `Missing required env var(s): ${missing.join(", ")}`,
  };
}

function checkConfiguration(): DiagnosticCheck {
  const flags = getFeatureFlags();
  const invalidFlags = Object.entries(flags).filter(([, v]) => typeof v !== "boolean");
  return {
    category: "CONFIGURATION",
    passed: invalidFlags.length === 0,
    message: invalidFlags.length === 0 ? "Feature flag configuration is valid." : `Invalid flag value(s): ${invalidFlags.map(([k]) => k).join(", ")}`,
  };
}

function checkVersion(): DiagnosticCheck {
  const registry = getVersionRegistry();
  const expectedModuleCount = 9;
  const moduleCount = Object.keys(MODULE_VERSIONS).length;
  const malformed = Object.entries(MODULE_VERSIONS).filter(([, v]) => !v || v.trim().length === 0);
  const passed = moduleCount === expectedModuleCount && malformed.length === 0 && registry.architectureVersion.length > 0;
  return {
    category: "VERSION",
    passed,
    message: passed
      ? `${moduleCount} module version(s) registered, architecture version "${registry.architectureVersion}".`
      : `Version registry inconsistency: ${moduleCount}/${expectedModuleCount} modules registered${malformed.length ? `, ${malformed.length} malformed entry(ies)` : ""}.`,
  };
}

async function checkReferences(): Promise<DiagnosticCheck> {
  const health = await getSystemHealth();
  const unavailable = health.layers.filter((l) => l.status === "UNAVAILABLE");
  return {
    category: "REFERENCES",
    passed: unavailable.length === 0,
    message: unavailable.length === 0 ? "No broken references detected across all 5 layers." : `Broken reference(s) in: ${unavailable.map((l) => l.layer).join(", ")}`,
  };
}

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheck[] = [
    checkModulesLoaded(),
    checkDependencies(),
    checkConfiguration(),
    checkVersion(),
    await checkReferences(),
  ];

  const failed = checks.filter((c) => !c.passed);
  const overallStatus: DiagnosticsReport["overallStatus"] =
    failed.length === 0 ? "PASS" : failed.some((c) => c.category === "MODULES_LOADED" || c.category === "DEPENDENCIES") ? "FAIL" : "WARN";

  return { overallStatus, checks, generatedAt: new Date().toISOString() };
}
