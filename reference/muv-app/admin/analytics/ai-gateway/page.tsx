import Link from "next/link";
import { getGatewayMetricsSummary, getProviderCostEstimate, getCustomerFeedbackSummary, runGatewayHealthCheck } from "@/lib/gateway/observability";
import { getGatewaySafeConfigSnapshot } from "@/lib/gateway/config";
import { getRolloutState } from "@/lib/gateway/security";

/**
 * MUV AI Gateway — Production Rollout v1.0, Stage 9 (Observability and
 * Operations). A new sub-page under the existing, frozen Founder
 * Operating System analytics surface (Phase 15) — not a redesign of it.
 * Same page-level protection as every other page under `/admin/*`:
 * `middleware.ts` gates the entire `/admin/:path*` tree to ADMIN/STAFF
 * roles at the edge (see that file's own header comment) — this page
 * follows the exact same, already-established convention as
 * `app/admin/analytics/page.tsx`, not a new one.
 *
 * Every number below is real Prisma aggregation over
 * `GatewayObservabilityEvent`/`ExperienceFeedback` — no forecasting, no
 * external analytics service. Deliberately shows counts/rates/
 * durations/tool names only — never a customer prompt, a free-text
 * feedback comment, or any other PII, per this stage's own "no customer
 * prompt content or PII in dashboards" rule.
 */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="muv-card">
      <p className="font-display muv-text-solid" style={{ fontSize: 20, fontWeight: 500 }}>{value}</p>
      <p className="muv-text-meta text-xs mt-1">{label}</p>
      {sub && <p className="muv-text-faint text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

// Live operational data — must never be statically cached/prerendered.
export const dynamic = "force-dynamic";

export default async function AiGatewayOperationsPage() {
  const [metrics, cost, feedback, health, config, rollout] = await Promise.all([
    getGatewayMetricsSummary(),
    getProviderCostEstimate(),
    getCustomerFeedbackSummary(),
    runGatewayHealthCheck(),
    Promise.resolve(getGatewaySafeConfigSnapshot()),
    Promise.resolve(getRolloutState()),
  ]);

  const enabledTools = rollout.filter((t) => t.enabled);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/analytics" className="muv-text-meta text-xs hover:underline">&larr; Analytics</Link>
        <h1 className="font-display muv-text-solid text-2xl mt-2">MUV AI Gateway — Operations</h1>
        <p className="muv-text-meta text-sm mt-1">
          Last {Math.round(metrics.windowMs / (60 * 60 * 1000))}h, since {new Date(metrics.since).toLocaleString("en-IN")}. Health: {health.healthy ? "Healthy" : "Degraded"}.
        </p>
      </div>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Traffic &amp; reliability</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total events" value={metrics.totalEvents} />
          <StatCard label="Success rate" value={pct(metrics.successRate)} />
          <StatCard label="Fallback rate" value={pct(metrics.fallbackRate)} sub={`${metrics.fallbackEvents} fallback${metrics.fallbackEvents === 1 ? "" : "s"}`} />
          <StatCard label="No-result search rate" value={pct(metrics.noResultSearchRate)} sub={`${metrics.noResultEvents} no-result`} />
          <StatCard label="Average latency" value={metrics.averageDurationMs != null ? `${metrics.averageDurationMs}ms` : "—"} />
          <StatCard label="p95 latency" value={metrics.p95DurationMs != null ? `${metrics.p95DurationMs}ms` : "—"} />
          <StatCard label="Provider errors" value={metrics.byEventType.PROVIDER_ERROR ?? 0} />
          <StatCard label="Tool errors" value={metrics.byEventType.TOOL_ERROR ?? 0} />
          <StatCard label="Rate-limit events" value={metrics.byEventType.RATE_LIMIT ?? 0} />
          <StatCard label="Auth/security denials" value={(metrics.byEventType.AUTHENTICATION_FAILURE ?? 0) + (metrics.byEventType.AUTHORIZATION_FAILURE ?? 0)} sub={`${metrics.bySource.security ?? 0} security-sourced events`} />
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Token usage &amp; cost</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Prompt tokens" value={metrics.tokenTotals.promptTokens.toLocaleString("en-IN")} />
          <StatCard label="Completion tokens" value={metrics.tokenTotals.completionTokens.toLocaleString("en-IN")} />
          <StatCard label="Total tokens" value={metrics.tokenTotals.totalTokens.toLocaleString("en-IN")} />
          <StatCard
            label="Estimated provider cost"
            value={cost.available ? `$${cost.estimatedUsd.toFixed(4)}` : "Not configured"}
            sub={cost.available ? undefined : "Set GATEWAY_PROVIDER_INPUT/OUTPUT_PRICE_PER_1K to enable"}
          />
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Customer feedback</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Helpful" value={feedback.helpful} />
          <StatCard label="Not helpful" value={feedback.notHelpful} />
          <StatCard label="Helpful rate" value={feedback.helpfulRate != null ? pct(feedback.helpfulRate) : "—"} />
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Most-used capabilities</h2>
        <div className="muv-card">
          {metrics.mostUsedTools.length === 0 ? (
            <p className="muv-text-faint text-sm">No tool usage recorded in this window.</p>
          ) : (
            <ul className="text-sm space-y-1.5">
              {metrics.mostUsedTools.map((t) => (
                <li key={t.toolName} className="flex justify-between">
                  <span className="muv-text-solid">{t.toolName}</span>
                  <span className="muv-text-meta">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Configuration &amp; kill switches</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Environment" value={config.environment} />
          <StatCard label="AI enabled" value={config.aiEnabled ? "Yes" : "KILLED"} />
          <StatCard label="Provider enabled" value={config.providerEnabled ? "Yes" : "KILLED"} />
          <StatCard label="Tools enabled" value={config.toolsEnabled ? "Yes" : "KILLED"} />
          <StatCard label="Selected provider" value={config.provider.selected ?? "None"} />
          <StatCard label="Provider configured" value={config.provider.apiKeyPresent ? "Yes" : "No"} />
          <StatCard label="Rollout percentage" value={pct(config.rolloutPercentage / 100)} />
          <StatCard label="Tools enabled (rollout)" value={`${enabledTools.length} / ${rollout.length}`} />
        </div>
      </section>

      <section>
        <h2 className="muv-text-meta text-xs uppercase tracking-wide mb-3">Health checks</h2>
        <div className="muv-card">
          <ul className="text-sm space-y-1.5">
            {health.checks.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span className="muv-text-solid">{c.name}</span>
                <span className={c.healthy ? "muv-text-meta" : "text-[var(--danger)]"}>{c.healthy ? "OK" : "FAILING"} ({c.durationMs}ms)</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
