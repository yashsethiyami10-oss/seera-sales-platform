import { checkRateLimit } from "@/lib/rate-limit";
import { getToolDefinition } from "./tool-registry";

/**
 * MUV AI Gateway — Phase 5.7, per-tool rate limiting. Thin wrapper
 * around the existing, unmodified `lib/rate-limit.ts` (the same
 * in-memory limiter `actions/coupons.ts`/`actions/auth.ts` already use)
 * — no new limiter implementation, just a per-tool key derived from the
 * registry's own configured limit/window.
 */
export type ToolRateLimitDecision = { allowed: true } | { allowed: false; code: "RATE_LIMITED"; message: string };

export function checkToolRateLimit(toolName: string, identifier: string): ToolRateLimitDecision {
  const tool = getToolDefinition(toolName);
  // Unknown tools are rejected by `checkToolAccess` before this is ever
  // called in the real dispatch path; treated as unlimited here rather
  // than throwing, so this function stays a pure decision-maker.
  if (!tool) return { allowed: true };

  const { allowed } = checkRateLimit(`gateway-tool:${toolName}:${identifier}`, tool.rateLimit.limit, tool.rateLimit.windowMs);
  if (!allowed) {
    return { allowed: false, code: "RATE_LIMITED", message: "Too many requests — please wait a moment and try again." };
  }
  return { allowed: true };
}
