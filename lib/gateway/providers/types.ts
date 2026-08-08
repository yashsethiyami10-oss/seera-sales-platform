/**
 * MUV AI Gateway (Phase 5.2, Module 2) — Provider Adapter contract.
 *
 * Every provider (Anthropic, OpenAI, Gemini, and any future one) implements
 * this same shape. Nothing above this file — the Gateway (`ai-gateway.ts`)
 * or anything that calls it — ever sees a provider-specific request/response
 * shape, error type, or SDK. That is what "the frontend must never know
 * which provider is active" and "do not hardcode provider-specific logic
 * into the Gateway" mean concretely: the branching on *which* adapter to
 * use lives in exactly one place (`providers/index.ts`'s factory switch,
 * mirroring the existing `lib/shipping/index.ts`/`lib/messaging/index.ts`
 * pluggable-provider pattern), and every adapter's own file is the only
 * place that ever talks HTTP to that specific provider.
 */

export type GatewayProviderRole = "system" | "user" | "assistant";

export type GatewayProviderMessage = {
  role: GatewayProviderRole;
  content: string;
};

export type GatewayGenerateInput = {
  messages: GatewayProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Cancellation — a caller (e.g. a request aborted by the customer
   * closing the chat) passes its own AbortSignal through untouched; every
   * adapter must honor it for both `generate()` and `generateStream()`. */
  signal?: AbortSignal;
};

export type GatewayGenerateOutput = {
  text: string;
  provider: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  finishReason?: string;
};

/** One streaming chunk. `done: true` always carries an empty `delta` — the
 * final chunk is a signal, not additional text. */
export type GatewayStreamChunk = {
  delta: string;
  done: boolean;
};

export type GatewayProviderErrorCode =
  | "TIMEOUT"
  | "CANCELLED"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "INVALID_REQUEST"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "PROVIDER_ERROR"
  | "UNKNOWN";

/** The one error shape every adapter throws — never a raw `fetch` error,
 * never a provider SDK error, never a bare string. `retryable` is set by
 * the adapter itself (it knows what its own provider's status codes mean)
 * so the shared resilience wrapper never has to guess from a message. */
export class GatewayProviderError extends Error {
  readonly code: GatewayProviderErrorCode;
  readonly provider: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: { code: GatewayProviderErrorCode; provider: string; retryable?: boolean; cause?: unknown }
  ) {
    super(message);
    this.name = "GatewayProviderError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.retryable = opts.retryable ?? false;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export interface GatewayProviderAdapter {
  readonly name: string;
  /** Deterministic, zero-network-call check — "is the config this adapter
   * needs present," never "have I verified it works against the real API." */
  isConfigured(): boolean;
  generate(input: GatewayGenerateInput): Promise<GatewayGenerateOutput>;
  generateStream(input: GatewayGenerateInput): AsyncGenerator<GatewayStreamChunk, void, unknown>;
}
