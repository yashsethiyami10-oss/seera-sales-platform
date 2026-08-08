import { retryWithBackoff } from "@/lib/retry";
import type { LLMGenerationInput, LLMGenerationOutput, LLMProvider } from "@/lib/runtime/types";

/**
 * MUV AI — Stage 6E, Anthropic provider (Messages API,
 * https://docs.anthropic.com/en/api/messages). Real `fetch()` call, no SDK
 * dependency added — this project has zero AI SDK packages installed
 * today (confirmed by inspecting `package.json` before writing this file)
 * and a raw HTTP call against a documented, stable REST API needs none.
 *
 * Reuses `lib/retry.ts`'s `retryWithBackoff()` directly — the same
 * exponential-backoff-with-jitter helper `lib/messaging/providers/
 * twilio.ts` already uses for its own external HTTP calls — rather than
 * writing a second implementation.
 *
 * HONEST LIMITATION: no live call to this provider has been made in this
 * development environment — there is no `ANTHROPIC_API_KEY` configured
 * here (confirmed: no such variable exists in this session's environment).
 * The request/response shapes below are implemented against Anthropic's
 * public API documentation, not verified against a real response. See
 * `LLM_INTEGRATION_REPORT.md` for exactly what was and wasn't verified.
 */

const DEFAULT_MODEL = "claude-sonnet-5";
const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 20_000;

type AnthropicMessage = { role: "user" | "assistant"; content: string };

function toAnthropicMessages(input: LLMGenerationInput): AnthropicMessage[] {
  const history: AnthropicMessage[] = (input.conversationHistory ?? []).map((t) => ({ role: t.role, content: t.content }));
  return [...history, { role: "user", content: `GROUNDED CONTEXT:\n${input.groundedContext}\n\nUSER MESSAGE:\n${input.redactedUserMessage}` }];
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "ANTHROPIC" as const;

  async generate(input: LLMGenerationInput): Promise<LLMGenerationOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    return retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: input.systemInstructions,
            messages: toAnthropicMessages(input),
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const error: Error & { status?: number } = new Error(`Anthropic request failed: ${res.status} ${errBody}`);
          error.status = res.status;
          throw error;
        }
        const data = (await res.json()) as {
          content: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = data.content
          .filter((block) => block.type === "text" && block.text)
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (!text) throw new Error("Anthropic response contained no text content");

        return {
          text,
          providerName: this.name,
          usage: { promptTokens: data.usage?.input_tokens, completionTokens: data.usage?.output_tokens },
        };
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}
