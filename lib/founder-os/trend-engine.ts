import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { getRevenueTrend, resolveDateRange, type DateRange } from "@/lib/analytics";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 2 — Trend Engine.
 * The only real per-day number this ever uses is `lib/analytics.ts`'s own
 * `getRevenueTrend(range)` (frozen Phase 15, called unmodified, one real
 * database query per call) — every coarser granularity (weekly, monthly,
 * quarterly, yearly) is a bucketed re-aggregation of that same real daily
 * series in application code, not a second query path or a duplicated
 * revenue calculation.
 */

export type TrendGranularity = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

function bucketKey(date: Date, granularity: TrendGranularity): string {
  switch (granularity) {
    case "DAILY": return date.toISOString().slice(0, 10);
    case "WEEKLY": {
      // ISO week start (Monday), as YYYY-MM-DD of that Monday.
      const d = new Date(date);
      const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
      d.setUTCDate(d.getUTCDate() - day);
      return d.toISOString().slice(0, 10);
    }
    case "MONTHLY": return date.toISOString().slice(0, 7);
    case "QUARTERLY": {
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      return `${date.getUTCFullYear()}-Q${quarter}`;
    }
    case "YEARLY": return String(date.getUTCFullYear());
    case "CUSTOM": return date.toISOString().slice(0, 10);
  }
}

function defaultRangeFor(granularity: TrendGranularity): DateRange {
  switch (granularity) {
    case "DAILY": return resolveDateRange("7d");
    case "WEEKLY": return resolveDateRange("90d");
    case "MONTHLY": return resolveDateRange("ytd");
    case "QUARTERLY": return resolveDateRange("all");
    case "YEARLY": return resolveDateRange("all");
    case "CUSTOM": return resolveDateRange("30d");
  }
}

export async function getRevenueTrendSeries(granularity: TrendGranularity, customRange?: DateRange) {
  await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const range = granularity === "CUSTOM" && customRange ? customRange : defaultRangeFor(granularity);
  const daily = await getRevenueTrend(range);

  if (granularity === "DAILY" || granularity === "CUSTOM") {
    return { granularity, range, points: daily.map((d) => ({ bucket: d.date, revenue: d.revenue })) };
  }

  const byBucket = new Map<string, number>();
  for (const day of daily) {
    const key = bucketKey(new Date(`${day.date}T00:00:00.000Z`), granularity);
    byBucket.set(key, (byBucket.get(key) ?? 0) + day.revenue);
  }
  const points = [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, revenue]) => ({ bucket, revenue }));
  return { granularity, range, points };
}
