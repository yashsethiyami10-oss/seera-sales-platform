import type { SourceReference } from "@/lib/retrieval/types";
import { buildSystemInstructions, PROMPT_VERSION } from "@/lib/ai/prompt";
import type {
  ConflictResolutionOutcome, FounderReasoningResult, LLMConversationTurn, LLMProvider, PrivacyScanResult,
  ResponseAssemblyResult, ResponseLanguage, RuntimeConfidenceResult, RuntimeDecisionResult, RuntimeKnowledgeResult,
} from "./types";

/**
 * MUV AI — Stage 6C/6E Runtime, Response Assembly Runtime™.
 *
 * Implements FD-AIC-001's "LLM Response Assembly" stage. Stage 6C built
 * this as a provider-independent contract with no concrete provider behind
 * it; Stage 6E wires it to `lib/ai/index.ts`'s `getLLMProvider()` — real
 * Anthropic/OpenAI HTTP calls now exist (see `lib/ai/providers/*.ts`), but
 * `getLLMProvider()` returns `null` unless `LLM_PROVIDER` is explicitly set
 * in the deployment's environment. **No API key is configured in this
 * development environment**, so every actual run of this stage's own
 * verification scripts still exercises the deterministic fallback path or
 * the `MOCK` provider — see `LLM_INTEGRATION_REPORT.md` for exactly what
 * was and wasn't verified against a real network call.
 *
 * "The LLM must never become the authoritative knowledge source" is
 * enforced twice, independently: (1) here, via `buildSystemInstructions()`
 * (`lib/ai/prompt.ts`) instructing the model to compose only from
 * `groundedContext`, never invent facts; (2) downstream, via
 * `safety-runtime.ts`'s post-generation checks, which now include a
 * `citedKoids`-vs-`citationsIncluded` verification specifically for
 * real-provider output (see that module).
 *
 * HONEST LIMITATION (unchanged from Stage 6C): the deterministic fallback
 * cannot translate freely. Hindi/Hinglish support on the FALLBACK path is
 * a fixed template-string lexicon, not generation — genuine free-form
 * Hindi/Hinglish composition requires a real provider to actually be
 * configured and reachable.
 */

const TEMPLATES: Record<ResponseLanguage, { grounded: string; noKnowledge: string; escalate: string; uncertain: string; blocked: string; draftNotice: string; noPolicyYet: string }> = {
  EN: {
    grounded: "Here's what I found:",
    noKnowledge: "I couldn't find grounded information on this in our knowledge base, so I don't want to guess.",
    escalate: "I'm connecting you with our team so a person can help with this directly.",
    uncertain: "I found conflicting information and can't confidently resolve it — flagging this for review rather than guessing.",
    blocked: "I can't process this message safely right now. Let me connect you with our team.",
    draftNotice: "(Note: part of this reflects documentation still pending Founder review, not yet finalized.)",
    noPolicyYet: "This isn't something we have a confirmed, finalized policy for yet, so I don't want to guess at an answer.",
  },
  HI: {
    grounded: "मुझे यह जानकारी मिली:",
    noKnowledge: "मुझे इस बारे में हमारे नॉलेज बेस में पक्की जानकारी नहीं मिली, इसलिए मैं अंदाज़ा नहीं लगाना चाहूँगा।",
    escalate: "मैं आपको हमारी टीम से जोड़ रहा हूँ ताकि कोई व्यक्ति सीधे मदद कर सके।",
    uncertain: "मुझे परस्पर विरोधी जानकारी मिली है और मैं इसे पूरे भरोसे से हल नहीं कर सकता — इसे समीक्षा के लिए भेज रहा हूँ।",
    blocked: "मैं अभी इस संदेश को सुरक्षित रूप से प्रोसेस नहीं कर सकता। मैं आपको हमारी टीम से जोड़ता हूँ।",
    draftNotice: "(नोट: इसका कुछ हिस्सा अभी भी फाउंडर समीक्षा के लंबित दस्तावेज़ पर आधारित है।)",
    noPolicyYet: "इसके लिए अभी हमारे पास कोई पक्की, अंतिम नीति नहीं है, इसलिए मैं अंदाज़ा नहीं लगाना चाहूँगा।",
  },
  HINGLISH: {
    grounded: "Yeh mujhe mila hai:",
    noKnowledge: "Iske baare mein humare knowledge base mein pakki jaankari nahi mili, isliye main guess nahi karna chahunga.",
    escalate: "Main aapko humari team se connect kar raha hoon taaki koi directly help kar sake.",
    uncertain: "Mujhe conflicting information mili hai aur main ise confidently resolve nahi kar sakta — review ke liye flag kar raha hoon.",
    blocked: "Main abhi is message ko safely process nahi kar sakta. Aapko team se connect karta hoon.",
    draftNotice: "(Note: iska kuch hissa abhi bhi Founder review ke pending documentation par based hai.)",
    noPolicyYet: "Iske liye abhi humare paas koi confirmed, final policy nahi hai, isliye main guess nahi karna chahunga.",
  },
};

/** Real, readable grounded context — what the model actually sees is a
 * plain-text digest of the top retrieved items, not an opaque JSON blob
 * (Stage 6C's original version passed `JSON.stringify(...)`, which is
 * harder for a model to ground against reliably and harder for a human
 * auditor to read in a trace). Capped at 5 items, matching
 * `citationsIncluded`'s own cap, so every fact offered to the model is
 * also a real, listed citation. */
