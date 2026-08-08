import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { MockLLMProvider } from "@/lib/ai/providers/mock";
import type { LLMProvider } from "@/lib/runtime/types";

/**
 * DEPRECATED (Phase 5.2.1, Foundation Stabilization) — superseded by
 * `lib/gateway/providers/*` (the new canonical Provider Adapter). Kept
 * unmodified only because `lib/runtime/runtime-orchestrator.ts` (itself
 * deprecated, see its own header) still calls `getLLMProvider()`. Never
 * called from anything on the new `lib/gateway/*` path. Do not add a new
 * provider here — add it under `lib/gateway/providers/` instead.
 */

/**
 * MUV AI — Stage 6E, LLM provider factory. Same single-switch-point
 * pattern as `lib/shipping/index.ts`/`lib/messaging/index.ts`:
 * `LLM_PROVIDER` env var picks the active provider, every call site goes
 * through `getLLMProvider()`, never instantiates a provider class
 * directly.
 *
 * Default is `null` (no provider) — deliberately NOT "fall back to MOCK"
 * or "fall back to whichever provider has an API key." An unset
 * `LLM_PROVIDER` means this deployment has not opted into real generation
 * yet, and `response-assembly-runtime.ts`'s deterministic template
 * composer remains the entire behavior, exactly as it was before Stage
 * 6E. This is the FD-AIC-003 (Production Protection) discipline applied
 * to provider selection specifically: nothing here can silently start
 * making real network calls just because an API key happens to be present
 * in the environment.
 */
export function getLLMProvider(): LLMProvider | null {
  const provider = process.env.LLM_PROVIDER;
  switch (provider) {
    case "ANTHROPIC":
      return new AnthropicProvider();
    case "OPENAI":
      return new OpenAIProvider();
    case "MOCK":
      return new MockLLMProvider();
    case undefined:
    case "":
    case "NONE":
      return null;
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}

export { PROMPT_VERSION, buildSystemInstructions } from "@/lib/ai/prompt";

/**
 * Stage 8 — Production Integration, Phase 3 (LLM Production Preparation).
 * Real, deterministic configuration verification with ZERO network
 * activity — never calls a provider, only checks that the environment
 * variables a selected provider would need are actually present. This is
 * the concrete mechanism behind "do NOT activate live providers unless
 * credentials exist": `getLLMProvider()` itself doesn't validate anything
 * beyond routing (a `new AnthropicProvider()` succeeds even with no API
 * key — the key is only checked inside `.generate()`, at call time). This
 * function lets a deployment (or a staff diagnostics page, or a CI
 * pre-deploy check) ask "is this actually ready?" before any real
 * customer turn would hit the missing-key error path.
 */
export type LLMProviderConfigStatus = {
  selectedProvider: string | null;
  configured: boolean;
  missingEnvVars: string[];
  detail: string;
};

const REQUIRED_ENV_VARS_BY_PROVIDER: Record<string, string[]> = {
  ANTHROPIC: ["ANTHROPIC_API_KEY"],
  OPENAI: ["OPENAI_API_KEY"],
  MOCK: [],
};

export function validateLLMProviderConfig(): LLMProviderConfigStatus {
  const selected = process.env.LLM_PROVIDER;

  if (!selected || selected === "NONE") {
    return {
      selectedProvider: null,
      configured: true,
      missingEnvVars: [],
      detail: "No LLM_PROVIDER is set — deterministic Repository-First fallback is the entire behavior. This is a valid, safe production state, not a misconfiguration.",
    };
  }

  const required = REQUIRED_ENV_VARS_BY_PROVIDER[selected];
  if (!required) {
    return {
      selectedProvider: selected,
      configured: false,
      missingEnvVars: [],
      detail: `LLM_PROVIDER="${selected}" is not a recognized provider — getLLMProvider() will throw at call time.`,
    };
  }

  const missing = required.filter((key) => !process.env[key]);
  return {
    selectedProvider: selected,
    configured: missing.length === 0,
    missingEnvVars: missing,
    detail: missing.length === 0
      ? `LLM_PROVIDER="${selected}" is fully configured — all required environment variables are present. NOTE: this confirms configuration only, never that a live network call has been made or verified — see LLM_INTEGRATION_REPORT.md/PRODUCTION_INTEGRATION_REPORT.md.`
      : `LLM_PROVIDER="${selected}" is selected but missing required environment variable(s): ${missing.join(", ")}. Any real turn would fail at the provider's own error path and fall back to the deterministic composer (see response-assembly-runtime.ts) — safe, but not what was intended if live generation was expected.`,
  };
}
