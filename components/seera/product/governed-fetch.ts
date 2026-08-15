// Shared client-side fetch helper carrying the full governed error shape
// (lib/foundation/error-catalog.ts / lib/foundation/errors.ts on the server
// side). Replaces the ~10 near-identical local `send()` functions that used
// to exist one-per-component and only ever kept `.message`/`.code`/`.details`
// — this preserves that exact shape (so untouched call sites keep working
// unchanged) while adding userMessage/nextAction/retryable/supportRequired/
// requestId/category for components that want a richer error card.
export type GovernedErrorPayload = {
  message: string;
  code?: string;
  userMessage?: string;
  nextAction?: string;
  retryable?: boolean;
  supportRequired?: boolean;
  category?: string;
  requestId?: string;
  details?: unknown;
};

export class GovernedError extends Error {
  code?: string;
  userMessage?: string;
  nextAction?: string;
  retryable?: boolean;
  supportRequired?: boolean;
  category?: string;
  requestId?: string;
  details?: unknown;
  constructor(payload: GovernedErrorPayload) {
    super(payload.message);
    this.name = "GovernedError";
    this.code = payload.code;
    this.userMessage = payload.userMessage;
    this.nextAction = payload.nextAction;
    this.retryable = payload.retryable;
    this.supportRequired = payload.supportRequired;
    this.category = payload.category;
    this.requestId = payload.requestId;
    this.details = payload.details;
  }
}

// Return type is intentionally `any` (matching every prior local `send()` implementation this
// replaces) — callers destructure server response shapes directly (`result.id`, `result.stage`,
// etc.) without a shared response-type contract; tightening this is a separate, larger effort.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function send(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = data?.error ?? {};
    throw new GovernedError({
      message: e.message ?? e.code ?? "Request failed",
      code: e.code,
      userMessage: e.userMessage,
      nextAction: e.nextAction,
      retryable: e.retryable,
      supportRequired: e.supportRequired,
      category: e.category,
      requestId: e.requestId,
      details: e.details,
    });
  }
  return data;
}
