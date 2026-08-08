import type { MemoryItem } from "@/lib/experience/types";
import type { ContextWindow } from "./types";

/**
 * MUV AI Gateway — Phase 5.5, Context Builder / Window Management /
 * Multi-turn Context.
 *
 * Pure function over `MemoryItem[]` — the exact same array
 * `ExperienceSession.memoryItems` already stores (capped at 20 by
 * `experience-orchestrator.ts`'s own `MAX_SESSION_MEMORY_ITEMS`). This
 * does not change how that array is built or persisted (that logic
 * stays inside the frozen Experience Orchestrator); it only prepares a
 * bounded, ordered slice of it for a future consumer (e.g. whichever
 * module eventually builds a real provider prompt) — never a second,
 * competing memory store.
 */
const DEFAULT_MAX_ITEMS = 12;
const DEFAULT_MAX_CHARS = 4000;

export function buildContextWindow(memoryItems: MemoryItem[], opts: { maxItems?: number; maxChars?: number } = {}): ContextWindow {
  const maxItems = Math.max(1, opts.maxItems ?? DEFAULT_MAX_ITEMS);
  const maxChars = Math.max(1, opts.maxChars ?? DEFAULT_MAX_CHARS);

  // Most-recent-first truncation by count, then by character budget —
  // never drop from the middle (that would silently break turn
  // adjacency), only ever trim from the oldest end.
  const recentByCount = memoryItems.slice(-maxItems);
  const truncatedByCount = recentByCount.length < memoryItems.length;

  let totalChars = 0;
  const windowed: MemoryItem[] = [];
  for (let i = recentByCount.length - 1; i >= 0; i--) {
    const item = recentByCount[i]!;
    const nextTotal = totalChars + item.content.length;
    if (windowed.length > 0 && nextTotal > maxChars) break;
    windowed.unshift(item);
    totalChars = nextTotal;
  }

  return {
    items: windowed,
    truncated: truncatedByCount || windowed.length < recentByCount.length,
    totalChars,
  };
}
