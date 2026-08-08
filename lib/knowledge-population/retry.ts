/**
 * MUV AI — Intelligence Population (Block 2B, Stage 2).
 *
 * Neon's pooled connection (limit 5) occasionally stalls under the sustained
 * sequential load a full population run requires (~500+ writers, each doing
 * a findUnique + a transaction) — surfacing as "Timed out fetching a new
 * connection from the connection pool" or "Transaction already closed"
 * (P2024 / interactive-transaction-timeout errors). These are transient
 * infrastructure conditions, not logic errors: retrying the same
 * deterministic, idempotent write is safe and is the correct fix, rather
 * than loosening any correctness assertion.
 */

const TRANSIENT_ERROR_PATTERN = /(connection pool|Transaction already closed|Timed out fetching|kind: Closed|Error in PostgreSQL connection|ECONNRESET|Server has closed the connection)/i;

export async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 6, delayMs = 1500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT_ERROR_PATTERN.test(message) || attempt === attempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw lastError;
}
