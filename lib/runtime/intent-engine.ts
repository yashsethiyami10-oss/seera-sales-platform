import { normalizeQuery } from "./query-normalizer";
import type { DetectedLanguage, IntentLabel, IntentResult, KnowledgeDomain } from "./types";

/**
 * MUV AI — Stage 6C/6E Runtime, Intent Intelligence Engine™.
 *
 * Same deterministic-lexicon discipline as `lib/intelligence/eq-engine.ts`
 * (Module 6) — a small, fixed, documented keyword set matched against the
 * customer's own message text, no model, no learned weights, every result
 * carries its literal matched evidence. This resolves CF-03 from
 * ENGINEERING_TEST_REPORT.md ("Intent Intelligence must own domain
 * identification... not be inferred implicitly by retrieval").
 *
 * Multi-label by design: a message can trigger several intents (e.g. a
 * safety question that is also a complaint) — `primaryIntent` is the
 * highest-scoring label, `secondaryIntents` are every other label that
 * also matched, never dropped silently.
 *
 * STAGE 6E — Objective 1 (Intent Intelligence). This resolves Blocker 1
 * from the Founder's Stage 6E authorization: Hindi/Hinglish/mixed-language
 * intent now works, via the SAME mechanism Objective 2 uses for retrieval
 * — `query-normalizer.ts`'s dictionary translates recognized Hindi/
 * Hinglish vocabulary to English BEFORE lexicon matching runs, so a
 * Hindi-phrased safety question and its English equivalent hit the same
 * lexicon entries. This is real reuse (one translation dictionary, not
 * two), not a second, possibly-inconsistent implementation.
 *
 * `repositoriesRequired` and `detectedLanguage` are new explicit output
 * fields (the Founder's protocol names "Repositories Required" as its own
 * required output, distinct from the internal `domains` enum this module
 * already produced).
 *
 * HONEST LIMITATION, restated from `query-normalizer.ts`: this remains a
 * fixed, dictionary-scoped translation, not general Hindi NLU. A
 * Hindi/Hinglish message using vocabulary outside that dictionary
 * classifies the same way an unrecognized English message would —
 * `GENERAL_QUESTION`, low confidence, not silently claimed as understood.
 *
 * SECOND HONEST LIMITATION, found during this stage's own verification:
 * because translation is bag-of-words (see `query-normalizer.ts`), a
 * MULTI-WORD lexicon phrase (e.g. "safe to use", "is it safe") will not
 * reliably match a fully-translated Hindi/Hinglish equivalent, since the
 * translated words land at the end of the normalized string, not in
 * English grammatical order. What DOES work reliably: (a) single-word
 * lexicon terms after translation, and (b) the very common real Hinglish
 * pattern of keeping an English technical term as-is mid-sentence (e.g.
 * "...mein side effect hota hai kya") — proven in this stage's own
 * verification script. Full multi-word phrase reconstruction across
 * languages would require real machine translation, not a dictionary.
 * See `MULTILINGUAL_VALIDATION_REPORT.md` for what was and wasn't proven.
 *
 * A genuinely LLM-backed classification refinement path exists
 * separately — `refineIntentWithProvider()` below — used only when a real
 * provider is configured (`lib/ai/index.ts`) and only to refine an
 * already-LOW-confidence deterministic result, never as the sole or first
 * classification step. This keeps Intent Classification's critical-path
 * behavior synchronous, fast, and free by default (unchanged from Stage
 * 6C), while still offering genuine "production-ready when configured"
 * capability the Founder's protocol asks for.
 */

type IntentEntry = { label: IntentLabel; domains: KnowledgeDomain[]; terms: string[] };

