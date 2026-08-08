import { retryWithBackoff } from "@/lib/retry";
import { GatewayProviderError } from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 2) — the one place timeout,
 * cancellation, and retry are implemented. Every real adapter's
 * `generate()` calls this instead of reimplementing its own version of
 * "race a timeout" or "retry on 5xx" — that duplication is exactly what
 * "standardize timeout/retries/cancellation" (Module 2's brief) means.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

/** Combines the caller's own AbortSignal (if any) with an internal timeout
 * signal, so a single downstream `fetch(url, { signal })` honors both
 * "the customer cancelled" and "this took too long" through one signal. */
export function withTimeoutSignal(
  providerName: string,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new GatewayProviderError(
    `${providerName} request exceeded ${timeoutMs}ms`,
    { code: "TIMEOUT", provider: providerName, retryable: true }
  )), timeoutMs);

  const onExternalAbort = () => controller.abort(new GatewayProviderError(
    `${providerName} request was cancelled`,
    { code: "CANCELLED", provider: providerName, retryable: false }
  ));
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/** Retries only errors the adapter itself marked `retryable` — never
 * AUTH_ERROR/INVALID_REQUEST/CANCELLED/NOT_CONFIGURED, which would just
 * fail identically on every attempt. */
export function runWithRetry<T>(providerName: string, fn: () => Promise<T>): Promise<T> {
  return retryWithBackoff(fn, {
    retries: 2,
    baseDelayMs: 400,
    maxDelayMs: 4000,
    shouldRetry: (err) => err instanceof GatewayProviderError && err.retryable,
  });
}

/** Maps an aborted `fetch` (DOMException "AbortError", or the reason we
 * ourselves attached via `withTimeoutSignal`) to the correct standardized
 * error, instead of letting a generic AbortError leak past this layer. */
export function toAbortAwareError(providerName: string, signal: AbortSignal, err: unknown): GatewayProviderError {
  if (err instanceof GatewayProviderError) return err;
  if (signal.aborted && signal.reason instanceof GatewayProviderError) return signal.reason;
  if (err instanceof Error && err.name === "AbortError") {
    return new GatewayProviderError(`${providerName} request was cancelled or timed out`, {
      code: "CANCELLED", provider: providerName, retryable: false, cause: err,
    });
  }
  return new GatewayProviderError(
    err instanceof Error ? err.message : `${providerName} request failed`,
    { code: "UNKNOWN", provider: providerName, retryable: false, cause: err }
  );
}
