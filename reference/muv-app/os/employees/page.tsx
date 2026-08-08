import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listEmployees } from "@/actions/employees";
import { EmployeeSearch } from "@/components/os-employees/EmployeeSearch";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const result = await listEmployees({ q: params.q || undefined, page, pageSize: 20 });

  if (!result.success) {
    return (
      <Workspace>
        <PageHeader title="Employees" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
      </Workspace>
    );
  }

  const { items, total } = result.data;

  return (
    <Workspace>
      <PageHeader title="Employees" description={`${total} employee${total === 1 ? "" : "s"}`} />
      <div className="px-6 space-y-4">
        <EmployeeSearch />
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Name", "Department", "Designation", "Sales Role", "Reports To", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No employees found.</td></tr>
              ) : (
                items.map((e) => (
                  <tr key={e.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/os/employees/${e.id}`} className="muv-os-interactive px-1 -mx-1" style={{ color: "var(--lavender)" }}>{e.name ?? e.email}</Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.department?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.designation ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.salesRole?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.reportingManager?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: e.active ? "rgba(var(--lavender-rgb),0.12)" : "rgba(239,68,68,0.12)", color: e.active ? "var(--lavender)" : "#ef4444" }}>
                        {e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
