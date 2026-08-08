import { getGatewayProviderAdapter, getGatewayProviderConfigStatus } from "@/lib/gateway/providers";
import type { GatewayProviderAdapter } from "@/lib/gateway/providers";
import { listRegisteredTools } from "@/lib/gateway/security/tool-registry";

/**
 * MUV AI Gateway — Production Rollout v1.0, Stage 1 (Production
 * Configuration and Safety Baseline).
 *
 * Server-only. Never import this from a "use client" component — nothing
 * here should ever reach a browser bundle, even though every value it
 * exposes is a boolean/number/enum, never a raw secret (see
 * `getGatewayProviderConfigStatus()`'s own "never a raw key" discipline,
 * which this module reuses rather than duplicates).
 *
 * This does NOT change how `lib/gateway/providers/index.ts` selects a
 * provider or how `anthropic-adapter.ts` calls it — those stay exactly as
 * they are (the frozen Provider Adapter contract). This module reads the
 * SAME env vars for reporting/validation, and adds new, additive,
 * independent kill switches that callers (the Experience Orchestrator's
 * pilot branch, the Security Dispatcher, capability modules) check
 * BEFORE reaching the frozen adapter/dispatcher — never inside them.
 */

export type GatewayEnvironment = "development" | "staging" | "production";

export type GatewayProductionConfig = {
  environment: GatewayEnvironment;
  provider: { selected: string | null; model: string | null; apiKeyPresent: boolean; implemented: boolean };
  /** Emergency AI kill switch — inverse of `GATEWAY_AI_ENABLED=false`. When
   * false, the entire AI layer (every capability branch in the Experience
   * Orchestrator) must behave as if it were never built — instant, total
   * fallback to the pre-existing deterministic path. */
  aiEnabled: boolean;
  /** Emergency provider kill switch — inverse of `GATEWAY_PROVIDER_ENABLED=false`.
   * When false, no live generation may occur even if a real provider is
   * configured; every capability must degrade to its deterministic-only
   * behavior (exactly the same code path already exercised when no
   * provider is configured at all). */
  providerEnabled: boolean;
  /** Emergency tool kill switch — inverse of `GATEWAY_TOOLS_ENABLED=false`.
   * When false, `invokeGatewayTool` denies every call, regardless of the
   * per-tool allow-list/rollout flags — a single global stop for the
   * entire tool-execution layer. */
  toolsEnabled: boolean;
  requestTimeoutMs: number;
  generationTimeoutMs: number;
  maxInputLength: number;
  maxOutputTokens: number;
  retryLimit: number;
  logLevel: string;
  /** 0-100. Deterministic per-identifier bucketing via `isRequestInRolloutPercentage`
   * — not wired into the dispatcher until Stage 13 (Controlled Production
   * Release); defined here first so the type/config surface is stable. */
  rolloutPercentage: number;
  /** Comma-separated emails/customerIds always allowed regardless of
   * rollout percentage — the "internal/founder allow-list first" mechanism
   * Stage 13 requires. Empty means no allow-list restriction is configured. */
  internalAllowList: string[];
};

function readBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

function readInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readEnvironment(): GatewayEnvironment {
  const explicit = process.env.GATEWAY_ENVIRONMENT;
  if (explicit === "development" || explicit === "staging" || explicit === "production") return explicit;
  // Vercel sets VERCEL_ENV to "production" | "preview" | "development" —
  // "preview" is treated as staging, matching how this codebase already
  // treats preview deployments elsewhere (see DEPLOYMENT_GUIDE.md).
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Read fresh every call — env vars don't change at runtime in practice,
 * and re-reading avoids any risk of a stale cache surviving a config
 * override in tests. Cheap: a handful of `process.env` reads, no I/O. */
export function getGatewayProductionConfig(): GatewayProductionConfig {
  const providerStatus = getGatewayProviderConfigStatus();

  return {
    environment: readEnvironment(),
    provider: {
      selected: providerStatus.selectedProvider,
      model: providerStatus.selectedProvider === "ANTHROPIC" ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5" : null,
      apiKeyPresent: providerStatus.configured,
      implemented: providerStatus.implemented,
    },
    aiEnabled: readBool("GATEWAY_AI_ENABLED", true),
    providerEnabled: readBool("GATEWAY_PROVIDER_ENABLED", true),
    toolsEnabled: readBool("GATEWAY_TOOLS_ENABLED", true),
    requestTimeoutMs: readInt("GATEWAY_REQUEST_TIMEOUT_MS", 25_000),
    generationTimeoutMs: readInt("GATEWAY_GENERATION_TIMEOUT_MS", 20_000),
    maxInputLength: readInt("GATEWAY_MAX_INPUT_LENGTH", 500),
    maxOutputTokens: readInt("GATEWAY_MAX_OUTPUT_TOKENS", 300),
    retryLimit: readInt("GATEWAY_RETRY_LIMIT", 2),
    logLevel: process.env.GATEWAY_LOG_LEVEL || (process.env.NODE_ENV === "production" ? "INFO" : "DEBUG"),
    rolloutPercentage: Math.min(100, Math.max(0, readInt("GATEWAY_ROLLOUT_PERCENTAGE", 100))),
    internalAllowList: (process.env.GATEWAY_INTERNAL_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function isAiKillSwitchActive(): boolean {
  return !getGatewayProductionConfig().aiEnabled;
}

export function isProviderKillSwitchActive(): boolean {
  return !getGatewayProductionConfig().providerEnabled;
}

export function isToolKillSwitchActive(): boolean {
  return !getGatewayProductionConfig().toolsEnabled;
}

/** Stable, deterministic bucketing — the same identifier always lands on
 * the same side of the rollout line for a given percentage, so a
 * customer's experience doesn't flip between turns. Not cryptographic;
 * doesn't need to be. */
export function isRequestInRolloutPercentage(identifier: string, percentage: number = getGatewayProductionConfig().rolloutPercentage): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash * 31 + identifier.charCodeAt(i)) >>> 0;
  }
  return hash % 100 < percentage;
}

export function isInternalAllowListed(identifier: string | null | undefined): boolean {
  if (!identifier) return false;
  const { internalAllowList } = getGatewayProductionConfig();
  if (internalAllowList.length === 0) return false;
  return internalAllowList.includes(identifier.trim().toLowerCase());
}

/**
 * Whether a given caller (customer email/id, or null for a guest) is
 * currently allowed into the progressive rollout: always true if no
 * allow-list is configured and rollout is 100%; otherwise true only if
 * explicitly allow-listed OR their deterministic bucket falls inside the
 * configured percentage. Kept separate from `isRequestInRolloutPercentage`
 * so Stage 13 can compose them without duplicating the allow-list check at
 * every call site.
 */
export function isRolloutEligible(identifier: string): boolean {
  const config = getGatewayProductionConfig();
  if (config.internalAllowList.length > 0 && isInternalAllowListed(identifier)) return true;
  if (config.internalAllowList.length > 0 && config.rolloutPercentage < 100) {
    // An allow-list is configured AND rollout is restricted — only
    // allow-listed callers get in during this phase of the release.
    return false;
  }
  return isRequestInRolloutPercentage(identifier, config.rolloutPercentage);
}

export type GatewayConfigValidationResult = { ok: boolean; errors: string[]; warnings: string[] };

/**
 * One-time-per-boot safety validation — never throws, mirrors
 * `lib/env.ts`'s `validateEnv()` discipline ("only warns, never a hard
 * crash gate"). Callers decide what to do with `errors` (e.g. log at
 * startup); this function itself has no side effects.
 */
export function assertGatewayEnvValid(): GatewayConfigValidationResult {
  const config = getGatewayProductionConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.environment === "production") {
    if (config.aiEnabled && config.providerEnabled && config.provider.selected && !config.provider.apiKeyPresent) {
      errors.push(`GATEWAY_LLM_PROVIDER="${config.provider.selected}" is selected but its API key is missing in production.`);
    }
    if (config.aiEnabled && config.providerEnabled && config.provider.selected && !config.provider.implemented) {
      errors.push(`GATEWAY_LLM_PROVIDER="${config.provider.selected}" is not yet an implemented adapter — cannot serve production traffic.`);
    }
    if (config.rolloutPercentage > 0 && config.rolloutPercentage < 100 && config.internalAllowList.length === 0) {
      warnings.push("GATEWAY_ROLLOUT_PERCENTAGE is partial with no GATEWAY_INTERNAL_ALLOWLIST configured — founder/internal-first rollout is not guaranteed.");
    }
  }

  if (listRegisteredTools().length === 0) {
    errors.push("No tools are registered in the Gateway tool allow-list — this should never happen and indicates a broken build.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The provider kill switch's actual enforcement point. Every capability
 * module that needs live generation (the pilot, and any future
 * capability) should call this instead of importing
 * `getGatewayProviderAdapter` from `lib/gateway/providers` directly —
 * same "wrap, don't modify" discipline as everywhere else in this phase.
 * Returns null under the exact same conditions the frozen factory
 * already returns null for (no provider configured), PLUS when the
 * kill switch is active — a caller cannot tell the two apart, which is
 * the point: both mean "fall back to the deterministic path."
 */
export function getEffectiveProviderAdapter(): GatewayProviderAdapter | null {
  if (isProviderKillSwitchActive()) return null;
  return getGatewayProviderAdapter();
}

/** Safe, secret-free snapshot for diagnostics/ops surfaces — every value
 * here is already boolean/number/enum; nothing needs redaction, but this
 * function exists so a caller never has to remember which raw env vars
 * are safe to print. */
export function getGatewaySafeConfigSnapshot(): GatewayProductionConfig & { registeredToolCount: number } {
  return { ...getGatewayProductionConfig(), registeredToolCount: listRegisteredTools().length };
}