const LEXICON: IntentEntry[] = [
  { label: "PRODUCT_SAFETY", domains: ["PRODUCT"], terms: ["is it safe", "safe to use", "side effect", "allergic", "allergy", "reaction", "irritation", "burn", "rash", "mix with", "can i use with", "expiry", "expired"] },
  { label: "PRODUCT_USAGE", domains: ["PRODUCT"], terms: ["how to use", "how do i use", "how often", "how much should i", "application", "how long does it take", "before or after"] },
  { label: "PRODUCT_DISCOVERY", domains: ["PRODUCT"], terms: ["recommend", "which product", "best for", "suitable for", "looking for", "suggest a", "what should i buy"] },
  { label: "PRICE_AVAILABILITY", domains: ["PRODUCT", "GENERAL"], terms: ["price", "cost", "how much is", "mrp", "discount", "in stock", "available", "out of stock", "when will it be back"] },
  { label: "ORDER_STATUS", domains: ["GENERAL"], terms: ["my order", "order status", "tracking", "where is my order", "delivery status", "not delivered", "order number"] },
  { label: "MARKETING_CONTENT", domains: ["MARKETING"], terms: ["campaign", "social media post", "ad copy", "tagline", "content calendar", "influencer", "brand story", "brand identity", "brand statement", "mission statement", "vision statement"] },
  { label: "BRAND_GOVERNANCE", domains: ["MARKETING"], terms: ["brand guideline", "brand voice", "can we say", "is this on-brand", "logo usage", "tone of voice", "brand philosophy", "brand governance"] },
  { label: "INSTITUTIONAL_INQUIRY", domains: ["INSTITUTIONAL_SALES"], terms: ["bulk order", "institutional", "spa order", "salon order", "hotel order", "wholesale", "b2b", "corporate gifting"] },
  { label: "PROPOSAL_SUPPORT", domains: ["INSTITUTIONAL_SALES"], terms: ["proposal", "quotation", "consumption estimate", "roi", "objection", "negotiat"] },
  { label: "FOUNDER_DECISION_SUPPORT", domains: ["FOUNDER_INTELLIGENCE"], terms: ["what would the founder", "founder's view", "how should we decide", "founder decision", "founder rule", "founder constitution", "founder's constitution", "constitution article", "founder philosophy"] },
  { label: "COMPLAINT", domains: ["CUSTOMER_CARE", "GENERAL"], terms: ["complaint", "not happy", "disappointed", "refund", "return this", "return policy", "replacement", "warranty", "damaged", "wrong item", "poor quality", "worst"] },
  { label: "ESCALATION_REQUEST", domains: ["CUSTOMER_CARE", "GENERAL"], terms: ["speak to a manager", "escalate", "human agent", "talk to someone", "this is urgent", "legal action"] },
];

const CLARIFICATION_TRIGGERS = ["it", "that", "this one", "the product", "help me", "not sure what"];
const LIVE_DATA_FIELD_BY_LABEL: Partial<Record<IntentLabel, string[]>> = {
  PRICE_AVAILABILITY: ["MRP", "sellingPrice", "discount", "stock"],
  ORDER_STATUS: ["orderStatus", "shipmentStatus"],
};
const TOOLS_BY_LABEL: Partial<Record<IntentLabel, string[]>> = {
  ORDER_STATUS: ["ORDER_LOOKUP"],
  PRICE_AVAILABILITY: ["PRODUCT_CATALOG_LOOKUP"],
};

/** Deterministic, real, never a guess — `KnowledgeDomain` → the actual
 * repository name(s) that domain implicates. `GENERAL`/`CUSTOMER_CARE`
 * point at what genuinely exists today (the DB-backed general Knowledge
 * source; nothing, respectively — the Customer Care Knowledge Factory
 * does not exist, and this list must not imply otherwise). */
const DOMAIN_TO_REPOSITORY_NAMES: Record<KnowledgeDomain, string[]> = {
  PRODUCT: ["Product Knowledge Factory", "Product/Problem/Care Intelligence (database)"],
  MARKETING: ["Marketing Knowledge Factory"],
  INSTITUTIONAL_SALES: ["Institutional Sales Knowledge Factory"],
  FOUNDER_INTELLIGENCE: ["Founder Intelligence Knowledge Factory", "Founder Decision Registry"],
  // Stage 8 — the Customer Care Knowledge Factory now exists (built as a
  // standalone repository, wired into retrieval this stage). It is almost
  // entirely Citation-only content, so Marketing KF (the repository most
  // of those citations point back into) is named alongside it — a
  // Customer Care answer's real evidence often lives there.
  CUSTOMER_CARE: ["Customer Care Knowledge Factory", "Marketing Knowledge Factory (cited by Customer Care)"],
  GENERAL: ["General Knowledge (database)"],
};

