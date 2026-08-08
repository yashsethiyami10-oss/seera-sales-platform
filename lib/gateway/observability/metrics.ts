import { prisma } from "@/lib/prisma";

/**
 * MUV AI Gateway — Phase 5.6, summary metrics. Real aggregation over
 * `GatewayObservabilityEvent` — "suitable for future Founder/Admin
 * dashboards" means the query exists and returns real numbers today;
 * building the dashboard UI itself is out of this phase's scope (no UI
 * changes this Wave).
 *
 * Production Rollout v1.0, Stage 9 (Observability and Operations) added
 * the fields below `bySeverity` — success/fallback rate, p95 latency,
 * per-source breakdown, real token totals, and the no-result search
 * rate — computed the same way, real Prisma aggregation only, never
 * estimated. Percentile latency and per-tool "most used" need values
 * this DB's `groupBy` can't express directly (a percentile, and a JSON
 * metadata field respectively) — done via one bounded raw read and one
 * raw SQL query, documented at each call site.
 */
export async function getGatewayMetricsSummary(windowMs = 24 * 60 * 60 * 1000) {
  const since = new Date(Date.now() - windowMs);
  const whereSince = { createdAt: { gte: since } };

  const [byEventType, bySeverity, bySource, totalEvents, errorEvents, avgDuration, fallbackEvents, noResultEvents, commerceUsageEvents, durations] = await Promise.all([
    prisma.gatewayObservabilityEvent.groupBy({ by: ["eventType"], where: whereSince, _count: true }),
    prisma.gatewayObservabilityEvent.groupBy({ by: ["severity"], where: whereSince, _count: true }),
    prisma.gatewayObservabilityEvent.groupBy({ by: ["source"], where: whereSince, _count: true }),
    prisma.gatewayObservabilityEvent.count({ where: whereSince }),
    prisma.gatewayObservabilityEvent.count({ where: { ...whereSince, severity: { in: ["ERROR", "CRITICAL"] } } }),
    prisma.gatewayObservabilityEvent.aggregate({ where: { ...whereSince, durationMs: { not: null } }, _avg: { durationMs: true } }),
    prisma.gatewayObservabilityEvent.count({ where: { ...whereSince, message: { contains: "fell back to the legacy" } } }),
    prisma.gatewayObservabilityEvent.count({ where: { ...whereSince, message: { contains: "no verified match" } } }),
    prisma.gatewayObservabilityEvent.count({ where: { ...whereSince, eventType: "COMMERCE_TOOL_USAGE" } }),
    // Bounded raw read for percentile latency — Prisma has no portable
    // percentile aggregate; a 24h window of durationMs values at this
    // app's real traffic scale is a few thousand rows at most, so an
    // in-memory sort is fine. Documented v1 limit: a much higher-volume
    // production deployment would want a real percentile query
    // (PERCENTILE_CONT via $queryRaw) instead.
    prisma.gatewayObservabilityEvent.findMany({ where: { ...whereSince, durationMs: { not: null } }, select: { durationMs: true }, take: 10_000 }),
  ]);

  const sortedDurations = durations.map((d) => d.durationMs!).sort((a, b) => a - b);
  const p95Index = sortedDurations.length > 0 ? Math.min(sortedDurations.length - 1, Math.ceil(sortedDurations.length * 0.95) - 1) : -1;
  const p95DurationMs = p95Index >= 0 ? sortedDurations[p95Index]! : null;

  const tokenEvents = await prisma.gatewayObservabilityEvent.findMany({
    where: { ...whereSince, eventType: "TOKEN_USAGE" },
    select: { metadata: true },
  });
  const tokenTotals = tokenEvents.reduce(
    (acc, e) => {
      const meta = e.metadata as { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
      return {
        promptTokens: acc.promptTokens + (meta?.promptTokens ?? 0),
        completionTokens: acc.completionTokens + (meta?.completionTokens ?? 0),
        totalTokens: acc.totalTokens + (meta?.totalTokens ?? 0),
      };
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  // Most-used tool — `metadata->>'toolName'` is a JSON field; groupBy
  // can't target it portably, so this is one raw, read-only, parameterized
  // query over the same table every other metric here already reads.
  const mostUsedTools = await prisma.$queryRaw<{ tool_name: string; count: bigint }[]>`
    SELECT metadata->>'toolName' AS tool_name, COUNT(*) AS count
    FROM gateway_observability_events
    WHERE "createdAt" >= ${since} AND metadata->>'toolName' IS NOT NULL
    GROUP BY metadata->>'toolName'
    ORDER BY count DESC
    LIMIT 10
  `;

  return {
    windowMs,
    since: since.toISOString(),
    totalEvents,
    errorEvents,
    errorRate: totalEvents > 0 ? Math.round((errorEvents / totalEvents) * 1000) / 1000 : 0,
    successRate: totalEvents > 0 ? Math.round((1 - errorEvents / totalEvents) * 1000) / 1000 : 1,
    fallbackEvents,
    fallbackRate: totalEvents > 0 ? Math.round((fallbackEvents / totalEvents) * 1000) / 1000 : 0,
    averageDurationMs: avgDuration._avg.durationMs != null ? Math.round(avgDuration._avg.durationMs) : null,
    p95DurationMs,
    byEventType: Object.fromEntries(byEventType.map((r) => [r.eventType, r._count])),
    bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, r._count])),
    bySource: Object.fromEntries(bySource.map((r) => [r.source, r._count])),
    tokenTotals,
    noResultEvents,
    noResultSearchRate: commerceUsageEvents > 0 ? Math.round((noResultEvents / commerceUsageEvents) * 1000) / 1000 : 0,
    mostUsedTools: mostUsedTools.map((r) => ({ toolName: r.tool_name, count: Number(r.count) })),
  };
}

