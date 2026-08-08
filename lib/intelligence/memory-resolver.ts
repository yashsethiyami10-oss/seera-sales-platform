import type { CallerClearance } from "@/lib/retrieval/types";
import { layerAllowed } from "@/lib/retrieval/permissions";
import type { MemoryItem, MemoryResolution, ConfidenceLevel } from "./types";

/**
 * MUV AI — Intelligence Core (Module 6) Memory Resolver.
 *
 * "Do NOT implement long-term storage. Consume only available memory." —
 * this module never reads or writes a memory table; it only validates and
 * filters whatever `MemoryItem[]` the caller supplies (a future Module 7 /
 * chat surface owns real memory persistence). "Future Persistent Memory"
 * is represented by `MemoryItemType: "PERSISTENT"` in the type, but there
 * is no code path here that fetches it from anywhere — an empty
 * `memory: []` input is the correct, expected default today.
 */

export function resolveMemory(memory: MemoryItem[] | undefined, clearance: CallerClearance): MemoryResolution {
  const items = memory ?? [];
  const now = Date.now();
  const excludedReasons: string[] = [];
  let expiredCount = 0;
  let overLayerCount = 0;

  const valid = items.filter((item) => {
    if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
      expiredCount++;
      return false;
    }
    if (!layerAllowed(item.layer, clearance)) {
      overLayerCount++;
      return false;
    }
    return true;
  });

  if (expiredCount > 0) excludedReasons.push(`${expiredCount} item(s) excluded — expired`);
  if (overLayerCount > 0) excludedReasons.push(`${overLayerCount} item(s) excluded — exceeded caller's permission layer`);

  return {
    items: valid,
    excludedCount: expiredCount + overLayerCount,
    excludedReasons,
    overallConfidence: overallConfidenceFor(valid),
  };
}

function overallConfidenceFor(items: MemoryItem[]): ConfidenceLevel {
  if (items.length === 0) return "LOW";
  const highCount = items.filter((i) => i.confidence === "HIGH").length;
  const lowCount = items.filter((i) => i.confidence === "LOW" || !i.confidence).length;
  if (items.length >= 2 && highCount === items.length) return "HIGH";
  if (lowCount === items.length) return "LOW";
  return "MODERATE";
}