function baseUnclassifiedResult(primaryIntent: "UNKNOWN" | "GENERAL_QUESTION", reasoning: string, requiresClarification: boolean, clarificationQuestion: string | null, detectedLanguage: DetectedLanguage): IntentResult {
  return {
    primaryIntent,
    secondaryIntents: [],
    domains: ["GENERAL"],
    confidence: "LOW",
    requiresLiveData: false,
    liveDataFields: [],
    requiresTool: false,
    toolsRequired: [],
    safetySensitive: false,
    isComplaint: false,
    requiresEscalation: false,
    requiresClarification,
    clarificationQuestion,
    reasoning,
    evidence: [],
    repositoriesRequired: [],
    detectedLanguage,
  };
}

export function classifyIntent(customerMessage: string | undefined): IntentResult {
  if (!customerMessage || !customerMessage.trim()) {
    return baseUnclassifiedResult("UNKNOWN", "No customer message text was provided — no basis for intent classification.", true, "Could you share more detail about what you'd like help with?", "EN");
  }

  // Stage 6E: normalize Hindi/Hinglish/Roman-Hindi vocabulary to English
  // BEFORE lexicon matching — the same dictionary Semantic Retrieval uses,
  // so intent classification and retrieval agree on what a query means.
  const normalized = normalizeQuery(customerMessage);
  const lower = normalized.normalizedQuery.toLowerCase();

  const matches: { label: IntentLabel; term: string; domains: KnowledgeDomain[] }[] = [];
  for (const entry of LEXICON) {
    for (const term of entry.terms) {
      if (lower.includes(term)) matches.push({ label: entry.label, term, domains: entry.domains });
    }
  }

  if (matches.length === 0) {
    const needsClarification = CLARIFICATION_TRIGGERS.some((t) => lower.includes(t)) && customerMessage.trim().split(/\s+/).length <= 6;
    return baseUnclassifiedResult(
      "GENERAL_QUESTION",
      normalized.translations.length
        ? `Translated ${normalized.translations.length} Hindi/Hinglish term(s) but no recognized intent keywords matched even after translation — defaulting to General Question with low confidence.`
        : "No recognized intent keywords were found — defaulting to General Question with low confidence, not a claim of certainty.",
      needsClarification,
      needsClarification ? "Could you tell me a bit more about what you need — a product, an order, or something else?" : null,
      normalized.detectedLanguage
    );
  }

  const counts = new Map<IntentLabel, number>();
  for (const m of matches) counts.set(m.label, (counts.get(m.label) ?? 0) + 1);
  const labelsBySeverity = LEXICON.map((e) => e.label);
  let primaryIntent: IntentLabel = matches[0]!.label;
  let winningCount = 0;
  for (const label of labelsBySeverity) {
    const c = counts.get(label) ?? 0;
    if (c > winningCount) {
      winningCount = c;
      primaryIntent = label;
    }
  }

  const secondaryIntents = [...counts.keys()].filter((l) => l !== primaryIntent);
  const allLabels = [primaryIntent, ...secondaryIntents];
  const domains = [...new Set(LEXICON.filter((e) => allLabels.includes(e.label)).flatMap((e) => e.domains))];
  const effectiveDomains = domains.length ? domains : (["GENERAL"] as KnowledgeDomain[]);

  const safetySensitive = allLabels.includes("PRODUCT_SAFETY");
  const isComplaint = allLabels.includes("COMPLAINT");
  const requiresEscalation = allLabels.includes("ESCALATION_REQUEST") || (isComplaint && safetySensitive);
  const liveDataFields = [...new Set(allLabels.flatMap((l) => LIVE_DATA_FIELD_BY_LABEL[l] ?? []))];
  const toolsRequired = [...new Set(allLabels.flatMap((l) => TOOLS_BY_LABEL[l] ?? []))];
  const repositoriesRequired = [...new Set(effectiveDomains.flatMap((d) => DOMAIN_TO_REPOSITORY_NAMES[d] ?? []))];

  const evidence = matches.filter((m) => m.label === primaryIntent).map((m) => `"${m.term}"`);
  // Translated-term matches are real but one inferential step removed from
  // the customer's literal words — scored slightly more conservatively so
  // a translated match is never reported with the same raw confidence as
  // a direct English match found the identical way Stage 6C always did.
  const translationDiscount = normalized.translations.length > 0 ? 10 : 0;
  const confidenceScore = Math.max(20, Math.min(90, 40 + winningCount * 20 - translationDiscount));
  const confidence: IntentResult["confidence"] = confidenceScore >= 70 ? "HIGH" : confidenceScore >= 45 ? "MODERATE" : "LOW";

  return {
    primaryIntent,
    secondaryIntents,
    domains: effectiveDomains,
    confidence,
    requiresLiveData: liveDataFields.length > 0,
    liveDataFields,
    requiresTool: toolsRequired.length > 0,
    toolsRequired,
    safetySensitive,
    isComplaint,
    requiresEscalation,
    requiresClarification: false,
    clarificationQuestion: null,
    reasoning: `Matched ${winningCount} keyword(s) associated with "${primaryIntent}"${secondaryIntents.length ? `; also detected ${secondaryIntents.join(", ")}` : ""}${normalized.translations.length ? ` (via ${normalized.translations.length} translated Hindi/Hinglish term(s): ${normalized.translations.map((t) => `"${t.token}"→"${t.translatedTo}"`).join(", ")})` : ""} — a lexicon match, not a semantic model inference.`,
    evidence,
    repositoriesRequired,
    detectedLanguage: normalized.detectedLanguage,
  };
}

