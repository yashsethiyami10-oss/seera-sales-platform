import type { EmotionalState, EQResult } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Emotional Intelligence Engine (EQ).
 *
 * "Never claim certainty... Unknown must always remain valid... No
 * psychological profiling. No medical inference. No identity inference.
 * EQ is guidance only." — this is a small, fixed, documented keyword
 * lexicon matched against the customer's own message text, deterministic
 * end to end (no model, no learned weights, same discipline as Module 5's
 * ranking engine). It estimates *communication-relevant* signals only —
 * word choice, punctuation intensity — never a diagnosis, a personality
 * read, or a guess at who the customer is.
 *
 * Every result carries its literal matched evidence, so nothing here is a
 * black box: a founder or a future reviewer can see exactly which words
 * produced which classification.
 */

type LexiconEntry = { state: EmotionalState; terms: string[] };

const LEXICON: LexiconEntry[] = [
  { state: "ANGRY", terms: ["furious", "angry", "unacceptable", "ridiculous", "outrageous", "scam", "fraud"] },
  { state: "FRUSTRATED", terms: ["frustrated", "annoyed", "fed up", "tired of", "still not", "again and again", "keep having"] },
  { state: "CONCERNED", terms: ["worried", "concerned", "nervous", "afraid", "anxious", "is it safe", "safe to use"] },
  { state: "CONFUSED", terms: ["confused", "don't understand", "not sure", "unclear", "what does", "how do i", "how does this work"] },
  { state: "CURIOUS", terms: ["curious", "wondering", "just wanted to ask", "quick question", "out of interest"] },
  { state: "SATISFIED", terms: ["thank you", "thanks", "great product", "works well", "happy with", "love it"] },
  { state: "INTERESTED", terms: ["interested in", "would like to know more", "tell me more", "considering"] },
  { state: "POSITIVE", terms: ["good", "great", "excellent", "amazing", "wonderful"] },
  { state: "NEGATIVE", terms: ["bad", "poor", "terrible", "awful", "disappointing"] },
];

const EXCLAMATION_INTENSIFIES = ["ANGRY", "FRUSTRATED"] as const;

export function evaluateEmotion(customerMessage: string | undefined): EQResult {
  if (!customerMessage || !customerMessage.trim()) {
    return {
      state: "UNKNOWN",
      confidence: 0,
      confidenceLevel: "LOW",
      evidence: [],
      reasoning: "No customer message text was provided — no basis for an emotional signal estimate.",
    };
  }

  const lower = customerMessage.toLowerCase();
  const matches: { state: EmotionalState; term: string }[] = [];
  for (const entry of LEXICON) {
    for (const term of entry.terms) {
      if (lower.includes(term)) matches.push({ state: entry.state, term });
    }
  }

  if (matches.length === 0) {
    return {
      state: "NEUTRAL",
      confidence: 20,
      confidenceLevel: "LOW",
      evidence: [],
      reasoning: "No recognized emotional-signal keywords were found — defaulting to Neutral with low confidence, not a claim of certainty.",
    };
  }

  // Deterministic tie-break: count matches per state, prefer the state
  // with the most hits; ties broken by lexicon order (earlier = higher
  // communication urgency, per the LEXICON's own ordering).
  const counts = new Map<EmotionalState, number>();
  for (const m of matches) counts.set(m.state, (counts.get(m.state) ?? 0) + 1);
  let winningState: EmotionalState = matches[0]!.state;
  let winningCount = 0;
  for (const entry of LEXICON) {
    const c = counts.get(entry.state) ?? 0;
    if (c > winningCount) {
      winningCount = c;
      winningState = entry.state;
    }
  }

  const exclamations = (customerMessage.match(/!/g) ?? []).length;
  const intensified = exclamations >= 2 && (EXCLAMATION_INTENSIFIES as readonly string[]).includes(winningState);

  const evidence = matches.filter((m) => m.state === winningState).map((m) => `"${m.term}"`);
  if (intensified) evidence.push(`${exclamations} exclamation marks`);

  const baseConfidence = Math.min(90, 40 + winningCount * 20 + (intensified ? 10 : 0));
  const confidenceLevel: "LOW" | "MODERATE" | "HIGH" = baseConfidence >= 70 ? "HIGH" : baseConfidence >= 45 ? "MODERATE" : "LOW";

  return {
    state: winningState,
    confidence: baseConfidence,
    confidenceLevel,
    evidence,
    reasoning: `Matched ${winningCount} keyword(s) associated with "${winningState}"${intensified ? ", intensified by repeated exclamation marks" : ""} — a lexicon match, not a psychological or medical assessment.`,
  };
}
