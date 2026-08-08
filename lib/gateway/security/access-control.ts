import { getToolDefinition } from "./tool-registry";

/**
 * MUV AI Gateway — Phase 5.7, per-tool authorization.
 *
 * Pure, synchronous, independently testable — no `auth()`/request
 * context needed, matching the same discipline `lib/gateway/knowledge/
 * authorization.ts`'s `authorizeKfResults()` already established
 * (Phase 5.2.1): the actual caller-identity resolution happens
 * elsewhere (here, in `dispatch.ts`'s caller); this function only
 * answers "is this combination of tool + guest-or-not allowed at all."
 */
export type ToolAccessDecision =
  | { allowed: true }
  | { allowed: false; code: "TOOL_NOT_ALLOWED" | "UNAUTHENTICATED"; message: string };

export function checkToolAccess(toolName: string, context: { isGuest: boolean }): ToolAccessDecision {
  const tool = getToolDefinition(toolName);
  if (!tool) {
    return { allowed: false, code: "TOOL_NOT_ALLOWED", message: `"${toolName}" is not a registered Gateway tool` };
  }
  if (tool.access === "CUSTOMER_ONLY" && context.isGuest) {
    return { allowed: false, code: "UNAUTHENTICATED", message: `"${toolName}" requires a signed-in customer` };
  }
  return { allowed: true };
}
