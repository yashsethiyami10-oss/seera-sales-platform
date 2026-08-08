import { prisma } from "@/lib/prisma";
import { getGatewayProviderConfigStatus } from "@/lib/gateway/providers";
import { getKnowledgeFactoryLoadSummary } from "@/lib/runtime/knowledge-factory-loader";
import { emitGatewayEvent } from "./logger";
import { generateRequestId } from "./request-id";
import type { GatewayHealthReport, HealthCheckResult } from "./types";

/**
 * MUV AI Gateway — Phase 5.6, health checks. Read-only, zero-write
 * checks over the same real dependencies the Gateway path already
 * relies on — no new dependency, no synthetic ping endpoint to keep in
 * sync with reality.
 */

async function timed(name: string, fn: () => Promise<boolean> | boolean, detail?: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const healthy = await fn();
    return { name, healthy, durationMs: Date.now() - start, detail };
  } catch (err) {
    return { name, healthy: false, durationMs: Date.now() - start, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkDatabase(): Promise<HealthCheckResult> {
  return timed("database", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  });
}

async function checkKnowledgeFactory(): Promise<HealthCheckResult> {
  return timed("knowledge_factory", () => {
    const summary = getKnowledgeFactoryLoadSummary();
    return summary.some((s) => s.koCount > 0);
  });
}

async function checkProviderConfig(): Promise<HealthCheckResult> {
  return timed("provider_config", () => {
    // A provider being unconfigured is a valid, healthy production state
    // (see GatewayProviderConfigStatus's own documentation) — this check
    // only fails if the configured status itself couldn't be computed.
    const status = getGatewayProviderConfigStatus();
    return typeof status.configured === "boolean";
  });
}

export async function runGatewayHealthCheck(): Promise<GatewayHealthReport> {
  const checks = await Promise.all([checkDatabase(), checkKnowledgeFactory(), checkProviderConfig()]);
  const healthy = checks.every((c) => c.healthy);

  await emitGatewayEvent({
    requestId: generateRequestId(),
    eventType: "HEALTH_CHECK",
    severity: healthy ? "INFO" : "CRITICAL",
    source: "gateway",
    message: healthy ? "Gateway health check passed" : "Gateway health check failed",
    metadata: { checks },
  });

  return { healthy, checks, checkedAt: new Date().toISOString() };
}
