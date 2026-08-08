import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";
import { listActiveJobs, listFailedJobs, listRecentCompletedJobs } from "./job-store";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 3 — Enterprise
 * Monitoring. Background Jobs / Queues / Failures all reuse
 * `job-store.ts` (the same queries the Alert Engine's own
 * `BACKGROUND_JOB_FAILED` detector reads). "Health" is a real, simple,
 * documented ratio — completed vs. (completed + failed) over the lookback
 * window — not a fabricated score.
 *
 * "Scheduled Tasks" is honestly reported as not applicable: this
 * codebase has no scheduler/cron anywhere (Part 3C's own two background
 * jobs, and every Founder OS detector, are directly-callable functions
 * only — documented as a known limitation since Stage 1). Rather than
 * show a fake empty "0 scheduled tasks configured" as if scheduling
 * exists and is merely unused, this reports the actual state plainly.
 */

const HEALTH_LOOKBACK_DAYS = 7;

export async function getEnterpriseMonitoring() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const now = new Date();
  const since = new Date(now.getTime() - HEALTH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Stage 5 performance review: these three independent reads previously
  // each opened their own Serializable transaction (three BEGIN/COMMIT
  // round-trips for what's fundamentally one consistent read). Batched
  // into a single transaction — same three queries, same isolation
  // guarantees, one round-trip instead of three.
  const [active, failed, recentCompleted] = await enterpriseTransaction((tx) => Promise.all([
    listActiveJobs(tx, principal.organizationKey),
    listFailedJobs(tx, principal.organizationKey),
    listRecentCompletedJobs(tx, principal.organizationKey, since),
  ]));

  const recentFailedCount = failed.filter((j) => j.updatedAt >= since).length;
  const totalRecentAttempts = recentCompleted.length + recentFailedCount;
  const successRatePercent = totalRecentAttempts > 0 ? Math.round((recentCompleted.length / totalRecentAttempts) * 100) : null;
  const health: "GOOD" | "WATCH" | "AT_RISK" =
    successRatePercent === null ? "GOOD" : successRatePercent >= 95 ? "GOOD" : successRatePercent >= 80 ? "WATCH" : "AT_RISK";

  return {
    asOf: now,
    backgroundJobs: {
      pendingOrRunning: active,
      recentlyFailed: failed,
      recentlyCompleted: recentCompleted,
      health,
      successRatePercent,
      lookbackDays: HEALTH_LOOKBACK_DAYS,
    },
    queues: { pending: active.filter((j) => j.status === "PENDING"), running: active.filter((j) => j.status === "RUNNING") },
    scheduledTasks: { supported: false, tasks: [], note: "No scheduler/cron exists in this codebase yet — every background job is directly-callable only (Stage 1's own disclosed limitation)." },
    failures: failed,
  };
}
