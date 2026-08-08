import {
  getContextWindow,
  getConversationSummary,
  getConversationLifecycle,
  getConversationMetadata,
  recoverConversation,
  streamAssistantTurn,
  retryAssistantTurn,
  regenerateAssistantTurn,
  deriveTypingState,
  accumulateTokenUsage,
} from "../lib/gateway/conversation";
import { buildContextWindow } from "../lib/gateway/conversation/context-builder";
import { summarizeConversation } from "../lib/gateway/conversation/summaries";
import { createSession, touchSession, closeSession } from "../lib/experience/session-manager";
import { prisma } from "../lib/prisma";
import type { MemoryItem } from "../lib/experience/types";

/**
 * MUV AI Gateway — permanent verification for Phase 5.5, Conversation
 * Runtime. Same `scripts/verify-*.ts` convention as every other
 * permanent suite this Wave.
 *
 * Run: `npx tsx scripts/verify-conversation-runtime.ts` (or
 * `npm run verify:conversation-runtime`).
 *
 * Uses one real, disposable `ExperienceSession` (created via the
 * existing, frozen `session-manager.ts` — never a raw Prisma insert)
 * to exercise recovery/lifecycle/metadata/summary/context-window
 * against real persisted data, then cleans it up. Streaming checks run
 * against this environment's real, current configuration
 * (`GATEWAY_LLM_PROVIDER` unset) — confirming the correct, safe
 * "no provider configured" outcome, never a live call.
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

function fakeMemoryItem(content: string): MemoryItem {
  return { id: `mem-${Math.random().toString(36).slice(2)}`, type: "CONVERSATION", content, layer: "PUBLIC", createdAt: new Date().toISOString() };
}

async function main() {
  // ---- Context Builder (pure) ----
  const items = Array.from({ length: 30 }, (_, i) => fakeMemoryItem(`message number ${i}`));
  const windowByCount = buildContextWindow(items, { maxItems: 5, maxChars: 100000 });
  check(windowByCount.items.length === 5, "buildContextWindow: caps by maxItems", windowByCount.items.length);
  check(windowByCount.items[4]!.content === "message number 29", "buildContextWindow: keeps the most recent items, in order");
  check(windowByCount.truncated === true, "buildContextWindow: reports truncation when items were dropped");

  const windowByChars = buildContextWindow(items.slice(-3), { maxItems: 20, maxChars: 20 });
  check(windowByChars.totalChars <= 20 || windowByChars.items.length === 1, "buildContextWindow: respects maxChars budget");

  // ---- Conversation Summaries (pure) ----
  const summary = summarizeConversation("test-session", items.slice(0, 3), 20);
  check(summary.truncated === true, "summarizeConversation: truncates over maxLength");
  check(summary.turnCount === 3, "summarizeConversation: reports real turn count");
  const shortSummary = summarizeConversation("test-session", [], 20);
  check(shortSummary.summary === "" && shortSummary.turnCount === 0, "summarizeConversation: empty conversation is not fabricated into anything");

  // ---- Token Accounting (pure) ----
  const usage = accumulateTokenUsage([{ promptTokens: 10, completionTokens: 5 }, { promptTokens: 3, completionTokens: undefined }, undefined]);
  check(usage.promptTokens === 13 && usage.completionTokens === 5 && usage.totalTokens === 18, "accumulateTokenUsage: sums real usage, ignores missing fields safely", usage);

  // ---- Streaming / Cancellation / Retry / Regenerate (real config, no live call) ----
  const input = { messages: [{ role: "user" as const, content: "hello" }] };
  const streamOutcome = streamAssistantTurn(input);
  check(streamOutcome.status === "NO_PROVIDER_CONFIGURED", "streamAssistantTurn: correctly reports no provider configured in this environment", streamOutcome);
  check(deriveTypingState(streamOutcome) === "IDLE", "deriveTypingState: NO_PROVIDER_CONFIGURED maps to IDLE, not a fabricated STREAMING state");

  const retryOutcome = retryAssistantTurn(input);
  check(retryOutcome.status === "NO_PROVIDER_CONFIGURED", "retryAssistantTurn: same safe outcome as a fresh call");
  const regenOutcome = regenerateAssistantTurn(input);
  check(regenOutcome.status === "NO_PROVIDER_CONFIGURED", "regenerateAssistantTurn: same safe outcome as a fresh call");

  // Cancellation is `GatewayGenerateInput.signal` passed straight through
  // to the (unmodified) Provider Adapter contract — confirm an
  // already-aborted signal doesn't change today's safe outcome (no
  // provider selected either way), proving this path never bypasses
  // "no provider configured" even with a signal present.
  const controller = new AbortController();
  controller.abort();
  const cancelledOutcome = streamAssistantTurn({ ...input, signal: controller.signal });
  check(cancelledOutcome.status === "NO_PROVIDER_CONFIGURED", "streamAssistantTurn: accepts a signal without altering the safe no-provider outcome");

  // ---- Conversation Persistence / Recovery / Lifecycle / Metadata / Context / Summary (real session) ----
  const session = await createSession("WEBSITE", null);
  const realMemoryItems = [fakeMemoryItem("What products do you have for home care?"), fakeMemoryItem("Do you have anything for stain removal?")];
  await touchSession(session.id, realMemoryItems);

  const recovered = await recoverConversation(session.id);
  check(recovered.success && recovered.data.session.id === session.id, "recoverConversation: resolves the real session");
  check(recovered.success && recovered.data.lifecycle.status === "ACTIVE" && recovered.data.lifecycle.canContinue, "recoverConversation: lifecycle reports ACTIVE/canContinue for a fresh session");

  const lifecycle = await getConversationLifecycle(session.id);
  check(lifecycle.success && lifecycle.data.status === "ACTIVE", "getConversationLifecycle: ACTIVE for a fresh session");

  const metadata = await getConversationMetadata(session.id);
  check(metadata.success && metadata.data.turnCount === 2, "getConversationMetadata: real turn count from persisted memoryItems", metadata);

  const contextWindow = await getContextWindow(session.id, { maxItems: 10 });
  check(contextWindow.success && contextWindow.data.items.length === 2, "getContextWindow: builds a window from the real persisted session");

  const convSummary = await getConversationSummary(session.id);
  check(convSummary.success && convSummary.data.summary.includes("stain removal"), "getConversationSummary: summary reflects real message content, not fabricated");

  const missingSession = await recoverConversation("not-a-real-session-id");
  check(!missingSession.success && missingSession.error.code === "NOT_FOUND", "recoverConversation: unknown session id returns NOT_FOUND, not a crash");

  // ---- Cleanup ----
  await closeSession(session.id);
  await prisma.experienceSession.delete({ where: { id: session.id } });
  const stillExists = await prisma.experienceSession.findUnique({ where: { id: session.id } });
  check(stillExists === null, "cleanup: disposable test session removed");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
