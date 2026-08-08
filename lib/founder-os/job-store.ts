import type { EnterpriseTx } from "@/lib/enterprise/context";

/**
 * Part 3D — shared background-job queries, factored out of
 * `alert-engine.ts` during Stage 3 so Enterprise Monitoring reuses the
 * exact same "job" query surface the Alert Engine's own
 * `BACKGROUND_JOB_FAILED` detector already reads, rather than a second
 * implementation. All three functions use the same `JOB:` operationType
 * prefix convention Part 3A's own `findStalePhase2Jobs`
 * (`lib/enterprise-phase2/jobs.ts`, frozen) established. Read-only.
 */

export function listFailedJobs(tx: EnterpriseTx, organizationKey: string, take = 50) {
  return tx.phase2Operation.findMany({
    where: { organizationKey, status: "FAILED", operationType: { startsWith: "JOB:" } },
    orderBy: { updatedAt: "desc" }, take,
  });
}

export function listActiveJobs(tx: EnterpriseTx, organizationKey: string, take = 100) {
  return tx.phase2Operation.findMany({
    where: { organizationKey, status: { in: ["PENDING", "RUNNING"] }, operationType: { startsWith: "JOB:" } },
    orderBy: { createdAt: "asc" }, take,
  });
}

export function listRecentCompletedJobs(tx: EnterpriseTx, organizationKey: string, since: Date, take = 100) {
  return tx.phase2Operation.findMany({
    where: { organizationKey, status: "COMPLETED", operationType: { startsWith: "JOB:" }, completedAt: { gte: since } },
    orderBy: { completedAt: "desc" }, take,
  });
}
