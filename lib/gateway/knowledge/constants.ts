/**
 * MUV AI Gateway (Phase 5.2, Module 3) — retrieval limits and the
 * relevance threshold below which a result is treated as unverified
 * rather than presented as fact. Named constants, not magic numbers
 * scattered through each fetch function.
 */
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 20;

/** Below this deterministic 0-100 confidence, a result is real (it did
 * match something) but too weak to safely ground a customer-facing
 * answer — surfaced as `status: "LOW_CONFIDENCE"` rather than silently
 * included among normal results. */
export const MIN_CONFIDENCE_THRESHOLD = 20;
