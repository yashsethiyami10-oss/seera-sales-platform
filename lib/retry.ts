/**
 * Exponential backoff retry for calls to external services (payment
 * gateway, shipping providers, email/SMS/WhatsApp). Retries only on
 * failures that are plausibly transient — a network blip or a 5xx from the
 * provider — never on validation errors or explicit 4xx rejections, which
 * will just fail identically on every retry and only waste time before
 * surfacing the real problem.
 */

export type RetryOptions = {
  retries?: number; // attempts after the first, so `retries: 3` = up to 4 total tries
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
};

const defaultShouldRetry = (err: unknown) => {
  // Treat anything that isn't an explicit "don't retry this" signal as
  // retryable — callers with a clearer picture of their provider's error
  // shape (e.g. an HTTP status code) should pass a more precise `shouldRetry`.
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    return status >= 500 || status === 429; // server error or rate-limited
  }
  return true;
};

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8000, shouldRetry = defaultShouldRetry } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !shouldRetry(err)) throw err;

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      // Jitter avoids every retry across concurrent requests landing on the
      // exact same backoff schedule and re-hammering the provider in sync.
      const jitter = Math.random() * delay * 0.3;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError;
}
