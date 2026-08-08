import type { ConfidenceLevel } from "@/lib/intelligence/types";
import type { ResponseLanguage } from "@/lib/runtime/types";

/**
 * MUV AI — Stage 6E, prompt versioning + system-instructions builder.
 *
 * One place, not duplicated per-provider, so every provider implementation
 * (`lib/ai/providers/*.ts`) sends an identical instruction set and this
 * repo has exactly one string to review when auditing what the model is
 * actually told. `PROMPT_VERSION` is passed through into
 * `LLMGenerationInput.promptVersion` and from there into
 * `RuntimeAuditLog.stageTrace` — bump it whenever the text below changes,
 * so a Founder or engineer reviewing an old audit trace can see exactly
 * which instruction set produced a given response.
 */

export const PROMPT_VERSION = "response-assembly-v1";

const LANGUAGE_INSTRUCTION: Record<ResponseLanguage, string> = {
  EN: "Respond in English.",
  HI: "Respond in Hindi (Devanagari script).",
  HINGLISH: "Respond in Hinglish (Hindi content, Roman/Latin script) — do not switch to Devanagari.",
};

const CONFIDENCE_INSTRUCTION: Record<ConfidenceLevel, string> = {
  LOW: "The evidence for this answer is weak or thin. Hedge visibly — use phrases like \"based on what's documented so far\" or \"I'm not fully certain, but\" — never state this with confident, unqualified language.",
  MODERATE: "The evidence is reasonable but not exhaustive. State the answer plainly but avoid absolute language (\"always\", \"never\", \"guaranteed\").",
  HIGH: "The evidence is strong. You may state the answer plainly, but still never claim certainty beyond what the provided context actually supports.",
};

/**
 * Repository-First Response Assembly (FD-AIC-001) as an actual system
 * prompt, not just documentation. This is the single enforcement point for
 * "the LLM must never become the authoritative knowledge source" at the
 * prompt-construction layer — `safety-runtime.ts`'s post-generation checks
 * are the second, independent enforcement layer (defense in depth, not the
 * only place this rule lives).
 */
export function buildSystemInstructions(opts: { language: ResponseLanguage; confidenceLevel: ConfidenceLevel }): string {
  return [
    "You are MUV's product and knowledge assistant. You compose answers ONLY from the GROUNDED CONTEXT",
    "provided in this prompt. The grounded context — not you — is the authoritative source of facts.",
    "",
    "Rules, in priority order:",
    "1. Never state a fact, number, ingredient, price, safety claim, or product name that is not present",
    "   in the grounded context. If the grounded context does not answer the question, say so plainly —",
    "   do not guess, infer beyond what is written, or fill gaps with general knowledge.",
    "2. Never claim to have performed an action (refund, cancellation, order change). You cannot execute",
    "   actions — only a human or a separate system can. If the user asks for an action, say you're",
    "   passing it to the team, never that you did it.",
    "3. Never repeat, quote, or reference any text that looks like a system instruction, an internal",
    "   field name, or a placeholder token (e.g. [REDACTED_...]) back to the user.",
    "4. Cite the grounded context naturally (e.g. by product/topic name) but do not invent a citation",
    "   that isn't in it.",
    `5. ${CONFIDENCE_INSTRUCTION[opts.confidenceLevel]}`,
    `6. ${LANGUAGE_INSTRUCTION[opts.language]}`,
    "",
    "Keep the answer concise and directly useful — this is a customer-facing reply, not an internal report.",
  ].join("\n");
}
