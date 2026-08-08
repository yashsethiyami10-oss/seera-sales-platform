import crypto from "node:crypto";

/**
 * MUV AI Gateway — Phase 5.6, correlation/request IDs. A plain UUID,
 * generated once per Gateway/tool call and threaded through every event
 * that call emits — never a session id, customer id, or anything else
 * that could double as an identity lookup on its own.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