/**
 * "Approximate provider cost if deterministically calculable from
 * configured pricing" — deliberately N/A by default rather than a
 * fabricated number: this codebase has no authoritative, current
 * Anthropic per-token price configured anywhere, and guessing one would
 * violate the same "never invent a number" discipline the whole
 * grounding pipeline exists to enforce. Set `GATEWAY_PROVIDER_INPUT_PRICE_PER_1K`/
 * `GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K` (USD per 1,000 tokens) to enable
 * a real calculation from real recorded token totals.
 */
export async function getProviderCostEstimate(windowMs = 24 * 60 * 60 * 1000): Promise<
  { available: true; estimatedUsd: number; promptTokens: number; completionTokens: number } | { available: false; reason: string }
> {
  const inputPrice = process.env.GATEWAY_PROVIDER_INPUT_PRICE_PER_1K;
  const outputPrice = process.env.GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K;
  if (!inputPrice || !outputPrice) {
    return { available: false, reason: "No GATEWAY_PROVIDER_INPUT_PRICE_PER_1K/GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K configured — cost cannot be calculated without a real, Founder-confirmed price." };
  }
  const since = new Date(Date.now() - windowMs);
  const tokenEvents = await prisma.gatewayObservabilityEvent.findMany({
    where: { createdAt: { gte: since }, eventType: "TOKEN_USAGE" },
    select: { metadata: true },
  });
  const totals = tokenEvents.reduce(
    (acc, e) => {
      const meta = e.metadata as { promptTokens?: number; completionTokens?: number } | null;
      return { promptTokens: acc.promptTokens + (meta?.promptTokens ?? 0), completionTokens: acc.completionTokens + (meta?.completionTokens ?? 0) };
    },
    { promptTokens: 0, completionTokens: 0 }
  );
  const estimatedUsd = (totals.promptTokens / 1000) * Number.parseFloat(inputPrice) + (totals.completionTokens / 1000) * Number.parseFloat(outputPrice);
  return { available: true, estimatedUsd: Math.round(estimatedUsd * 10_000) / 10_000, ...totals };
}

/** Real, unweighted helpful/not-helpful counts from `ExperienceFeedback`
 * — "customer feedback if already supported" (it already is, Website
 * Wave 2). `rating` is 5 for helpful, 1 for not-helpful (see
 * `actions/muv-ai-beta.ts`'s `submitMuvAiFeedback`) — never a free-text
 * comment surfaced here, since a dashboard must not show customer PII/
 * free text per this stage's own "no customer prompt content or PII in
 * dashboards" rule. */
export async function getCustomerFeedbackSummary(windowMs = 24 * 60 * 60 * 1000) {
  const since = new Date(Date.now() - windowMs);
  const [helpful, notHelpful] = await Promise.all([
    prisma.experienceFeedback.count({ where: { createdAt: { gte: since }, rating: 5 } }),
    prisma.experienceFeedback.count({ where: { createdAt: { gte: since }, rating: 1 } }),
  ]);
  const total = helpful + notHelpful;
  return { helpful, notHelpful, total, helpfulRate: total > 0 ? Math.round((helpful / total) * 1000) / 1000 : null };
}
