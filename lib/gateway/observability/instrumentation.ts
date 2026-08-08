import { emitGatewayEvent } from "./logger";
import { generateRequestId } from "./request-id";
import type { GatewayEventSeverity, GatewayEventType, GatewaySource } from "./types";
import { GatewayProviderError } from "@/lib/gateway/providers";

/**
 * MUV AI Gateway — Phase 5.6, instrumentation helpers. Every Wave 1
 * capability layer (`commerce-api.ts`/`customer-api.ts`/
 * `conversation-api.ts`) and the Gateway's own `runAiGatewayTurn` wrap
 * their existing logic with these — the wrapped function's return value
 * and thrown errors are passed through completely unchanged; this only
 * adds a side-effect (emitting events), never alters control flow or
 * output. That is the concrete mechanism behind "preserve zero behavior
 * change in the live storefront turn path."
 */

type ToolLikeResult = { success: boolean; error?: { code?: string } };
type KnowledgeLikeResult = { status: string };

function isToolLikeResult(value: unknown): value is ToolLikeResult {
  return Boolean(value) && typeof value === "object" && "success" in (value as object);
}

function isKnowledgeLikeResult(value: unknown): value is KnowledgeLikeResult {
  return Boolean(value) && typeof value === "object" && "status" in (value as object) && "results" in (value as object);
}

/**
 * Classifies an already-completed (never-thrown) result into the
 * specific event this Wave's brief calls out — authentication/
 * authorization failures and knowledge-unavailable are all "successful"
 * calls in the try/catch sense (they returned a structured response,
 * they didn't throw), so they need their own detection here rather than
 * relying on the catch branch.
 */
function classifyOutcome(result: unknown): { severity: GatewayEventSeverity; eventType?: GatewayEventType } {
  if (isKnowledgeLikeResult(result) && result.status !== "OK") {
    return { severity: "INFO", eventType: "KNOWLEDGE_UNAVAILABLE" };
  }
  if (isToolLikeResult(result) && !result.success) {
    const code = result.error?.code;
    if (code === "UNAUTHORIZED") return { severity: "WARN", eventType: "AUTHENTICATION_FAILURE" };
    if (code === "FORBIDDEN") return { severity: "WARN", eventType: "AUTHORIZATION_FAILURE" };
    if (code === "RATE_LIMITED") return { severity: "WARN", eventType: "RATE_LIMIT" };
    return { severity: "WARN" };
  }
  return { severity: "INFO" };
}

export type InstrumentToolCallOptions = {
  source: GatewaySource;
  toolName: string;
  eventType: GatewayEventType;
  requestId?: string;
};

/** Wraps any Wave 1 tool call — measures duration, emits one usage event
 * on completion (classified per `classifyOutcome`) and one `TOOL_ERROR`
 * event if the wrapped function throws, then re-throws unchanged. */
export async function instrumentToolCall<T>(opts: InstrumentToolCallOptions, fn: () => Promise<T>): Promise<T> {
  const requestId = opts.requestId ?? generateRequestId();
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const { severity, eventType } = classifyOutcome(result);
    await emitGatewayEvent({
      requestId,
      eventType: eventType ?? opts.eventType,
      severity,
      source: opts.source,
      durationMs,
      message: `${opts.toolName} completed`,
      metadata: { toolName: opts.toolName },
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    await emitGatewayEvent({
      requestId,
      eventType: "TOOL_ERROR",
      severity: "ERROR",
      source: opts.source,
      durationMs,
      message: `${opts.toolName} threw`,
      metadata: { toolName: opts.toolName, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Wraps the Gateway's own top-level turn — same pass-through discipline
 * as `instrumentToolCall`, scoped to the `runAiGatewayTurn` boundary
 * specifically ("gateway latency"). */
export async function instrumentGatewayTurn<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await emitGatewayEvent({
      requestId,
      eventType: "GATEWAY_LATENCY",
      source: "gateway",
      durationMs: Date.now() - start,
      message: "runAiGatewayTurn completed",
    });
    return result;
  } catch (err) {
    await emitGatewayEvent({
      requestId,
      eventType: "TOOL_ERROR",
      severity: "ERROR",
      source: "gateway",
      durationMs: Date.now() - start,
      message: "runAiGatewayTurn threw",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Maps a `GatewayProviderError` (Module 2's own, unmodified error
 * shape) to the specific provider-side event types this Wave's brief
 * lists — timeout/cancellation/retry-eligible/provider error are all
 * real, distinct `GatewayProviderErrorCode` values already, not
 * inferred here. */
export async function recordProviderOutcome(requestId: string, providerName: string, durationMs: number, err: unknown): Promise<void> {
  const code = err instanceof GatewayProviderError ? err.code : "UNKNOWN";
  const eventType: GatewayEventType =
    code === "TIMEOUT" ? "TIMEOUT" : code === "CANCELLED" ? "CANCELLATION" : code === "RATE_LIMITED" ? "RATE_LIMIT" : "PROVIDER_ERROR";
  await emitGatewayEvent({
    requestId,
    eventType,
    severity: "ERROR",
    source: "provider",
    durationMs,
    message: `${providerName} provider call failed`,
    metadata: { providerName, code },
  });
}

export async function recordRetryEvent(requestId: string, source: GatewaySource, detail: string): Promise<void> {
  await emitGatewayEvent({ requestId, eventType: "RETRY", severity: "WARN", source, message: detail });
}

export async function recordConversationLifecycleEvent(requestId: string, sessionId: string, status: string): Promise<void> {
  await emitGatewayEvent({
    requestId,
    eventType: "CONVERSATION_LIFECYCLE",
    source: "conversation",
    message: `Session transitioned to ${status}`,
    metadata: { sessionId, status },
  });
}

export async function recordTokenUsageEvent(requestId: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }): Promise<void> {
  await emitGatewayEvent({
    requestId,
    eventType: "TOKEN_USAGE",
    source: "provider",
    message: "Token usage recorded",
    metadata: usage,
  });
}
