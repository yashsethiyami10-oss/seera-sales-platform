import { toErrorResponse } from "@/lib/errors";
import { recoverConversation as recoverConversationSource, deriveLifecycleState, buildConversationMetadata } from "./lifecycle";
import { buildContextWindow } from "./context-builder";
import { summarizeConversation } from "./summaries";
import {
  streamAssistantTurn as streamAssistantTurnSource,
  retryAssistantTurn as retryAssistantTurnSource,
  regenerateAssistantTurn as regenerateAssistantTurnSource,
} from "./streaming";
import { accumulateTokenUsage } from "./token-accounting";
import { instrumentToolCall, emitGatewayEvent, generateRequestId } from "@/lib/gateway/observability";
import type { ConversationToolResult, ContextWindow, TypingState } from "./types";
import type { StreamTurnOutcome } from "./streaming";
import type { GatewayGenerateInput } from "@/lib/gateway/providers";

/**
 * MUV AI Gateway — Phase 5.5, Conversation Runtime facade.
 *
 * Sits alongside `commerceApi`/`customerApi`/`knowledgeApi` on
 * `lib/gateway/ai-gateway.ts` — same "built, tested, not called by
 * `runAiGatewayTurn`" status. Nothing here modifies the Gateway
 * contract, the Provider Adapter contract, the Knowledge API, or the
 * Knowledge Publisher — every function either composes the existing,
 * frozen `session-manager.ts`/`experience-orchestrator.ts` data (reads
 * only) or the existing Provider Adapter contract (Module 2) exactly as
 * already defined.
 *
 * Phase 5.6 (Observability): the DB-backed functions below go through
 * `instrumentToolCall` like every other Gateway module. The three
 * streaming functions are deliberately NOT wrapped that way — they are
 * synchronous (`StreamTurnOutcome`, not a Promise) by original Phase 5.5
 * design, and changing that to thread through an async instrumentation
 * wrapper would be a real behavior change to an already-shipped
 * contract. Instead, `observeStreamOutcome` emits one fire-and-forget
 * event (never awaited — same "fire-and-forget, don't block the caller
 * on a telemetry write" precedent already used by `actions/recently-
 * viewed.ts`'s own `recordProductView`) after the outcome is already
 * computed, so the function's synchronous signature and return value
 * are completely unchanged.
 */

async function run<T>(toolName: string, fn: () => Promise<T>): Promise<ConversationToolResult<T>> {
  return instrumentToolCall({ source: "conversation", toolName, eventType: "CONVERSATION_RUNTIME_USAGE" }, async () => {
    try {
      return { success: true as const, data: await fn() };
    } catch (err) {
      return toErrorResponse(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Conversation Persistence / Recovery / Lifecycle / Metadata
// ---------------------------------------------------------------------------

export function recoverConversation(sessionId: string) {
  return run("recoverConversation", () => recoverConversationSource(sessionId));
}

export function getConversationLifecycle(sessionId: string) {
  return run("getConversationLifecycle", async () => {
    const { session } = await recoverConversationSource(sessionId);
    return deriveLifecycleState(session);
  });
}

export function getConversationMetadata(sessionId: string) {
  return run("getConversationMetadata", async () => {
    const { session } = await recoverConversationSource(sessionId);
    return buildConversationMetadata(session);
  });
}

// ---------------------------------------------------------------------------
// Conversation Memory / Session Memory / Multi-turn Context / Window
// Management / Context Builder
// ---------------------------------------------------------------------------

export function getContextWindow(sessionId: string, opts: { maxItems?: number; maxChars?: number } = {}): Promise<ConversationToolResult<ContextWindow>> {
  return run("getContextWindow", async () => {
    const { session } = await recoverConversationSource(sessionId);
    return buildContextWindow(session.memoryItems, opts);
  });
}

// ---------------------------------------------------------------------------
// Conversation Summaries
// ---------------------------------------------------------------------------

export function getConversationSummary(sessionId: string, maxLength?: number) {
  return run("getConversationSummary", async () => {
    const { session } = await recoverConversationSource(sessionId);
    return summarizeConversation(sessionId, session.memoryItems, maxLength);
  });
}

// ---------------------------------------------------------------------------
// Streaming Responses / Cancellation / Retry / Regenerate — see file
// header for why these stay synchronous rather than going through
// `run()`/`instrumentToolCall`.
// ---------------------------------------------------------------------------

function observeStreamOutcome(toolName: string, outcome: StreamTurnOutcome): StreamTurnOutcome {
  const requestId = generateRequestId();
  if (outcome.status === "ERROR") {
    const eventType = outcome.code === "TIMEOUT" ? "TIMEOUT" : outcome.code === "CANCELLED" ? "CANCELLATION" : "PROVIDER_ERROR";
    void emitGatewayEvent({ requestId, eventType, severity: "ERROR", source: "provider", message: `${toolName}: ${outcome.message}`, metadata: { code: outcome.code } });
  } else {
    void emitGatewayEvent({
      requestId,
      eventType: "CONVERSATION_RUNTIME_USAGE",
      source: "conversation",
      message: `${toolName}: ${outcome.status}`,
      metadata: { status: outcome.status },
    });
  }
  return outcome;
}

export function streamAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  return observeStreamOutcome("streamAssistantTurn", streamAssistantTurnSource(input));
}

export function retryAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  const outcome = observeStreamOutcome("retryAssistantTurn", retryAssistantTurnSource(input));
  void emitGatewayEvent({ requestId: generateRequestId(), eventType: "RETRY", severity: "WARN", source: "conversation", message: "retryAssistantTurn invoked" });
  return outcome;
}

export function regenerateAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  return observeStreamOutcome("regenerateAssistantTurn", regenerateAssistantTurnSource(input));
}

export type { StreamTurnOutcome };

/** Typing State — ephemeral UI signal derived from a stream outcome,
 * never persisted. */
export function deriveTypingState(outcome: StreamTurnOutcome): TypingState {
  if (outcome.status === "STREAMING") return "STREAMING";
  if (outcome.status === "ERROR") return "ERROR";
  return "IDLE";
}

// ---------------------------------------------------------------------------
// Token Accounting
// ---------------------------------------------------------------------------

export { accumulateTokenUsage };
