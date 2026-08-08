import type { PostGenerationCheck, PostGenerationSafetyResult, ResponseAssemblyResult } from "./types";

/**
 * MUV AI — Stage 6C Runtime, Safety and Privacy Runtime™ — post-generation
 * half (the pre-generation half is `privacy-engine.ts`). Resolves CF-06
 * from ENGINEERING_TEST_REPORT.md.
 *
 * Every check here is deterministic pattern/heuristic matching against the
 * already-assembled response text — never a second LLM call. Per the
 * module's own required honesty clause, this is a GROUNDING check, not a
 * truth-verification system: "passed" means "this response is structurally
 * consistent with what was retrieved and does not contain known-bad
 * patterns," never "every factual claim in this text has been proven
 * true." `groundingNotice` states this on every result.
 */

const OVERCONFIDENT_PHRASES = ["100% safe", "guaranteed", "definitely cures", "will definitely", "always works", "never fails", "completely safe for everyone"];
const DISMISSIVE_PHRASES = ["not our problem", "not my job", "that's not our issue", "figure it out yourself"];
const FALSE_ACTION_CLAIMS = ["i have processed your refund", "i have cancelled your order", "i have issued a refund", "your refund has been completed"];
const ESCALATION_LANGUAGE = ["connect you with", "escalate", "human agent", "our team will", "support team", "reach out to our"];
/** Stage 6E — matches both KOID formats this codebase's Knowledge
 * Factories actually use: `KO-XXX-001`-style ids and the
 * `{FILE}-ARTICLE-{N}` synthetic ids `knowledge-factory-loader.ts` assigns
 * to Constitution Articles. Case-insensitive on purpose — a real LLM may
 * not preserve exact casing. */
const KOID_MENTION_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-(?:ARTICLE-\d+|\d{3,}))\b/gi;

