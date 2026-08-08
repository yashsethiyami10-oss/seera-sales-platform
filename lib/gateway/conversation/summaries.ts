import type { MemoryItem } from "@/lib/experience/types";
import type { ConversationSummary } from "./types";

/**
 * MUV AI Gateway — Phase 5.5, Conversation Summaries.
 *
 * Deliberately deterministic (concatenate + truncate), never an LLM
 * call — this Wave does not activate live generation, and a summary is
 * exactly the kind of "approved metadata" the brief's "persist only
 * approved metadata, never chain-of-thought" applies to: it is built
 * only from `MemoryItem.content`, which is always the customer's own
 * message text, never anything Module 6/7 reasoned about.
 */
const DEFAULT_MAX_LENGTH = 280;

export function summarizeConversation(sessionId: string, memoryItems: MemoryItem[], maxLength = DEFAULT_MAX_LENGTH): ConversationSummary {
  const joined = memoryItems.map((item) => item.content).join(" ");
  const truncated = joined.length > maxLength;
  const summary = truncated ? `${joined.slice(0, maxLength).trim()}…` : joined;

  return {
    sessionId,
    turnCount: memoryItems.length,
    summary,
    truncated,
  };
}
