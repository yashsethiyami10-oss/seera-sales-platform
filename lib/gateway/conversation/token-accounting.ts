import type { GatewayGenerateOutput } from "@/lib/gateway/providers";
import type { TokenUsage } from "./types";

/**
 * MUV AI Gateway — Phase 5.5, Token Accounting.
 *
 * Pure accumulator over `GatewayGenerateOutput["usage"]` — the exact
 * field the Provider Adapter contract (Module 2, unmodified) already
 * defines. Nothing here persists anything or adds a column to any
 * table; a caller that wants durable per-session usage totals stores
 * this result wherever it stores other conversation metadata — that
 * storage decision is out of this Wave's scope (would mean touching the
 * frozen ExperienceSession model).
 */
export function accumulateTokenUsage(usages: (GatewayGenerateOutput["usage"] | undefined)[]): TokenUsage {
  let promptTokens = 0;
  let completionTokens = 0;
  for (const usage of usages) {
    promptTokens += usage?.promptTokens ?? 0;
    completionTokens += usage?.completionTokens ?? 0;
  }
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}