export function verifyPostGenerationSafety(
  response: ResponseAssemblyResult,
  opts: {
    requiresHumanApproval: boolean;
    confidenceLevel: "LOW" | "MODERATE" | "HIGH";
    safetySensitive: boolean;
    originalPIIValues: string[];
  }
): PostGenerationSafetyResult {
  const text = response.responseText.toLowerCase();
  const checks: PostGenerationCheck[] = [];

  const groundingOk = response.groundedInRepository || response.fallbackUsed;
  checks.push({
    area: "REPOSITORY_GROUNDING",
    passed: groundingOk,
    detail: groundingOk
      ? "Response is either grounded in retrieved knowledge or transparently used the no-knowledge-found fallback."
      : "Response is not marked as grounded and did not use the transparent fallback path.",
  });

  const hasCitations = !response.groundedInRepository || response.citationsIncluded.length > 0;
  // Stage 6E: for real-provider output specifically (fallbackUsed=false),
  // also verify every KOID-shaped token the model actually wrote is one of
  // the citations it was actually given — catches a real, specific class
  // of hallucination (inventing or misattributing a KOID) that the
  // deterministic fallback path is structurally incapable of committing
  // (it only ever prints citations it was literally given), so this half
  // of the check is a no-op there and only bites on real generated text.
  const citedIds = new Set(response.citationsIncluded.map((c) => c.id.toUpperCase()));
  const mentionedKoids = [...response.responseText.matchAll(KOID_MENTION_RE)].map((m) => m[0].toUpperCase());
  const uncitedMentions = mentionedKoids.filter((id) => !citedIds.has(id));
  const noUncitedKoid = response.fallbackUsed || uncitedMentions.length === 0;
  const citationsOk = hasCitations && noUncitedKoid;
  checks.push({
    area: "CITATION_COMPLETENESS",
    passed: citationsOk,
    detail: !hasCitations
      ? "Response claims grounding but carries no citations."
      : !noUncitedKoid
        ? `Response mentions ${uncitedMentions.join(", ")}, which ${uncitedMentions.length === 1 ? "is" : "are"} not among the citations actually provided — possible fabricated/misattributed reference.`
        : "Citations present for a grounded response, and every referenced id was actually provided.",
  });

  const noOverconfidence = !OVERCONFIDENT_PHRASES.some((p) => text.includes(p));
  checks.push({
    area: "UNSUPPORTED_CLAIMS",
    passed: noOverconfidence,
    detail: noOverconfidence ? "No absolute/overconfident claim phrases detected." : "Response contains an absolute claim phrase not supportable by retrieved evidence.",
  });

  const safetyLanguageOk = !opts.safetySensitive || !OVERCONFIDENT_PHRASES.some((p) => text.includes(p));
  checks.push({
    area: "PRODUCT_SAFETY_COMPLIANCE",
    passed: safetyLanguageOk,
    detail: safetyLanguageOk ? "No overconfident safety claims on a safety-sensitive topic." : "Safety-sensitive topic contains an overconfident claim — must be reviewed.",
  });

  const hazardOk = !(opts.safetySensitive && text.includes("mix") && text.includes("safe"));
  checks.push({
    area: "HAZARDOUS_USE_RESTRICTION",
    passed: hazardOk,
    detail: hazardOk ? "No pattern suggesting an unverified mixing/usage safety claim." : "Response combines 'mix' and 'safe' on a safety-sensitive topic — requires human verification before delivery.",
  });

  const confidenceAligned = opts.confidenceLevel !== "LOW" || noOverconfidence;
  checks.push({
    area: "CONFIDENCE_LANGUAGE_ALIGNMENT",
    passed: confidenceAligned,
    detail: confidenceAligned ? "Response language matches its confidence level." : "LOW confidence result uses overconfident language — must be softened before delivery.",
  });

  const escalationCompliant = !opts.requiresHumanApproval || response.escalationNoticeIncluded || ESCALATION_LANGUAGE.some((p) => text.includes(p));
  checks.push({
    area: "FOUNDER_RULE_COMPLIANCE",
    passed: escalationCompliant,
    detail: escalationCompliant ? "Escalation requirement (if any) is reflected in the response." : "This turn requires human approval/escalation, but the response text does not reflect that.",
  });
  checks.push({
    area: "REQUIRED_ESCALATION",
    passed: escalationCompliant,
    detail: checks[checks.length - 1]!.detail,
  });

  const careLanguageOk = !DISMISSIVE_PHRASES.some((p) => text.includes(p));
  checks.push({
    area: "CARE_LANGUAGE_COMPLIANCE",
    passed: careLanguageOk,
    detail: careLanguageOk ? "No dismissive-language patterns detected." : "Response contains a dismissive-language pattern.",
  });

  const noPIILeak = opts.originalPIIValues.every((v) => v.length === 0 || !response.responseText.includes(v));
  checks.push({
    area: "PII_LEAKAGE",
    passed: noPIILeak,
    detail: noPIILeak ? "No raw PII values (pre-redaction) found in the response text." : "A raw PII value leaked into the response text — must be blocked.",
  });

  const noInternalLeak = !text.includes("internalmetadata") && !text.includes("system prompt") && !text.includes("system instructions");
  checks.push({
    area: "INTERNAL_INFO_LEAKAGE",
    passed: noInternalLeak,
    detail: noInternalLeak ? "No internal-only markers detected in response text." : "Response text contains an internal-only marker.",
  });

  const noFalseActionClaim = !FALSE_ACTION_CLAIMS.some((p) => text.includes(p));
  checks.push({
    area: "UNSAFE_ACTION_REQUEST",
    passed: noFalseActionClaim,
    detail: noFalseActionClaim ? "No claim of an autonomously-performed action detected." : "Response falsely claims an action (refund/cancellation) was performed — this AI never executes actions.",
  });

  const overallPassed = checks.every((c) => c.passed);

  return {
    overallPassed,
    checks,
    groundingNotice: "These checks verify structural grounding and known-bad patterns only — they are not a truth-verification system and do not prove every factual claim is correct.",
    blockedReasons: checks.filter((c) => !c.passed).map((c) => `${c.area}: ${c.detail}`),
  };
}
