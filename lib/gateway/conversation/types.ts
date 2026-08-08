import type { MemoryItem } from "@/lib/experience/types";

/**
 * MUV AI Gateway — Phase 5.5, Conversation Runtime. Same established
 * `{success,data}|{success,error}` convention as Commerce/Customer
 * Intelligence (Phases 5.3/5.4).
 */
export type ConversationToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string } };

export type ConversationMetadata = {
  sessionId: string;
  channel: string;
  status: string;
  turnCount: number;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string | null;
};

export type ConversationLifecycleState = {
  status: "ACTIVE" | "CLOSED" | "EXPIRED";
  canContinue: boolean;
};

/** "Do NOT expose chain-of-thought. Persist only approved metadata." —
 * every field here is either already-persisted `ExperienceSession`
 * metadata or derived from `MemoryItem.content`, which is always the
 * customer's own message text (see `experience-orchestrator.ts`) —
 * never internal reasoning, a decision trace, or a prompt. */
export type ConversationSummary = {
  sessionId: string;
  turnCount: number;
  summary: string;
  truncated: boolean;
};

export type ContextWindow = {
  items: MemoryItem[];
  truncated: boolean;
  totalChars: number;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

/** Ephemeral, client-facing state only — never persisted. */
export type TypingState = "IDLE" | "TYPING" | "STREAMING" | "ERROR";
