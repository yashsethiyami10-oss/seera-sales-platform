import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getEmployeeDetail, listEmployees } from "@/actions/employees";
import { listDepartments } from "@/actions/master-data";
import { listTerritories } from "@/actions/territories";
import { EmployeeEditForm } from "@/components/os-employees/EmployeeEditForm";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, departments, territories, allEmployees] = await Promise.all([
    getEmployeeDetail(id),
    listDepartments({ activeOnly: true }),
    listTerritories({ activeOnly: true }),
    listEmployees({ pageSize: 100 }),
  ]);

  if (!detail.success) notFound();
  const employee = detail.data;

  return (
    <Workspace>
      <PageHeader
        title={employee.name ?? employee.email}
        description={employee.email}
        actions={<Link href="/os/employees" className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}><ArrowLeft size={14} /> Back</Link>}
      />
      <div className="px-6 pb-10">
        <EmployeeEditForm
          employee={{
            id: employee.id,
            departmentId: employee.department?.id ?? null,
            designation: employee.designation,
            territoryId: employee.territory?.id ?? null,
            reportingManagerId: employee.reportingManager?.id ?? null,
            active: employee.active,
          }}
          departments={departments.success ? departments.data : []}
          territories={territories.success ? territories.data : []}
          managers={allEmployees.success ? allEmployees.data.items.map((e) => ({ id: e.id, name: e.name ?? e.email })) : []}
        />
        {employee.directReports.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-medium mb-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Direct Reports</h3>
            <ul className="text-sm space-y-1">
              {employee.directReports.map((r) => (
                <li key={r.id}><Link href={`/os/employees/${r.id}`} className="hover:underline" style={{ color: "var(--lavender)" }}>{r.name ?? r.email}</Link></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Workspace>
  );
}
