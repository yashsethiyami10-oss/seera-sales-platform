import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { listFiscalPeriods, listHolidays } from "@/actions/finance";
import { PeriodsManager } from "@/components/os-finance/PeriodsManager";

export default async function PeriodsPage() {
  const [principal, periodsResult, holidaysResult] = await Promise.all([getSalesPrincipal(), listFiscalPeriods(), listHolidays()]);
  return (
    <Workspace>
      <PageHeader title="Financial Calendar & Periods" description="Soft close, hard close, governed reopening — reuses the frozen Part 3C period engine" />
      <div className="px-6 pb-10">
        {periodsResult.success && holidaysResult.success ? (
          <PeriodsManager
            periods={periodsResult.data.map((p) => ({ id: p.id, name: p.name, status: p.status, version: p.version }))}
            holidays={holidaysResult.data.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString() }))}
            currentUserId={principal.id}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!periodsResult.success ? periodsResult.error.message : !holidaysResult.success ? holidaysResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
