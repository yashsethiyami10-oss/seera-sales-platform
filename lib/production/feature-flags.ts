import type { FeatureFlagKey, FeatureFlags } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Feature Flag Manager.
 *
 * "Use deterministic configuration. No remote feature service." Base
 * values come from env vars (deterministic per-deployment, no network
 * call). `updateFeatureFlags()` needs *some* mutable state to be
 * meaningful at all, but "Database: prefer computation over storage, do
 * not introduce new schema automatically" rules out a new table for it —
 * so overrides live in an in-memory `Map`, the exact same "single
 * -instance, resets on deploy/restart" pattern `lib/rate-limit.ts`
 * already established and this codebase already accepts for comparable
 * in-process state. Swap for a real config service the same way
 * `lib/rate-limit.ts`'s own header comment already recommends Upstash
 * Redis for its counters, keeping this file's exported function
 * signatures unchanged.
 */

const DEFAULT_FLAGS: FeatureFlags = {
  EXPERIENCE_PLATFORM: true,
  FOUNDER_REVIEW: true,
  ANALYTICS: true,
  FEEDBACK: true,
  // No channel beyond Website (Module 8) exists yet — default off until a
  // second channel adapter is actually built.
  FUTURE_CHANNELS: false,
  // Stage 6C — all default false per FD-AIC-003 (Production Protection).
  // Only actions/runtime.ts reads these; the live orchestrateExperience()
  // path never checks them and is unaffected regardless of their value.
  RUNTIME_PIPELINE_ENABLED: false,
  RUNTIME_SEMANTIC_RETRIEVAL: false,
  RUNTIME_INTENT_INTELLIGENCE: false,
  RUNTIME_FOUNDER_REASONING: false,
  RUNTIME_CONFLICT_RESOLUTION: false,
  RUNTIME_PRIVACY_PROTECTION: false,
  // Stage 8 — the real go-live switch for website customer traffic. See
  // types.ts's own comment: requires RUNTIME_PIPELINE_ENABLED also being
  // true (double-gated) before orchestrateExperience() will ever branch
  // into the new pipeline.
  WEBSITE_RUNTIME_INTEGRATION_ENABLED: false,
  // Phase 6.1 — Controlled Product Search Pilot. Default false; staging-only,
  // Founder-enabled per session/environment. See types.ts's own comment.
  PILOT_PRODUCT_SEARCH_ENABLED: false,
};

const ENV_VAR_BY_FLAG: Record<FeatureFlagKey, string> = {
  EXPERIENCE_PLATFORM: "FEATURE_EXPERIENCE_PLATFORM",
  FOUNDER_REVIEW: "FEATURE_FOUNDER_REVIEW",
  ANALYTICS: "FEATURE_ANALYTICS",
  FEEDBACK: "FEATURE_FEEDBACK",
  FUTURE_CHANNELS: "FEATURE_FUTURE_CHANNELS",
  RUNTIME_PIPELINE_ENABLED: "FEATURE_RUNTIME_PIPELINE_ENABLED",
  RUNTIME_SEMANTIC_RETRIEVAL: "FEATURE_RUNTIME_SEMANTIC_RETRIEVAL",
  RUNTIME_INTENT_INTELLIGENCE: "FEATURE_RUNTIME_INTENT_INTELLIGENCE",
  RUNTIME_FOUNDER_REASONING: "FEATURE_RUNTIME_FOUNDER_REASONING",
  RUNTIME_CONFLICT_RESOLUTION: "FEATURE_RUNTIME_CONFLICT_RESOLUTION",
  RUNTIME_PRIVACY_PROTECTION: "FEATURE_RUNTIME_PRIVACY_PROTECTION",
  WEBSITE_RUNTIME_INTEGRATION_ENABLED: "FEATURE_WEBSITE_RUNTIME_INTEGRATION_ENABLED",
  PILOT_PRODUCT_SEARCH_ENABLED: "FEATURE_PILOT_PRODUCT_SEARCH_ENABLED",
};

function readBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

const runtimeOverrides = new Map<FeatureFlagKey, boolean>();

export function getFeatureFlags(): FeatureFlags {
  const flags = {} as FeatureFlags;
  for (const key of Object.keys(DEFAULT_FLAGS) as FeatureFlagKey[]) {
    if (runtimeOverrides.has(key)) {
      flags[key] = runtimeOverrides.get(key)!;
    } else {
      flags[key] = readBoolEnv(ENV_VAR_BY_FLAG[key], DEFAULT_FLAGS[key]);
    }
  }
  return flags;
}

export function updateFeatureFlags(partial: Partial<FeatureFlags>): FeatureFlags {
  for (const [key, value] of Object.entries(partial) as [FeatureFlagKey, boolean][]) {
    runtimeOverrides.set(key, value);
  }
  return getFeatureFlags();
}
