import { retryWithBackoff } from "@/lib/retry";
import type { LLMGenerationInput, LLMGenerationOutput, LLMProvider } from "@/lib/runtime/types";

/**
 * MUV AI — Stage 6E, OpenAI provider (Chat Completions API,
 * https://platform.openai.com/docs/api-reference/chat). Same real-`fetch`,
 * no-SDK-dependency approach as `lib/ai/providers/anthropic.ts` — see that
 * file's header for the reasoning (no AI SDK is installed in this project,
 * and this is a stable, documented REST endpoint).
 *
 * HONEST LIMITATION: no live call to this provider has been made in this
 * development environment — no `OPENAI_API_KEY` is configured here. See
 * `LLM_INTEGRATION_REPORT.md` for exactly what was and wasn't verified.
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 20_000;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function toChatMessages(input: LLMGenerationInput): ChatMessage[] {
  const history: ChatMessage[] = (input.conversationHistory ?? []).map((t) => ({ role: t.role, content: t.content }));
  return [
    { role: "system", content: input.systemInstructions },
    ...history,
    { role: "user", content: `GROUNDED CONTEXT:\n${input.groundedContext}\n\nUSER MESSAGE:\n${input.redactedUserMessage}` },
  ];
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "OPENAI" as const;

  async generate(input: LLMGenerationInput): Promise<LLMGenerationOutput> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

    return retryWithBackoff(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            messages: toChatMessages(input),
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const error: Error & { status?: number } = new Error(`OpenAI request failed: ${res.status} ${errBody}`);
          error.status = res.status;
          throw error;
        }
        const data = (await res.json()) as {
          choices: { message: { content: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = data.choices[0]?.message.content?.trim();
        if (!text) throw new Error("OpenAI response contained no text content");

        return {
          text,
          providerName: this.name,
          usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens },
        };
      } finally {
        clearTimeout(timeout);
      }
    });
  }
}
