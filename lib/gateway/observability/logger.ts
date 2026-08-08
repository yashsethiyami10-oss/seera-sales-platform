import { prisma } from "@/lib/prisma";
import { logger as baseLogger } from "@/lib/logger";
import { redact } from "./redact";
import type { GatewayEvent, GatewayEventSeverity } from "./types";

/**
 * MUV AI Gateway — Phase 5.6, structured event emission.
 *
 * Every Gateway/tool-usage event goes through exactly this function —
 * console output (via the existing `lib/logger.ts`, unmodified) AND
 * best-effort persistence to `GatewayObservabilityEvent` (same
 * "telemetry write must never break the real operation it's observing"
 * discipline as `lib/retrieval/pipeline.ts`'s `logRetrieval()` and the
 * Knowledge Publisher's `persistPublishRun()` — a logging failure is
 * itself logged, never thrown).
 *
 * "Logging must be configurable by environment" — `GATEWAY_LOG_LEVEL`
 * (DEBUG|INFO|WARN|ERROR|CRITICAL) gates both console output and
 * persistence; unset defaults to DEBUG in development (see everything
 * locally) and INFO in production (skip debug-level noise in the real
 * telemetry table). Every event's `metadata` is redacted before either
 * destination sees it — see `redact.ts`.
 */

const SEVERITY_RANK: Record<GatewayEventSeverity, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

function configuredThreshold(): GatewayEventSeverity {
  const envValue = process.env.GATEWAY_LOG_LEVEL as GatewayEventSeverity | undefined;
  if (envValue && envValue in SEVERITY_RANK) return envValue;
  return process.env.NODE_ENV === "production" ? "INFO" : "DEBUG";
}

function consoleMethodFor(severity: GatewayEventSeverity): "info" | "warn" | "error" {
  if (severity === "ERROR" || severity === "CRITICAL") return "error";
  if (severity === "WARN") return "warn";
  return "info";
}

export async function emitGatewayEvent(event: GatewayEvent): Promise<void> {
  const severity = event.severity ?? "INFO";
  const threshold = configuredThreshold();
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[threshold]) return;

  const safeMetadata = redact(event.metadata) ?? {};

  baseLogger[consoleMethodFor(severity)](`gateway:${event.source}:${event.eventType.toLowerCase()}`, {
    requestId: event.requestId,
    durationMs: event.durationMs,
    message: event.message,
    ...safeMetadata,
  });

  try {
    await prisma.gatewayObservabilityEvent.create({
      data: {
        requestId: event.requestId,
        eventType: event.eventType,
        severity,
        source: event.source,
        durationMs: event.durationMs,
        message: event.message,
        metadata: safeMetadata as object,
      },
    });
  } catch (err) {
    baseLogger.error("gateway:observability:persist-failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
