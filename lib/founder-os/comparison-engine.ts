import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getGrowthComparison, type DateRange } from "@/lib/analytics";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Comparison
 * Engine. Every comparison here is the same real calculation —
 * `lib/analytics.ts`'s own `getGrowthComparison(range)` (frozen Phase 15,
 * called unmodified) — applied to a differently-sized `range`. No
 * comparison math is reimplemented; only the range each named comparison
 * means is computed here.
 */

export type ComparisonKey = "TODAY_VS_YESTERDAY" | "WEEK_VS_WEEK" | "MONTH_VS_MONTH" | "QUARTER_VS_QUARTER" | "YEAR_VS_YEAR";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function rangeFor(key: ComparisonKey): DateRange {
  const now = new Date();
  switch (key) {
    case "TODAY_VS_YESTERDAY": {
      const from = startOfDay(now);
      return { from, to: now };
    }
    case "WEEK_VS_WEEK": {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      return { from: startOfDay(from), to: now };
    }
    case "MONTH_VS_MONTH": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
    }
    case "QUARTER_VS_QUARTER": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { from, to: now };
    }
    case "YEAR_VS_YEAR": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to: now };
    }
  }
}

export async function getComparison(key: ComparisonKey) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const range = rangeFor(key);
  const result = await getGrowthComparison(range);
  return { key, range, ...result };
}

export async function getAllComparisons() {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const keys: ComparisonKey[] = ["TODAY_VS_YESTERDAY", "WEEK_VS_WEEK", "MONTH_VS_MONTH", "QUARTER_VS_QUARTER", "YEAR_VS_YEAR"];
  const results = await Promise.all(keys.map(async (key) => {
    const range = rangeFor(key);
    const result = await getGrowthComparison(range);
    return { key, range, ...result };
  }));
  return results;
}
