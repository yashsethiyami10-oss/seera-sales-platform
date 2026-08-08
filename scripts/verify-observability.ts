import { redact } from "../lib/gateway/observability/redact";
import { generateRequestId } from "../lib/gateway/observability/request-id";
import { emitGatewayEvent } from "../lib/gateway/observability/logger";
import { instrumentToolCall, recordProviderOutcome, recordRetryEvent, recordConversationLifecycleEvent, recordTokenUsageEvent } from "../lib/gateway/observability/instrumentation";
import { runGatewayHealthCheck } from "../lib/gateway/observability/health";
import { getGatewayMetricsSummary } from "../lib/gateway/observability/metrics";
import { GatewayProviderError } from "../lib/gateway/providers";
import { searchProducts } from "../lib/gateway/commerce";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Phase 5.6, Observability.
 * Same `scripts/verify-*.ts` convention as every other permanent suite.
 *
 * Run: `npx tsx scripts/verify-observability.ts` (or
 * `npm run verify:observability`).
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

async function latestEvent(requestId: string) {
  return prisma.gatewayObservabilityEvent.findFirst({ where: { requestId }, orderBy: { createdAt: "desc" } });
}

async function main() {
  // ---- Logging redaction ----
  const redacted = redact({
    email: "someone@example.com",
    phone: "9876543210",
    address: "221B Baker Street",
    line1: "House 12",
    apiKey: "sk-abcdefghijklmnopqrstuvwx",
    dbUrl: "postgres://user:pass@host:5432/db",
    fullPrompt: "This is a very long prompt body that should never be logged verbatim because it might contain sensitive customer context or a full conversation transcript.",
    nested: { cardNumber: "4111111111111111", note: "a normal short note" },
    safeField: "totally fine short value",
  });
  check(redacted.email === "[REDACTED]", "redact: known sensitive key (email) fully redacted", redacted.email);
  check(redacted.phone === "[REDACTED]", "redact: known sensitive key (phone) fully redacted", redacted.phone);
  check(redacted.address === "[REDACTED]", "redact: known sensitive key (address) fully redacted", redacted.address);
  check(redacted.line1 === "[REDACTED]", "redact: address line field fully redacted", redacted.line1);
  check(redacted.apiKey === "[REDACTED]", "redact: known sensitive key (apiKey) fully redacted", redacted.apiKey);
  check(typeof redacted.dbUrl === "string" && !redacted.dbUrl.includes("pass"), "redact: DB connection string scrubbed by pattern, not just key name", redacted.dbUrl);
  check(typeof redacted.fullPrompt === "string" && redacted.fullPrompt.startsWith("[REDACTED:len="), "redact: long free-text field summarized, never logged verbatim", redacted.fullPrompt);
  const nested = redacted.nested as Record<string, unknown>;
  check(nested.cardNumber === "[REDACTED]" || (typeof nested.cardNumber === "string" && nested.cardNumber.includes("[REDACTED")), "redact: nested sensitive field also redacted", nested.cardNumber);
  check(nested.note === "a normal short note", "redact: unrelated short safe field passes through unchanged");
  check(redacted.safeField === "totally fine short value", "redact: top-level safe field passes through unchanged");

  // ---- Request IDs ----
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  check(typeof id1 === "string" && id1.length > 10, "generateRequestId: produces a real, non-trivial id");
  check(id1 !== id2, "generateRequestId: two calls produce distinct ids");

  // ---- Metrics events: emit + persist + redact end-to-end ----
  const testRequestId = generateRequestId();
  await emitGatewayEvent({
    requestId: testRequestId,
    eventType: "REQUEST",
    source: "gateway",
    message: "verification test event",
    metadata: { email: "leak-check@example.com", safe: "ok" },
  });
  const persisted = await latestEvent(testRequestId);
  check(Boolean(persisted), "emitGatewayEvent: event was persisted to GatewayObservabilityEvent");
  check(persisted?.eventType === "REQUEST", "emitGatewayEvent: correct eventType persisted");
  const persistedMeta = persisted?.metadata as Record<string, unknown> | undefined;
  check(persistedMeta?.email === "[REDACTED]", "emitGatewayEvent: metadata was redacted before persistence, not after", persistedMeta);
  check(persistedMeta?.safe === "ok", "emitGatewayEvent: non-sensitive metadata preserved");

  // ---- Commerce/Customer/Conversation tool usage events (real call) ----
  const beforeCount = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "COMMERCE_TOOL_USAGE" } });
  await searchProducts({ query: "muv", pageSize: 1 });
  const afterCount = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "COMMERCE_TOOL_USAGE" } });
  check(afterCount > beforeCount, "commerce tool usage: a real searchProducts() call emitted a COMMERCE_TOOL_USAGE event", { beforeCount, afterCount });

  // ---- Provider errors / timeout / cancellation / retry classification ----
  const providerRequestId = generateRequestId();
  await recordProviderOutcome(providerRequestId, "ANTHROPIC", 5000, new GatewayProviderError("timed out", { code: "TIMEOUT", provider: "ANTHROPIC", retryable: true }));
  const timeoutEvent = await latestEvent(providerRequestId);
  check(timeoutEvent?.eventType === "TIMEOUT", "recordProviderOutcome: TIMEOUT code maps to TIMEOUT event", timeoutEvent?.eventType);

  const cancelRequestId = generateRequestId();
  await recordProviderOutcome(cancelRequestId, "ANTHROPIC", 100, new GatewayProviderError("cancelled", { code: "CANCELLED", provider: "ANTHROPIC", retryable: false }));
  const cancelEvent = await latestEvent(cancelRequestId);
  check(cancelEvent?.eventType === "CANCELLATION", "recordProviderOutcome: CANCELLED code maps to CANCELLATION event", cancelEvent?.eventType);

  const rateLimitRequestId = generateRequestId();
  await recordProviderOutcome(rateLimitRequestId, "ANTHROPIC", 50, new GatewayProviderError("rate limited", { code: "RATE_LIMITED", provider: "ANTHROPIC", retryable: true }));
  const rateLimitEvent = await latestEvent(rateLimitRequestId);
  check(rateLimitEvent?.eventType === "RATE_LIMIT", "recordProviderOutcome: RATE_LIMITED code maps to RATE_LIMIT event", rateLimitEvent?.eventType);

  const retryRequestId = generateRequestId();
  await recordRetryEvent(retryRequestId, "provider", "retrying after transient failure");
  const retryEvent = await latestEvent(retryRequestId);
  check(retryEvent?.eventType === "RETRY" && retryEvent.severity === "WARN", "recordRetryEvent: emits a RETRY/WARN event", retryEvent);

  // ---- Authentication / Authorization / Knowledge-unavailable classification ----
  const authFailOutcome = await instrumentToolCall({ source: "customer", toolName: "test.authFail", eventType: "CUSTOMER_TOOL_USAGE" }, async () => ({
    success: false as const,
    error: { code: "UNAUTHORIZED", message: "no session" },
  }));
  check(authFailOutcome.success === false, "instrumentToolCall: passes through the wrapped result unchanged");

  const authzFailRequestId = generateRequestId();
  await instrumentToolCall({ source: "customer", toolName: "test.authzFail", eventType: "CUSTOMER_TOOL_USAGE", requestId: authzFailRequestId }, async () => ({
    success: false as const,
    error: { code: "FORBIDDEN", message: "not yours" },
  }));
  const authzEvent = await latestEvent(authzFailRequestId);
  check(authzEvent?.eventType === "AUTHORIZATION_FAILURE", "instrumentToolCall: FORBIDDEN result classified as AUTHORIZATION_FAILURE", authzEvent?.eventType);

  const authFailRequestId = generateRequestId();
  await instrumentToolCall({ source: "customer", toolName: "test.authFail2", eventType: "CUSTOMER_TOOL_USAGE", requestId: authFailRequestId }, async () => ({
    success: false as const,
    error: { code: "UNAUTHORIZED", message: "no session" },
  }));
  const authEvent = await latestEvent(authFailRequestId);
  check(authEvent?.eventType === "AUTHENTICATION_FAILURE", "instrumentToolCall: UNAUTHORIZED result classified as AUTHENTICATION_FAILURE", authEvent?.eventType);

  const knowledgeRequestId = generateRequestId();
  await instrumentToolCall({ source: "knowledge", toolName: "test.knowledgeUnavailable", eventType: "KNOWLEDGE_RETRIEVAL_LATENCY", requestId: knowledgeRequestId }, async () => ({
    status: "EMPTY",
    message: "no verified knowledge found",
    results: [],
  }));
  const knowledgeEvent = await latestEvent(knowledgeRequestId);
  check(knowledgeEvent?.eventType === "KNOWLEDGE_UNAVAILABLE", "instrumentToolCall: Knowledge API EMPTY status classified as KNOWLEDGE_UNAVAILABLE", knowledgeEvent?.eventType);

  // ---- Tool error (thrown exception) ----
  const throwRequestId = generateRequestId();
  let threw = false;
  try {
    await instrumentToolCall({ source: "commerce", toolName: "test.throws", eventType: "COMMERCE_TOOL_USAGE", requestId: throwRequestId }, async () => {
      throw new Error("synthetic failure for verification");
    });
  } catch {
    threw = true;
  }
  check(threw, "instrumentToolCall: a thrown error is re-thrown, never swallowed");
  const throwEvent = await latestEvent(throwRequestId);
  check(throwEvent?.eventType === "TOOL_ERROR" && throwEvent.severity === "ERROR", "instrumentToolCall: thrown error emits a TOOL_ERROR/ERROR event", throwEvent);
  const throwMeta = throwEvent?.metadata as Record<string, unknown> | undefined;
  check(typeof throwMeta?.error === "string" && !JSON.stringify(throwMeta).includes("at Object"), "instrumentToolCall: error metadata is a message, not a raw stack trace");

  // ---- Conversation lifecycle events ----
  const lifecycleRequestId = generateRequestId();
  await recordConversationLifecycleEvent(lifecycleRequestId, "test-session-id", "CLOSED");
  const lifecycleEvent = await latestEvent(lifecycleRequestId);
  check(lifecycleEvent?.eventType === "CONVERSATION_LIFECYCLE", "recordConversationLifecycleEvent: emits a CONVERSATION_LIFECYCLE event");

  // ---- Token usage events ----
  const tokenRequestId = generateRequestId();
  await recordTokenUsageEvent(tokenRequestId, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  const tokenEvent = await latestEvent(tokenRequestId);
  check(tokenEvent?.eventType === "TOKEN_USAGE", "recordTokenUsageEvent: emits a TOKEN_USAGE event");

  // ---- Health checks ----
  const health = await runGatewayHealthCheck();
  check(health.checks.length >= 3, "runGatewayHealthCheck: runs multiple real checks", health.checks.map((c) => c.name));
  check(health.checks.every((c) => typeof c.durationMs === "number"), "runGatewayHealthCheck: every check reports a real duration");
  const dbCheck = health.checks.find((c) => c.name === "database");
  check(dbCheck?.healthy === true, "runGatewayHealthCheck: database check passes against the real DB");

  // ---- Summary metrics ----
  const metrics = await getGatewayMetricsSummary();
  check(metrics.totalEvents > 0, "getGatewayMetricsSummary: reports real, non-zero event totals after this run", metrics.totalEvents);
  check(typeof metrics.byEventType === "object", "getGatewayMetricsSummary: groups by eventType");
  check(typeof metrics.bySeverity === "object", "getGatewayMetricsSummary: groups by severity");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
