import { getSession } from "@/lib/experience/session-manager";
import type { ExperienceSessionRecord } from "@/lib/experience/types";
import type { ConversationLifecycleState, ConversationMetadata } from "./types";

/**
 * MUV AI Gateway — Phase 5.5, Conversation Lifecycle / Metadata /
 * Persistence / Recovery.
 *
 * "Conversation Persistence" is already real — `ExperienceSession`
 * (Module 8, frozen) already persists every session and its
 * `memoryItems`. This file adds no new persistence; it reuses
 * `session-manager.ts`'s own existing `getSession()` (lazy TTL expiry
 * already applied there) for "recovery," and derives lifecycle/metadata
 * views from the record it returns — never touches session-manager.ts
 * itself.
 */

export function deriveLifecycleState(session: ExperienceSessionRecord): ConversationLifecycleState {
  const status = session.status;
  return { status, canContinue: status === "ACTIVE" };
}

export function buildConversationMetadata(session: ExperienceSessionRecord): ConversationMetadata {
  return {
    sessionId: session.id,
    channel: session.channel,
    status: session.status,
    turnCount: session.memoryItems.length,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt,
  };
}

/**
 * "Conversation Recovery" — resolve an existing session (by id only, the
 * same identification model the live turn path already uses: the
 * browser holds the session id, the server validates it — see
 * `session-manager.ts`'s own header comment). No separate ownership
 * check is added here for a guest (customerId-null) session, since none
 * exists in the frozen Experience layer either; a caller that needs
 * customer-scoped recovery uses `customerApi.getMyConversationMemory`
 * (Phase 5.4) instead, which does enforce ownership.
 */
export async function recoverConversation(sessionId: string) {
  const session = await getSession(sessionId);
  return {
    session,
    lifecycle: deriveLifecycleState(session),
    metadata: buildConversationMetadata(session),
  };
}