function buildGroundedContext(results: RuntimeKnowledgeResult[]): string {
  if (!results.length) return "(no repository knowledge was retrieved for this turn)";
  return results
    .slice(0, 5)
    .map((r) => `- [${r.recordId}] ${r.title}${r.summary ? `: ${r.summary}` : ""} (status: ${r.status ?? "UNKNOWN"})`)
    .join("\n");
}

export async function assembleResponse(input: {
  retrievalResults: RuntimeKnowledgeResult[];
  founderReasoning: FounderReasoningResult;
  decisionRuntime: RuntimeDecisionResult;
  privacy: PrivacyScanResult;
  confidence: RuntimeConfidenceResult;
  conflicts: ConflictResolutionOutcome;
  language: ResponseLanguage;
  provider?: LLMProvider | null;
  conversationHistory?: LLMConversationTurn[];
}): Promise<ResponseAssemblyResult> {
  const t = TEMPLATES[input.language] ?? TEMPLATES.EN;
  const citationsIncluded: SourceReference[] = input.retrievalResults.slice(0, 5).map((r) => ({ type: r.sourceType, id: r.recordId, label: r.title, linkKind: "direct" }));
  const groundedInRepository = input.retrievalResults.length > 0;

  // PII Protection stage upstream may have already blocked this turn.
  if (!input.privacy.safeToProceed) {
    return {
      responseText: `${t.blocked} (${input.privacy.blockReason ?? "privacy boundary triggered"})`,
      language: input.language,
      usedProvider: null,
      groundedInRepository: false,
      citationsIncluded: [],
      fallbackUsed: true,
      fallbackReason: input.privacy.blockReason ?? "Privacy boundary blocked this turn.",
      escalationNoticeIncluded: true,
      usage: null,
      promptVersion: null,
    };
  }

  if (input.provider) {
    try {
      const output = await input.provider.generate({
        systemInstructions: buildSystemInstructions({ language: input.language, confidenceLevel: input.confidence.level }),
        groundedContext: buildGroundedContext(input.retrievalResults),
        redactedUserMessage: input.privacy.redactedText,
        language: input.language,
        conversationHistory: input.conversationHistory,
        confidenceLevel: input.confidence.level,
        promptVersion: PROMPT_VERSION,
      });
      return {
        responseText: output.text,
        language: input.language,
        usedProvider: output.providerName,
        groundedInRepository,
        citationsIncluded,
        fallbackUsed: false,
        fallbackReason: null,
        // Cannot be verified structurally for free-form provider output —
        // safety-runtime.ts falls back to keyword matching for this path,
        // which is itself an honest, documented limitation.
        escalationNoticeIncluded: false,
        usage: output.usage ?? null,
        promptVersion: PROMPT_VERSION,
      };
    } catch {
      // Provider failure — fall through to the deterministic fallback
      // below rather than surfacing a raw error to the customer.
    }
  }

  const lines: string[] = [];
  const top3 = input.retrievalResults.slice(0, 3);
  // Stage 8 — a Gap Record is real, retrievable content (it honestly says
  // "this isn't documented"), but it is NOT an answer. If every one of the
  // top results is a Gap Record, use a distinct customer-appropriate
  // framing instead of the generic "grounded" template (which would
  // otherwise print the raw "[Documented gap — no content yet]" marker
  // text at a customer, technically true but a poor customer experience).
  const allTopResultsAreGaps = top3.length > 0 && top3.every((r) => (r.internalMetadata as Record<string, unknown> | null)?.["isGapRecord"] === true);

  if (allTopResultsAreGaps) {
    lines.push(t.noPolicyYet);
  } else if (groundedInRepository) {
    lines.push(t.grounded);
    for (const r of top3) lines.push(`- ${r.title}${r.summary ? `: ${r.summary}` : ""}`);
    // Stage 6D — Knowledge Factory content carries its real approval status
    // (DRAFT / OPEN_PENDING_FOUNDER_INPUT / REVIEW_READY / APPROVED) in
    // `status`. Disclose plainly whenever any cited item is not yet
    // Founder-approved — never present draft Knowledge Factory content
    // with the same confidence as approved fact.
    if (top3.some((r) => r.status === "DRAFT" || r.status === "OPEN_PENDING_FOUNDER_INPUT")) lines.push(t.draftNotice);
  } else {
    lines.push(t.noKnowledge);
  }
  if (input.conflicts.unresolvedCount > 0) lines.push(t.uncertain);
  const escalationNoticeIncluded = input.decisionRuntime.requiresHumanApproval;
  if (escalationNoticeIncluded) lines.push(t.escalate);

  return {
    responseText: lines.join(" "),
    language: input.language,
    usedProvider: null,
    groundedInRepository,
    citationsIncluded,
    fallbackUsed: true,
    fallbackReason: input.provider
      ? "Configured LLM provider call failed — used the deterministic Repository-First fallback instead."
      : "No LLM provider is configured for this deployment yet — used the deterministic Repository-First fallback (fixed template composition, not free-form generation).",
    escalationNoticeIncluded,
    usage: null,
    promptVersion: null,
  };
}
