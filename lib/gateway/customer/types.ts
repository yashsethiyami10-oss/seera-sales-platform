/**
 * MUV AI Gateway — Phase 5.4, Customer Intelligence. Same established
 * `{success,data}|{success,error}` convention as Commerce Intelligence
 * (Phase 5.3) — see that module's `types.ts` for why this, not a new
 * shape, is used here too.
 */
export type CustomerToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string; fieldErrors?: Record<string, string[]> } };
