/**
 * MUV AI Gateway — Phase 5.3, Commerce Intelligence. Shared response
 * shape every Commerce Tool API function returns — matches this
 * codebase's own established `{success,data} | {success,error}`
 * convention (`lib/errors.ts`) exactly, rather than inventing a new one
 * (see `KnowledgeApiResponse` in Module 3 for the one place this
 * project intentionally used a different, richer shape — that was for
 * ranked/uncertain knowledge retrieval; Commerce tools are direct,
 * deterministic catalog/cart/customer-action reads, which this simpler
 * shape already fits everywhere else in the codebase).
 */
export type CommerceToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string; fieldErrors?: Record<string, string[]> } };
