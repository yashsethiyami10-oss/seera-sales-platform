import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireFounderOsPrincipal } from "./context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 3 — Exception
 * Center. Groups the SAME real `FounderAlert` rows the Alert Engine
 * (Stage 1), Risk Engine (Stage 2), and Decision Queue (Stage 2) already
 * write/read — by their real `sourceModule` string, via a real `groupBy`
 * query, not a hardcoded module list. Today only "FINANCE", "SYSTEM",
 * "GOVERNANCE", and "RISK_ENGINE" values are ever actually written
 * anywhere in this codebase (confirmed by reading every
 * `founderAlert.create`/`upsertAlert` call site) — CRM/Sales/Orders
 * modules correctly show zero exceptions because no detector for those
 * domains exists yet, not because of a query bug.
 */

export async function getExceptionCenter() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);

  const [grouped, activeAlerts] = await Promise.all([
    enterpriseTransaction((tx) =>
      tx.founderAlert.groupBy({
        by: ["sourceModule", "severity"],
        where: { organizationKey: principal.organizationKey, status: "ACTIVE" },
        _count: { _all: true },
      })
    ),
    enterpriseTransaction((tx) =>
      tx.founderAlert.findMany({
        where: { organizationKey: principal.organizationKey, status: "ACTIVE" },
        orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
        take: 200,
      })
    ),
  ]);

  const byModule = new Map<string, { sourceModule: string; total: number; bySeverity: Record<string, number> }>();
  for (const row of grouped) {
    const entry = byModule.get(row.sourceModule) ?? { sourceModule: row.sourceModule, total: 0, bySeverity: {} };
    entry.total += row._count._all;
    entry.bySeverity[row.severity] = (entry.bySeverity[row.severity] ?? 0) + row._count._all;
    byModule.set(row.sourceModule, entry);
  }

  return {
    asOf: new Date(),
    totalActive: activeAlerts.length,
    byModule: Array.from(byModule.values()).sort((a, b) => b.total - a.total),
    alerts: activeAlerts,
  };
}
