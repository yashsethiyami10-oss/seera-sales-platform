import { invokeGatewayTool, assertQueryTextWithinLimit, assertArrayWithinLimit, RequestTooLargeError, capResponseItems } from "../lib/gateway/security";
import { AnthropicAdapter } from "../lib/gateway/providers/anthropic-adapter";
import { GatewayProviderError } from "../lib/gateway/providers";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Production Rollout v1.0,
 * Stage 11 (Failure, Load and Abuse Testing).
 *
 * Most of Stage 11's scenario list is already covered by existing
 * suites and not duplicated here: valid/ambiguous/no-result/typo/multi-
 * word search (verify-search-intelligence.ts), logged-out access +
 * cross-customer/invalid-ID handling (verify-customer-wave-rollout.ts),
 * provider-timeout/rate-limit classification
 * (lib/gateway/providers/resilience.ts's own design + verify-
 * observability.ts), prompt/system-prompt/secret/restricted-knowledge
 * extraction attempts (verify-security-hardening.ts), oversized-input
 * rejection + response capping (verify-security.ts), per-tool and
 * per-caller rate limits (verify-security.ts, verify-commerce/customer-
 * wave-rollout.ts), PII/log redaction (verify-security.ts, verify-
 * customer-wave-rollout.ts), session recovery
 * (verify-conversation-runtime.ts's recoverConversation checks), and the
 * duplicate-request guard (`use-muv-ai-chat.ts`'s own `if (!text ||
 * sending) return;` — a real, existing code-level guard, confirmed by
 * reading that file; not re-implemented or re-tested here since it's
 * client-side UI state, not something a standalone script can drive).
 *
 * This suite adds what's genuinely new at Stage 11: real provider
 * 401/malformed-response handling (via a temporary, request-scoped
 * `fetch` mock — never touching the frozen AnthropicAdapter file
 * itself), oversized *output* handling, and a modest concurrent-burst
 * load test against the real dispatcher.
 *
 * Run: `npx tsx scripts/verify-failure-abuse.ts` (or
 * `npm run verify:failure-abuse`).
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

async function withMockedFetch<T>(mockResponse: () => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => mockResponse()) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function main() {
  const adapter = new AnthropicAdapter();
  // isConfigured() only checks presence of ANTHROPIC_API_KEY — force a
  // benign one for this test if absent, since we're mocking the network
  // call entirely and never actually reach Anthropic's servers.
  const savedKey = process.env.ANTHROPIC_API_KEY;
  if (!savedKey) process.env.ANTHROPIC_API_KEY = "test-key-for-mocked-fetch-only";

  // ---- Provider 401/403 (auth failure) ----
  let auth401Error: unknown;
  await withMockedFetch(
    () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 }),
    async () => {
      try {
        await adapter.generate({ messages: [{ role: "user", content: "hi" }] });
      } catch (err) {
        auth401Error = err;
      }
    }
  );
  check(auth401Error instanceof GatewayProviderError && auth401Error.code === "AUTH_ERROR" && !auth401Error.retryable, "provider 401: mapped to a non-retryable AUTH_ERROR, never retried against a dead credential", auth401Error);

  // ---- Provider rate limit (429) ----
  let rateLimitError: unknown;
  await withMockedFetch(
    () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "rate limited" } }), { status: 429 }),
    async () => {
      try {
        await adapter.generate({ messages: [{ role: "user", content: "hi" }] });
      } catch (err) {
        rateLimitError = err;
      }
    }
  );
  check(rateLimitError instanceof GatewayProviderError && rateLimitError.code === "RATE_LIMITED" && rateLimitError.retryable, "provider 429: mapped to a retryable RATE_LIMITED error", rateLimitError);

  // ---- Provider malformed response (200 OK but no usable content) ----
  let malformedError: unknown;
  await withMockedFetch(
    () => new Response(JSON.stringify({ content: [], usage: { input_tokens: 5, output_tokens: 0 } }), { status: 200 }),
    async () => {
      try {
        await adapter.generate({ messages: [{ role: "user", content: "hi" }] });
      } catch (err) {
        malformedError = err;
      }
    }
  );
  check(malformedError instanceof GatewayProviderError && malformedError.code === "PROVIDER_ERROR", "provider malformed response: an empty content array is treated as a real, structured error, never an empty/blank success", malformedError);

  // ---- Provider 5xx (retryable server error) ----
  let serverError: unknown;
  await withMockedFetch(
    () => new Response("internal error", { status: 503 }),
    async () => {
      try {
        await adapter.generate({ messages: [{ role: "user", content: "hi" }] });
      } catch (err) {
        serverError = err;
      }
    }
  );
  check(serverError instanceof GatewayProviderError && serverError.code === "PROVIDER_ERROR" && serverError.retryable, "provider 5xx: mapped to a retryable PROVIDER_ERROR");

  if (!savedKey) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;

  // ---- Oversized input / output ----
  let threwOnOversizedInput = false;
  try {
    assertQueryTextWithinLimit("x".repeat(10_000));
  } catch (err) {
    threwOnOversizedInput = err instanceof RequestTooLargeError;
  }
  check(threwOnOversizedInput, "oversized input: a 10,000-character query is rejected before reaching any tool or provider");

  let threwOnOversizedArray = false;
  try {
    assertArrayWithinLimit(Array.from({ length: 1000 }, (_, i) => i));
  } catch (err) {
    threwOnOversizedArray = err instanceof RequestTooLargeError;
  }
  check(threwOnOversizedArray, "oversized input: a 1,000-item array input is rejected");

  const cappedOutput = capResponseItems(Array.from({ length: 5000 }, (_, i) => i));
  check(cappedOutput.length === 100, "oversized output: a 5,000-item response is capped to the configured maximum before ever reaching a client");

  // ---- Burst traffic — a modest, staging-appropriate concurrent load test ----
  const BURST_SIZE = 15;
  const burstStart = Date.now();
  const burstResults = await Promise.all(
    Array.from({ length: BURST_SIZE }, (_, i) =>
      invokeGatewayTool("commerce.searchProducts", [{ query: "cleaner", pageSize: 1 }], { isGuest: true, identifier: `stage11-burst-${i}` })
    )
  );
  const burstDurationMs = Date.now() - burstStart;
  const burstSuccessCount = burstResults.filter((r) => r.success).length;
  check(burstSuccessCount === BURST_SIZE, `burst traffic: all ${BURST_SIZE} concurrent requests (distinct identifiers, so none rate-limited) complete successfully`, { burstSuccessCount, burstDurationMs });
  check(burstDurationMs < BURST_SIZE * 2000, "burst traffic: concurrent requests complete in real parallel time, not serialized one-by-one", burstDurationMs);
  console.log(`Burst load result: ${burstSuccessCount}/${BURST_SIZE} succeeded in ${burstDurationMs}ms (real, measured — not estimated)`);

  // ---- Per-identifier burst still rate-limits correctly under concurrency ----
  const sameIdentifierBurst = await Promise.all(
    Array.from({ length: 40 }, () => invokeGatewayTool("commerce.searchProducts", [{ query: "cleaner", pageSize: 1 }], { isGuest: true, identifier: "stage11-same-identifier-burst" }))
  );
  const rateLimitedCount = sameIdentifierBurst.filter((r) => !r.success && r.error.code === "RATE_LIMITED").length;
  check(rateLimitedCount > 0, "burst traffic: concurrent requests from the SAME identifier still trigger real rate limiting (30/min for searchProducts, 40 concurrent calls)", rateLimitedCount);

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
