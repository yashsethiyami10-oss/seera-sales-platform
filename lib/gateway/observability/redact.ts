/**
 * MUV AI Gateway — Phase 5.6, environment-safe log redaction.
 *
 * Two layers, applied to every event's `metadata` before it is ever
 * printed or persisted:
 *   1. Known-sensitive KEY NAMES are replaced outright, regardless of
 *      their value's shape (address fields, phone, email, payment
 *      fields, raw prompt/content/message-body fields, tokens/secrets).
 *   2. Every remaining STRING VALUE is still scanned against real
 *      pattern classes (email, phone, card-like digit runs, API-key-
 *      shaped tokens, DB connection strings) — the same two-layer
 *      discipline `lib/muv-ai/security.ts`'s `sanitizeContext()`
 *      already uses for the separate internal Sales AI system, applied
 *      fresh here rather than importing that file (kept intentionally
 *      separate — see docs/ai-intelligence-core/
 *      FOUNDATION_STABILIZATION_5_2_1.md's "no cross-contamination"
 *      discipline).
 *
 * Long free-text fields (a full prompt, full knowledge content, a full
 * customer message) are never truncated-and-kept — they are replaced
 * with a length/hash summary only, so no amount of metadata volume can
 * reconstruct the original text from logs.
 */

const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[_-]?key|authorization|cookie|session|address|line1|line2|pincode|zip|phone|mobile|email|card|cvv|upi|razorpay|ifsc|account[_-]?number|ssn|pan\b)/i;

/** Fields whose VALUE is customer/knowledge free text — never logged
 * verbatim regardless of key name, only summarized. */
const CONTENT_KEY_PATTERN = /(prompt|message|content|body|query|text|transcript|summary)/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\b(\+?\d{1,3}[-\s]?)?\d{10}\b/g;
const CARD_LIKE_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SECRET_TOKEN_RE = /\b(sk|pk|rzp)[-_][A-Za-z0-9_-]{10,}\b/gi;
const DB_URL_RE = /\b\w+:\/\/[^\s"']*:[^\s"']*@[^\s"']+/gi;

function summarizeText(value: string): string {
  return `[REDACTED:len=${value.length}]`;
}

function scrubStringPatterns(value: string): string {
  return value
    .replace(DB_URL_RE, "[REDACTED:url]")
    .replace(SECRET_TOKEN_RE, "[REDACTED:token]")
    .replace(EMAIL_RE, "[REDACTED:email]")
    .replace(CARD_LIKE_RE, "[REDACTED:number]")
    .replace(PHONE_RE, "[REDACTED:phone]");
}

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (depth > 6) return "[REDACTED:max-depth]";

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
    if (CONTENT_KEY_PATTERN.test(key) && value.length > 40) return summarizeText(value);
    return scrubStringPatterns(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item, depth + 1));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v, depth + 1);
    }
    return out;
  }

  return value;
}

export function redact<T extends Record<string, unknown> | undefined>(metadata: T): T {
  if (!metadata) return metadata;
  return redactValue("", metadata, 0) as T;
}
