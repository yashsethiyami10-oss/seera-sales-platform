import { executePipeline } from "@/lib/execution/execution-orchestrator";
import { buildSmokeDecisionPackage } from "./health-monitor";
import type { ModuleTiming, PerformanceReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Performance Validator.
 *
 * "No benchmarking infrastructure." This is a single, deterministic smoke
 * -timing pass — one run, real wall-clock measurements via
 * `performance.now()`/`process.memoryUsage()` — not a load-testing suite,
 * not percentiles across N iterations, not a persisted history. Reuses
 * `buildSmokeDecisionPackage()` from `health-monitor.ts` rather than
 * defining its own fixture.
 *
 * Only Module 7's Execution Core is timed directly — it is the one layer
 * in this platform with zero I/O (no DB, no request-scope dependency),
 * so it is the only one that can be measured with a plain, honest,
 * single-process-clock timestamp. Timing Modules 5/6/8 meaningfully would
 * require a real request context this validator does not have — see
 * `known-limitations.md` rather than fabricating a number for them.
 */

const PIPELINE_LATENCY_THRESHOLD_MS = 50;

export function runPerformanceValidation(): PerformanceReport {
  const fixture = buildSmokeDecisionPackage();

  const start = performance.now();
  const result = executePipeline({ decisionPackage: fixture, clearanceLayer: "PUBLIC" });
  const pipelineLatencyMs = performance.now() - start;

  const moduleTimings: ModuleTiming[] = [{ module: "Module 7 - Execution Core (full pipeline)", durationMs: pipelineLatencyMs }];

  const memoryUsageMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const responseSizeBytes = Buffer.byteLength(JSON.stringify(result), "utf-8");

  return {
    pipelineLatencyMs,
    moduleTimings,
    memoryUsageMb,
    responseSizeBytes,
    executionStages: result.audit.pipelineStages,
    withinThresholds: pipelineLatencyMs < PIPELINE_LATENCY_THRESHOLD_MS,
    generatedAt: new Date().toISOString(),
  };
}
