import { GatewayProviderError } from "./types";
import type { GatewayGenerateInput, GatewayGenerateOutput, GatewayProviderAdapter, GatewayStreamChunk } from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 2) — Gemini adapter stub.
 *
 * Unlike Anthropic/OpenAI, no Gemini integration exists anywhere else in
 * this codebase to reference — this is a clean stub only, same contract,
 * selectable via `GATEWAY_LLM_PROVIDER="GEMINI"`, not yet able to
 * generate anything. See `openai-adapter.ts` for the same pattern.
 */
const NAME = "GEMINI";

export class GeminiAdapter implements GatewayProviderAdapter {
  readonly name = NAME;

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async generate(_input: GatewayGenerateInput): Promise<GatewayGenerateOutput> {
    throw new GatewayProviderError(
      "Gemini adapter is a stub — not yet implemented (Phase 5.2, Module 2 built only the Anthropic adapter as the one active provider).",
      { code: "NOT_IMPLEMENTED", provider: NAME, retryable: false }
    );
  }

  // eslint-disable-next-line require-yield
  async *generateStream(_input: GatewayGenerateInput): AsyncGenerator<GatewayStreamChunk, void, unknown> {
    throw new GatewayProviderError(
      "Gemini adapter is a stub — not yet implemented.",
      { code: "NOT_IMPLEMENTED", provider: NAME, retryable: false }
    );
  }
}
