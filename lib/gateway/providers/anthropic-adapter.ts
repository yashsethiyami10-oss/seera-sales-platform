import { GatewayProviderError } from "./types";
import type { GatewayGenerateInput, GatewayGenerateOutput, GatewayProviderAdapter, GatewayStreamChunk } from "./types";
import { runWithRetry, toAbortAwareError, withTimeoutSignal } from "./resilience";

/**
 * MUV AI Gateway (Phase 5.2, Module 2) — Anthropic adapter, the one real,
 * fully-implemented provider for this module (per the brief: "if only one
 * provider is currently active, keep the others as clean adapter stubs").
 * Real `fetch()` call against the documented Messages API
 * (https://docs.anthropic.com/en/api/messages), no SDK dependency — this
 * project has none installed, and none is needed for a stable REST API.
 *
 * This is a standalone implementation, not a wrapper around
 * `lib/ai/providers/anthropic.ts` — that file belongs to the separate,
 * flag-gated Stage 6E runtime path (`lib/runtime/*`), which this Gateway
 * module must not touch or depend on ("preserve the existing architecture").
 * The two happen to call the same external API; nothing else is shared.
 *
 * HONEST LIMITATION, same as that Stage 6E file: no live call has been
 * made against a real ANTHROPIC_API_KEY in this environment — request/
 * response shapes are implemented against Anthropic's published API docs.
 */

const DEFAULT_MODEL = "claude-sonnet-5";
const API_VERSION = "2023-06-01";
const NAME = "ANTHROPIC";

function toAnthropicPayload(input: GatewayGenerateInput, model: string, stream: boolean) {
  const system = input.messages.find((m) => m.role === "system")?.content;
  const messages = input.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  return {
    model,
    max_tokens: input.maxTokens ?? 1024,
    temperature: input.temperature,
    system,
    messages,
    stream,
  };
}

function mapErrorStatus(status: number, body: string): GatewayProviderError {
  if (status === 401 || status === 403) {
    return new GatewayProviderError(`Anthropic authentication failed (${status})`, { code: "AUTH_ERROR", provider: NAME, retryable: false });
  }
  if (status === 429) {
    return new GatewayProviderError("Anthropic rate limit exceeded", { code: "RATE_LIMITED", provider: NAME, retryable: true });
  }
  if (status >= 500) {
    return new GatewayProviderError(`Anthropic server error (${status})`, { code: "PROVIDER_ERROR", provider: NAME, retryable: true });
  }
  return new GatewayProviderError(`Anthropic request rejected (${status}): ${body}`, { code: "INVALID_REQUEST", provider: NAME, retryable: false });
}

export class AnthropicAdapter implements GatewayProviderAdapter {
  readonly name = NAME;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async generate(input: GatewayGenerateInput): Promise<GatewayGenerateOutput> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new GatewayProviderError("ANTHROPIC_API_KEY is not set", { code: "NOT_CONFIGURED", provider: NAME, retryable: false });
    }
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    return runWithRetry(NAME, async () => {
      const { signal, cleanup } = withTimeoutSignal(NAME, input.signal);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "content-type": "application/json" },
          body: JSON.stringify(toAnthropicPayload(input, model, false)),
          signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw mapErrorStatus(res.status, body);
        }
        const data = (await res.json()) as {
          content: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
          stop_reason?: string;
        };
        const text = data.content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("\n").trim();
        if (!text) {
          throw new GatewayProviderError("Anthropic response contained no text content", { code: "PROVIDER_ERROR", provider: NAME, retryable: false });
        }
        return {
          text,
          provider: NAME,
          model,
          usage: { promptTokens: data.usage?.input_tokens, completionTokens: data.usage?.output_tokens },
          finishReason: data.stop_reason,
        };
      } catch (err) {
        throw toAbortAwareError(NAME, signal, err);
      } finally {
        cleanup();
      }
    });
  }

  async *generateStream(input: GatewayGenerateInput): AsyncGenerator<GatewayStreamChunk, void, unknown> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new GatewayProviderError("ANTHROPIC_API_KEY is not set", { code: "NOT_CONFIGURED", provider: NAME, retryable: false });
    }
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    const { signal, cleanup } = withTimeoutSignal(NAME, input.signal);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "content-type": "application/json" },
        body: JSON.stringify(toAnthropicPayload(input, model, true)),
        signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw mapErrorStatus(res.status, body);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          const event = JSON.parse(payload) as { type: string; delta?: { text?: string } };
          if (event.type === "content_block_delta" && event.delta?.text) {
            yield { delta: event.delta.text, done: false };
          }
        }
      }
      yield { delta: "", done: true };
    } catch (err) {
      throw toAbortAwareError(NAME, signal, err);
    } finally {
      cleanup();
    }
  }
}