/**
 * Stage 6E — optional, provider-assisted refinement. Never the first or
 * only classification step (see module header). Returns the ORIGINAL
 * deterministic result unchanged if no provider is given, if the
 * deterministic confidence is already HIGH/MODERATE, or if the provider
 * call fails for any reason — this can only ever improve on a low
 * -confidence deterministic guess, never override or destabilize a
 * confident one, and a provider outage can never break intent
 * classification (the pipeline's very first stage).
 */
export async function refineIntentWithProvider(
  result: IntentResult,
  customerMessage: string,
  provider: { generate: (input: { systemInstructions: string; groundedContext: string; redactedUserMessage: string; language: "EN"; promptVersion: string }) => Promise<{ text: string }> } | null
): Promise<IntentResult> {
  if (!provider || result.confidence !== "LOW") return result;

  const validLabels: IntentLabel[] = [
    "PRODUCT_DISCOVERY", "PRODUCT_USAGE", "PRODUCT_SAFETY", "ORDER_STATUS", "PRICE_AVAILABILITY",
    "MARKETING_CONTENT", "BRAND_GOVERNANCE", "INSTITUTIONAL_INQUIRY", "PROPOSAL_SUPPORT",
    "FOUNDER_DECISION_SUPPORT", "COMPLAINT", "ESCALATION_REQUEST", "GENERAL_QUESTION", "UNKNOWN",
  ];

  try {
    const output = await provider.generate({
      systemInstructions: `Classify the user's message into exactly one of these labels: ${validLabels.join(", ")}. Reply with ONLY the label, nothing else.`,
      groundedContext: `Deterministic pass suggested: ${result.primaryIntent} (LOW confidence).`,
      redactedUserMessage: customerMessage,
      language: "EN",
      promptVersion: "intent-refinement-v1",
    });
    const suggested = output.text.trim().toUpperCase() as IntentLabel;
    if (!validLabels.includes(suggested) || suggested === result.primaryIntent) return result;

    return {
      ...result,
      primaryIntent: suggested,
      secondaryIntents: [...new Set([...result.secondaryIntents, result.primaryIntent])],
      confidence: "MODERATE",
      reasoning: `${result.reasoning} Refined by provider-assisted classification (low-confidence deterministic pass only) from "${result.primaryIntent}" to "${suggested}".`,
    };
  } catch {
    return result;
  }
}
