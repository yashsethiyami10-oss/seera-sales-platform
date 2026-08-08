import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listAuditFindings } from "@/actions/finance";
import { AuditManager } from "@/components/os-finance/AuditManager";

export default async function AuditPage() {
  const result = await listAuditFindings({ pageSize: 50 });
  return (
    <Workspace>
      <PageHeader title="Internal Audit" description="Read-only for operational accounting records — write access is audit-specific records only" />
      <div className="px-6 pb-10">
        {result.success ? (
          <AuditManager findings={result.data.items.map((f) => ({ id: f.id, findingNumber: f.findingNumber, area: f.area, severity: f.severity, status: f.status, description: f.description, fraudRiskFlag: f.fraudRiskFlag }))} />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
