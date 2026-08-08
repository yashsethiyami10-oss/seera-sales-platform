import { AnthropicAdapter } from "./anthropic-adapter";
import { OpenAIAdapter } from "./openai-adapter";
import { GeminiAdapter } from "./gemini-adapter";
import type { GatewayProviderAdapter } from "./types";

export * from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 2) — the one switch point. Same
 * pattern this codebase already uses for `lib/shipping/index.ts` and
 * `lib/messaging/index.ts`: one env var picks the active provider, every
 * caller goes through `getGatewayProviderAdapter()`, nothing ever
 * `new Anthropic Adapter()`s directly, and no `if (provider === "...")`
 * branch exists anywhere outside this file.
 *
 * `GATEWAY_LLM_PROVIDER` is deliberately a separate env var from the
 * existing `LLM_PROVIDER` (Stage 6E, `lib/ai/index.ts`) — that variable
 * belongs to the separate, flag-gated runtime pipeline this Gateway must
 * not depend on or be confused with. Default (unset/"NONE") is `null`: no
 * provider is invoked, and the Gateway's current behavior (delegating to
 * the unchanged Experience Orchestrator) is completely unaffected — this
 * is the concrete mechanism behind "zero behaviour changes until a real
 * provider is enabled."
 */
export function getGatewayProviderAdapter(): GatewayProviderAdapter | null {
  const provider = process.env.GATEWAY_LLM_PROVIDER;
  switch (provider) {
    case "ANTHROPIC":
      return new AnthropicAdapter();
    case "OPENAI":
      return new OpenAIAdapter();
    case "GEMINI":
      return new GeminiAdapter();
    case undefined:
    case "":
    case "NONE":
      return null;
    default:
      throw new Error(`Unknown GATEWAY_LLM_PROVIDER: ${provider}`);
  }
}

export type GatewayProviderConfigStatus = {
  selectedProvider: string | null;
  configured: boolean;
  implemented: boolean;
  detail: string;
};

const IMPLEMENTED_PROVIDERS = new Set(["ANTHROPIC"]);

/** Real, deterministic, zero-network-call check — never calls a
 * provider, only reports selection/config/implementation status. Mirrors
 * `lib/ai/index.ts`'s `validateLLMProviderConfig()` for the same reason:
 * a staff diagnostics surface (or a future Module 9 health check) needs to
 * ask "is this actually ready?" without ever risking a real API call. */
export function getGatewayProviderConfigStatus(): GatewayProviderConfigStatus {
  const selected = process.env.GATEWAY_LLM_PROVIDER;

  if (!selected || selected === "NONE") {
    return {
      selectedProvider: null,
      configured: true,
      implemented: true,
      detail: "No GATEWAY_LLM_PROVIDER is set — the Gateway delegates to the existing Experience Orchestrator unchanged. This is the default, valid production state.",
    };
  }

  let adapter: GatewayProviderAdapter;
  try {
    adapter = getGatewayProviderAdapter()!;
  } catch {
    return {
      selectedProvider: selected,
      configured: false,
      implemented: false,
      detail: `GATEWAY_LLM_PROVIDER="${selected}" is not a recognized provider.`,
    };
  }

  const implemented = IMPLEMENTED_PROVIDERS.has(selected);
  const configured = adapter.isConfigured();
  return {
    selectedProvider: selected,
    configured,
    implemented,
    detail: !implemented
      ? `GATEWAY_LLM_PROVIDER="${selected}" is currently a stub adapter (not yet implemented) — see lib/gateway/providers/${selected.toLowerCase()}-adapter.ts.`
      : configured
        ? `GATEWAY_LLM_PROVIDER="${selected}" is implemented and its required credentials are present. This confirms configuration only, never a verified live call.`
        : `GATEWAY_LLM_PROVIDER="${selected}" is implemented but missing its required API key — calls will fail with a NOT_CONFIGURED error rather than silently falling back.`,
  };
}
