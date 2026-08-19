import { randomUUID } from "node:crypto";
const secretKey = /password|secret|token|authorization|cookie|database_url/i;
function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,secretKey.test(key)?"[REDACTED]":redact(item)])); return value; }
export function operationalLog(level:"info"|"warn"|"error",event:string,context:Record<string,unknown>={}) { const entry={timestamp:new Date().toISOString(),level,event,app:"seera-sales-distribution-os",environment:process.env.NODE_ENV??"unknown",context:redact(context)}; console[level](JSON.stringify(entry)); }

// PERFORMANCE PHASE 2 (server-timing observability): only logs when an operation actually exceeds
// the 1000ms performance-budget threshold, so this never touches the response path or adds
// overhead to the sub-1000ms case that's the overwhelming majority of calls. `operationId` is a
// best-effort correlation id, not a full end-to-end trace — the retailing-journey service functions
// (field-portal-service.ts, workflow-service.ts) run below the HTTP layer with no Request object to
// pull an existing x-request-id from, so a fresh id is minted per slow-operation instance instead;
// it still lets `stage()` sub-timings for the SAME slow call be correlated in log output. Never
// logs payload contents — only the operation name, stage labels, and durations, through the
// existing operationalLog() redaction path for defense in depth.
export function timeOperation(operation: string) {
  const operationId = randomUUID();
  const start = performance.now();
  const stages: Array<{ stage: string; ms: number }> = [];
  let last = start;
  return {
    operationId,
    stage(label: string) {
      const now = performance.now();
      stages.push({ stage: label, ms: Math.round(now - last) });
      last = now;
    },
    finish(context: Record<string, unknown> = {}) {
      const totalMs = Math.round(performance.now() - start);
      // PERF_TRACE_ALL=1 is a measurement-only override (never set in normal prod/dev) that logs
      // every call regardless of the 1000ms budget, for driving p50/p95/p98/max baselines with
      // scripts/seera/perf-baseline-*.ts — never enabled by default.
      if (totalMs > 1000 || process.env.PERF_TRACE_ALL === "1") operationalLog("warn", "performance.slow_operation", { operationId, operation, totalMs, stages, ...context });
      return totalMs;
    },
  };
}
