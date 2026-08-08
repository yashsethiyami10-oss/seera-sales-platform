import type { PIICategory, PIIMatch, PrivacyScanResult } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Privacy Engine™ (FD-AIC-004, Privacy-First AI).
 *
 * "Mandatory privacy boundary before any external LLM call." Deterministic,
 * regex/keyword based detection — no model, no external call, so this can
 * run before anything is ever sent outward. Two categories (`PAYMENT_INFO`,
 * `CREDENTIAL`) are treated as hard blocks: `safeToProceed` becomes
 * `false` and the orchestrator must skip the LLM call entirely and use a
 * safe fallback, per FD-AIC-004's own "if safe redaction cannot complete:
 * do not call the LLM." Every other category is redacted to a placeholder
 * and generation may proceed with the redacted text.
 *
 * HONEST LIMITATION: this is pattern-based, not a trained PII model.
 * `POSTAL_ADDRESS` detection is a narrow 6-digit Indian PIN-code heuristic
 * (will miss addresses without a PIN code, and can false-positive on any
 * unrelated 6-digit number). `INTERNAL_CUSTOMER_ID`/`PRIVATE_ORDER_ID`
 * detection matches Prisma cuid-shaped strings generically — it cannot
 * distinguish which entity a cuid belongs to, only that it looks like one.
 * `CONFIDENTIAL_BUSINESS_DATA` only catches a fixed keyword list, not
 * arbitrary sensitive business language. False negatives are possible;
 * report this limitation honestly rather than claiming complete coverage.
 */

type Rule = { category: PIICategory; pattern: RegExp; blocks: boolean };

const RULES: Rule[] = [
  { category: "EMAIL", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, blocks: false },
  { category: "PHONE", pattern: /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, blocks: false },
  { category: "PAYMENT_INFO", pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g, blocks: true },
  { category: "CREDENTIAL", pattern: /\b(?:password|api[_-]?key|secret|otp|auth[_-]?token)\s*[:=]\s*\S+/gi, blocks: true },
  { category: "POSTAL_ADDRESS", pattern: /\b\d{6}\b/g, blocks: false },
  { category: "INTERNAL_CUSTOMER_ID", pattern: /\bc[a-z0-9]{24}\b/g, blocks: false },
  {
    category: "CONFIDENTIAL_BUSINESS_DATA",
    pattern: /\b(?:internal only|do not share externally|confidential:|margin is|cost price is)\b/gi,
    blocks: false,
  },
];

function mask(category: PIICategory, value: string): string {
  if (category === "EMAIL") {
    const [user, domain] = value.split("@");
    return `${user?.slice(0, 2) ?? ""}***@${domain ?? ""}`;
  }
  if (category === "PHONE") return `******${value.slice(-4)}`;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function scanAndRedact(text: string | undefined): PrivacyScanResult {
  if (!text || !text.trim()) {
    return { redactedText: "", matches: [], placeholderMap: {}, safeToProceed: true, blockReason: null };
  }

  let redacted = text;
  const matches: PIIMatch[] = [];
  const placeholderMap: Record<string, string> = {};
  let blockReason: string | null = null;
  let counter = 0;

  for (const rule of RULES) {
    redacted = redacted.replace(rule.pattern, (matched) => {
      counter += 1;
      const placeholder = `[REDACTED_${rule.category}_${counter}]`;
      placeholderMap[placeholder] = matched;
      matches.push({ category: rule.category, placeholder, sample: mask(rule.category, matched) });
      if (rule.blocks) blockReason = blockReason ?? `Detected ${rule.category} — this category must never be sent to an external LLM, even redacted.`;
      return placeholder;
    });
  }

  return {
    redactedText: redacted,
    matches,
    placeholderMap,
    safeToProceed: blockReason === null,
    blockReason,
  };
}

/** Restores safe placeholders in text that ORIGINATED FROM the platform's
 * own grounded content (e.g. reflecting a redacted order ID back in a
 * templated confirmation) — never used to restore raw PII into anything
 * that will leave the process (logs, LLM prompts). See FD-AIC-004's "safe
 * placeholder restoration after generation." */
export function restorePlaceholders(text: string, placeholderMap: Record<string, string>): string {
  let restored = text;
  for (const [placeholder, original] of Object.entries(placeholderMap)) {
    restored = restored.split(placeholder).join(original);
  }
  return restored;
}
