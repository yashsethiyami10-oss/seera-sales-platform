/**
 * Minimal structured logger. Every call is one JSON line to stdout, which is
 * the right format for almost any log aggregator (Vercel's own log drain,
 * Datadog, CloudWatch) to ingest without extra parsing config.
 *
 * This is a placeholder for a real observability stack — swap the body of
 * `write()` for `pino`, or pipe stdout to Axiom/Datadog/Sentry's log
 * ingestion, without changing any call site, since every call site only
 * depends on the `logger.info/warn/error` shape below.
 *
 * Errors specifically should also go to an exception tracker (Sentry) in
 * production — `logger.error` here is a placeholder for that too. Never let
 * this be the *only* place a production error surfaces; stdout logs get lost
 * far more often than teams expect.
 */

type LogMeta = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, meta?: LogMeta) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...meta };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta),
};

/**
 * Wraps a Server Action so every call is logged with its outcome and
 * duration, without repeating try/catch/timing boilerplate in each action.
 * Usage: `export const createProduct = withLogging("createProduct", async (input) => {...})`
 */
export function withLogging<T extends (...args: any[]) => Promise<any>>(actionName: string, fn: T): T {
  return (async (...args: Parameters<T>) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      logger.info(`action:${actionName}`, { durationMs: Date.now() - start, success: result?.success });
      return result;
    } catch (err) {
      logger.error(`action:${actionName}:threw`, { durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }) as T;
}
