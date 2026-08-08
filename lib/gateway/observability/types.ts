import type { GatewayEventSeverity, GatewayEventType } from "@prisma/client";

/**
 * MUV AI Gateway — Phase 5.6, Observability. Shared types for the
 * canonical `lib/gateway/*` path's telemetry — see the
 * `GatewayObservabilityEvent` schema comment for the persistence shape
 * this mirrors.
 */
export type { GatewayEventSeverity, GatewayEventType };

export type GatewaySource = "gateway" | "commerce" | "customer" | "conversation" | "provider" | "knowledge" | "security";

export type GatewayEvent = {
  requestId: string;
  eventType: GatewayEventType;
  severity?: GatewayEventSeverity;
  source: GatewaySource;
  durationMs?: number;
  message: string;
  /** Passed through `redact()` before this event is ever written or
   * printed — see `redact.ts`. Callers should still avoid putting raw
   * prompts/PII/addresses/payment data/knowledge content here in the
   * first place; redaction is a second line of defense, not a license
   * to log freely. */
  metadata?: Record<string, unknown>;
};

export type HealthCheckResult = {
  name: string;
  healthy: boolean;
  durationMs: number;
  detail?: string;
};

export type GatewayHealthReport = {
  healthy: boolean;
  checks: HealthCheckResult[];
  checkedAt: string;
};
