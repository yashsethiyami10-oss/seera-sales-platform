import type { LLMGenerationInput, LLMGenerationOutput, LLMProvider } from "@/lib/runtime/types";

/**
 * MUV AI — Stage 6E, Mock provider. Same purpose as `lib/muv-ai/gateway.ts`'s
 * existing `"MOCK"` provider code path (that module's own precedent for
 * "no live external call, but real, inspectable plumbing") — this exists
 * so retry/timeout/fallback/audit-logging/safety-gating can be verified
 * end-to-end in this environment, where no real `ANTHROPIC_API_KEY`/
 * `OPENAI_API_KEY` exists to test against. It is never selected by
 * `lib/ai/index.ts` unless `LLM_PROVIDER=MOCK` is explicitly set — the
 * factory's default is "no provider" (deterministic template fallback),
 * not this mock, so a misconfigured deployment can never silently serve
 * mock text to a real customer.
 *
 * Deliberately produces a real, grounded-looking sentence built only from
 * the actual `groundedContext` it's given (never invents content beyond
 * it) — so downstream grounding/citation checks have something honest to
 * verify against, and a test can also force a thrown error via
 * `MOCK_LLM_FORCE_ERROR=true` to exercise the fallback path.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "MOCK" as const;

  async generate(input: LLMGenerationInput): Promise<LLMGenerationOutput> {
    if (process.env.MOCK_LLM_FORCE_ERROR === "true") {
      throw new Error("MockLLMProvider: simulated provider failure (MOCK_LLM_FORCE_ERROR=true)");
    }

    const contextSnippet = input.groundedContext.slice(0, 240).trim();
    const text = contextSnippet
      ? `Based on what's documented: ${contextSnippet}${input.groundedContext.length > 240 ? "…" : ""}`
      : "I couldn't find grounded information on this, so I don't want to guess.";

    return { text, providerName: this.name, usage: { promptTokens: input.groundedContext.length, completionTokens: text.length } };
  }
}
