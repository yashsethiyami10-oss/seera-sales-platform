/**
 * MUV AI Gateway — Phase 6.1, Controlled Product Search Pilot.
 *
 * Deliberately tiny and pilot-scoped: the ONLY capability allowed in this
 * pilot is Product Search, so intent classification here only needs to
 * distinguish "there's enough in this message to attempt a real product
 * search" from "there isn't, ask a clarifying question" — it is not a
 * general-purpose intent classifier and must never become one within this
 * phase. Never touches `lib/intelligence/*` (Module 6, frozen) — this is a
 * new, independent, much narrower classifier for a single pilot capability.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "do", "does", "did", "you", "have", "has", "having", "is", "are", "am",
  "i", "we", "my", "your", "for", "of", "to", "in", "on", "at", "and", "or", "please",
  "hi", "hello", "hey", "can", "could", "would", "should", "want", "wanted", "looking",
  "look", "need", "needed", "some", "any", "me", "us", "it", "this", "that", "these",
  "those", "with", "about", "if", "so", "there", "just", "how", "hows", "what", "whats",
  "where", "which", "one", "ones", "got", "get",
]);

export type PilotIntent =
  | { kind: "PRODUCT_SEARCH"; query: string }
  | { kind: "AMBIGUOUS"; reason: string };

export function classifyPilotIntent(rawMessage: string): PilotIntent {
  const trimmed = rawMessage.trim();
  if (trimmed.length < 3) {
    return { kind: "AMBIGUOUS", reason: "Message is too short to identify a product search." };
  }

  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));

  if (tokens.length === 0) {
    return { kind: "AMBIGUOUS", reason: "No specific product, category, or need was mentioned." };
  }

  return { kind: "PRODUCT_SEARCH", query: tokens.join(" ") };
}
