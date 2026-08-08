import { GatewayProviderError } from "./types";
import type { GatewayGenerateInput, GatewayGenerateOutput, GatewayProviderAdapter, GatewayStreamChunk } from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 2) — OpenAI adapter stub.
 *
 * Per the brief, only one provider gets a real implementation in this
 * module (see `anthropic-adapter.ts`); this one is a clean, selectable
 * stub, ready for a future module to fill in — it fully implements
 * `GatewayProviderAdapter` and can be selected via
 * `GATEWAY_LLM_PROVIDER="OPENAI"` today, it just cannot generate anything
 * yet. `isConfigured()` still reports real env-var presence so a
 * diagnostics/status check can distinguish "selected but no key set" from
 * "selected, key present, implementation pending" — useful signal for
 * whoever picks this up later.
 *
 * When implementing for real: `lib/ai/providers/openai.ts` (Stage 6E,
 * unrelated flagged pipeline, do not import from here) already has a
 * verified request/response shape against OpenAI's Chat Completions API to
 * use as a reference — this file intentionally does not depend on it.
 */
const NAME = "OPENAI";

export class OpenAIAdapter implements GatewayProviderAdapter {
  readonly name = NAME;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async generate(_input: GatewayGenerateInput): Promise<GatewayGenerateOutput> {
    throw new GatewayProviderError(
      "OpenAI adapter is a stub — not yet implemented (Phase 5.2, Module 2 built only the Anthropic adapter as the one active provider).",
      { code: "NOT_IMPLEMENTED", provider: NAME, retryable: false }
    );
  }

  // eslint-disable-next-line require-yield
  async *generateStream(_input: GatewayGenerateInput): AsyncGenerator<GatewayStreamChunk, void, unknown> {
    throw new GatewayProviderError(
      "OpenAI adapter is a stub — not yet implemented.",
      { code: "NOT_IMPLEMENTED", provider: NAME, retryable: false }
    );
  }
}
