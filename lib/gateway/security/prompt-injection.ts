/**
 * MUV AI Gateway — Phase 5.7, prompt-injection detection and
 * containment. Same pattern-matching technique the separate internal
 * Sales AI system already uses (`lib/muv-ai/security.ts`'s
 * `injectionPatterns`), reimplemented fresh here rather than imported —
 * that file is organization-scoped and tied to tables (`AiSecurityEvent`,
 * `AiConfiguration`) that belong to the separate internal system; this
 * Gateway keeps its own, per the established "no cross-contamination"
 * discipline (see docs/ai-intelligence-core/
 * FOUNDATION_STABILIZATION_5_2_1.md).
 *
 * Applies to two distinct inputs, per the brief's own two bullets:
 *   - "prompt-injection detection and containment" — customer-supplied
 *     text reaching any tool (search queries, care-guidance keywords).
 *   - "untrusted knowledge-content handling" — retrieved Knowledge
 *     Factory content, before it could ever ground a generated answer.
 * Detection only, deliberately — this Wave does not activate live
 * generation, so "containment" here means "flag it so a future
 * generation step can refuse to use it," not an attempt to silently
 * rewrite arbitrary text (which risks corrupting legitimate content in
 * ways just as hard to reason about as the injection itself).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the|previous) (instructions|prompts|rules)/i,
  /disregard (all|any|the|previous) (instructions|prompts|rules)/i,
  /you are now/i,
  /act as (root|administrator|system|a different)/i,
  /^\s*system\s*:/im,
  /reveal (the |your )?(system prompt|api key|secret|password|instructions)/i,
  /bypass (rbac|permission|approval|security|safety)/i,
  /pretend (you are|to be)/i,
  /new instructions?:/i,
];

export type PromptInjectionScanResult = {
  suspicious: boolean;
  matchedPatterns: string[];
};

export function detectPromptInjection(text: string): PromptInjectionScanResult {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) matched.push(pattern.source);
  }
  return { suspicious: matched.length > 0, matchedPatterns: matched };
}

/**
 * "Containment" for a single piece of untrusted knowledge content —
 * never modifies or forwards flagged content silently; a caller must
 * check `.safe` before using `.content` for anything that could
 * eventually reach a provider prompt. The original text is still
 * returned (not rewritten) so a human/audit path can inspect exactly
 * what was flagged and why.
 */
export function containKnowledgeContent(sourceId: string, content: string): { safe: boolean; content: string; reason?: string } {
  const scan = detectPromptInjection(content);
  if (!scan.suspicious) return { safe: true, content };
  return {
    safe: false,
    content,
    reason: `Knowledge content from "${sourceId}" matched ${scan.matchedPatterns.length} injection-like pattern(s) and must not ground a generated response until reviewed.`,
  };
}
