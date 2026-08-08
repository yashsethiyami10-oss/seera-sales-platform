/**
 * MUV AI Gateway — Phase 5.7, request/response size limits.
 *
 * Deliberately small, named constants — not a generic "validate
 * anything" framework. Most Wave 1 tools already cap their own inputs
 * (e.g. `compareProducts` slices to 6 ids, `searchProducts` caps
 * `pageSize` at 50) — these are the limits for the inputs that didn't
 * already have one, applied at the security layer so the rule lives in
 * one place instead of being re-derived per tool.
 */
export const MAX_QUERY_TEXT_LENGTH = 500;
export const MAX_ARRAY_INPUT_LENGTH = 50;
export const MAX_RESPONSE_ITEMS = 100;

export class RequestTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestTooLargeError";
  }
}

export function assertQueryTextWithinLimit(text: string, maxLength = MAX_QUERY_TEXT_LENGTH): void {
  if (text.length > maxLength) {
    throw new RequestTooLargeError(`Query text exceeds the maximum allowed length of ${maxLength} characters`);
  }
}

export function assertArrayWithinLimit(items: unknown[], maxLength = MAX_ARRAY_INPUT_LENGTH): void {
  if (items.length > maxLength) {
    throw new RequestTooLargeError(`Request array exceeds the maximum allowed length of ${maxLength} items`);
  }
}

/** Caps an already-built response array — a safety net for a future
 * tool whose underlying query doesn't already `take`/`slice`, never a
 * substitute for that query doing its own capping. */
export function capResponseItems<T>(items: T[], maxItems = MAX_RESPONSE_ITEMS): T[] {
  return items.length > maxItems ? items.slice(0, maxItems) : items;
}
