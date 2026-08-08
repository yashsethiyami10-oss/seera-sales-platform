/**
 * Next.js's own boot hook (Phase 16) — `register()` runs once when the
 * server actually starts (dev and prod), not during `next build`'s static
 * analysis, so this can never turn a missing-env-var problem into a build
 * failure. Runs in the nodejs runtime only (middleware/edge already has its
 * own, separate env surface) — see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    const { logger } = await import("@/lib/logger");
    const { ok, missing } = validateEnv();
    if (!ok) {
      logger.error("startup:missing-env-vars", { missing });
    } else {
      logger.info("startup:env-check-passed");
    }
  }
}
