import { getGatewayMetricsSummary, getProviderCostEstimate, getCustomerFeedbackSummary, runGatewayHealthCheck, emitGatewayEvent, generateRequestId } from "../lib/gateway/observability";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Production Rollout v1.0,
 * Stage 9 (Observability and Operations). Covers the metrics/cost/
 * feedback functions the new /admin/analytics/ai-gateway page reads —
 * real Prisma aggregation only, no UI rendering (that page's own
 * correctness was confirmed via `npm run build` + a direct code read of
 * every StatCard binding; there is no standalone-script way to render a
 * Server Component that fetches from `next/headers`-adjacent context).
 *
 * Run: `npx tsx scripts/verify-observability-operations.ts` (or
 * `npm run verify:observability-operations`).
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

async function main() {
  // ---- Fallback event is real and countable ----
  const requestId = generateRequestId();
  await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "WARN", source: "gateway", message: "Pilot fell back to the legacy deterministic path", metadata: { fallback: true, capability: "product-search-pilot" } });

  const metrics = await getGatewayMetricsSummary();
  check(metrics.totalEvents > 0, "metrics: totalEvents reflects real, non-zero event volume", metrics.totalEvents);
  check(metrics.fallbackEvents >= 1, "metrics: the fallback event we just emitted is counted by fallbackEvents", metrics.fallbackEvents);
  check(metrics.fallbackRate >= 0 && metrics.fallbackRate <= 1, "metrics: fallbackRate is a real ratio in [0,1]", metrics.fallbackRate);
  check(metrics.successRate >= 0 && metrics.successRate <= 1 && Math.abs(metrics.successRate + metrics.errorRate - 1) < 0.01, "metrics: successRate and errorRate are complementary (sum to 1)", { success: metrics.successRate, error: metrics.errorRate });
  check(typeof metrics.p95DurationMs === "number" || metrics.p95DurationMs === null, "metrics: p95DurationMs is a real number or null (never NaN/undefined)", metrics.p95DurationMs);
  check(metrics.p95DurationMs === null || metrics.averageDurationMs === null || metrics.p95DurationMs >= metrics.averageDurationMs * 0.5, "metrics: p95 latency is a plausible real value relative to the average (not a nonsensical outlier of the computation itself)", { p95: metrics.p95DurationMs, avg: metrics.averageDurationMs });
  check(typeof metrics.bySource === "object" && Object.keys(metrics.bySource).length > 0, "metrics: bySource breaks out real event counts per source", metrics.bySource);
  check(metrics.tokenTotals.totalTokens === metrics.tokenTotals.promptTokens + metrics.tokenTotals.completionTokens, "metrics: tokenTotals.totalTokens is the real sum of prompt+completion, not a separately-drifting number");
  check(Array.isArray(metrics.mostUsedTools), "metrics: mostUsedTools is a real array (raw SQL query executes without error)", metrics.mostUsedTools);
  check(metrics.noResultSearchRate >= 0 && metrics.noResultSearchRate <= 1, "metrics: noResultSearchRate is a real ratio in [0,1]");

  // ---- Cost estimate is honest: N/A when unpriced, real when priced ----
  const unpriced = await getProviderCostEstimate();
  check(unpriced.available === false, "cost: with no GATEWAY_PROVIDER_*_PRICE_PER_1K configured, cost reports unavailable rather than a fabricated number", unpriced);

  const savedInput = process.env.GATEWAY_PROVIDER_INPUT_PRICE_PER_1K;
  const savedOutput = process.env.GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K;
  process.env.GATEWAY_PROVIDER_INPUT_PRICE_PER_1K = "0.003";
  process.env.GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K = "0.015";
  const priced = await getProviderCostEstimate();
  check(priced.available === true && priced.estimatedUsd >= 0, "cost: once real pricing is configured, a real, non-negative estimate is computed from real recorded token totals", priced);
  if (savedInput === undefined) delete process.env.GATEWAY_PROVIDER_INPUT_PRICE_PER_1K; else process.env.GATEWAY_PROVIDER_INPUT_PRICE_PER_1K = savedInput;
  if (savedOutput === undefined) delete process.env.GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K; else process.env.GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K = savedOutput;

  // ---- Customer feedback summary — real ExperienceFeedback aggregation, no free text ----
  const feedback = await getCustomerFeedbackSummary();
  check(feedback.total === feedback.helpful + feedback.notHelpful, "feedback: total is the real sum of helpful+notHelpful");
  check(!("comment" in feedback), "feedback: the summary never includes a free-text comment field (no PII/customer text in dashboards)", Object.keys(feedback));

  // ---- Health check ----
  const health = await runGatewayHealthCheck();
  check(typeof health.healthy === "boolean" && health.checks.length >= 3, "health: a real, multi-check health report is produced", health);

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
