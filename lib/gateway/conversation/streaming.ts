import { getGatewayProviderAdapter, GatewayProviderError } from "@/lib/gateway/providers";
import type { GatewayGenerateInput, GatewayStreamChunk } from "@/lib/gateway/providers";

/**
 * MUV AI Gateway — Phase 5.5, Streaming Responses / Cancellation / Retry
 * / Regenerate.
 *
 * Orchestrates the EXISTING Provider Adapter contract (Module 2,
 * unmodified — `getGatewayProviderAdapter()`/`GatewayProviderAdapter.
 * generateStream()`/`GatewayGenerateInput.signal` all already exist and
 * are used here exactly as designed, never extended or changed). Calls
 * `lib/gateway/providers` directly rather than going through
 * `lib/gateway/ai-gateway.ts`'s `getGatewayProvider()` re-export — that
 * file imports this module's package (`lib/gateway/conversation`), so
 * importing back from it here would be a circular dependency; going
 * straight to the same underlying factory `getGatewayProvider()` itself
 * calls avoids that without changing which function actually runs. This
 * file adds no new provider-selection logic, no new adapter, and is not
 * called by `runAiGatewayTurn` — same "built, tested, not wired into the
 * live turn" status as every other Gateway module this Wave.
 *
 * "Cancellation" is `GatewayGenerateInput.signal` (already part of the
 * frozen contract) passed straight through — nothing new to implement.
 * "Retry"/"Regenerate" are both, structurally, "call this again": a
 * stream that fails before yielding anything can only be safely retried
 * as a whole new attempt (Module 2's own adapters already retry
 * *within* a non-streaming `generate()` call via `runWithRetry`, but
 * deliberately do not retry mid-`generateStream()`, since partial output
 * already sent to a client can't be un-sent) — "regenerate" is the same
 * mechanism, requested by the user wanting a different answer rather
 * than recovering from a failure. Both are named separately below only
 * because the brief lists them as distinct capabilities, not because
 * the underlying call differs.
 */

export type StreamTurnOutcome =
  | { status: "NO_PROVIDER_CONFIGURED" }
  | { status: "STREAMING"; providerName: string; stream: AsyncGenerator<GatewayStreamChunk, void, unknown> }
  | { status: "ERROR"; code: string; message: string };

/**
 * Synchronous-checkable failures (no provider selected, or selected but
 * missing credentials/unimplemented) are surfaced immediately via
 * `isConfigured()` — a real network/timeout/rate-limit failure can still
 * only surface once the returned stream is actually iterated, same as
 * calling `generateStream()` directly would behave; callers must still
 * wrap consumption of `stream` in their own try/catch.
 */
export function streamAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  const provider = getGatewayProviderAdapter();
  if (!provider) return { status: "NO_PROVIDER_CONFIGURED" };

  if (!provider.isConfigured()) {
    return { status: "ERROR", code: "NOT_CONFIGURED", message: `${provider.name} is selected but not configured` };
  }

  try {
    const stream = provider.generateStream(input);
    return { status: "STREAMING", providerName: provider.name, stream };
  } catch (err) {
    if (err instanceof GatewayProviderError) return { status: "ERROR", code: err.code, message: err.message };
    return { status: "ERROR", code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-invokes the turn fresh — the same input, a brand new stream. See
 * this file's own header for why retry-mid-stream is never attempted. */
export function retryAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  return streamAssistantTurn(input);
}

/** Same mechanism as retry; kept as its own named export because
 * "regenerate" is a distinct user-facing intent (wants a different
 * answer, not recovering from an error), even though nothing about the
 * call itself differs. */
export function regenerateAssistantTurn(input: GatewayGenerateInput): StreamTurnOutcome {
  return streamAssistantTurn(input);
}
