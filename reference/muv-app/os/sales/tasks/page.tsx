import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listTasks } from "@/actions/inst-tasks";
import { TaskQuickAdd } from "@/components/os-sales/tasks/TaskQuickAdd";
import { TaskStatusToggle } from "@/components/os-sales/tasks/TaskStatusToggle";

const TYPES = ["PERSONAL", "ASSIGNED", "FOLLOWUP", "DAILY"] as const;
const TYPE_LABEL: Record<string, string> = { PERSONAL: "Personal Tasks", ASSIGNED: "Assigned Tasks", FOLLOWUP: "Follow-up Tasks", DAILY: "Daily Tasks" };

export default async function TasksPage() {
  const result = await listTasks({ page: 1, pageSize: 100 });
  if (!result.success) {
    return <Workspace><PageHeader title="Tasks" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const byType = new Map<string, typeof result.data.items>();
  for (const t of TYPES) byType.set(t, []);
  for (const task of result.data.items) byType.get(task.type)?.push(task);

  return (
    <Workspace>
      <PageHeader title="Tasks" description="Module 10 — Task Management" />
      <div className="px-6 mb-4"><div className="muv-os-card rounded-2xl p-3" style={{ border: "1px solid var(--card-border)" }}><TaskQuickAdd /></div></div>
      <div className="px-6 pb-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TYPES.map((type) => (
          <div key={type}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{TYPE_LABEL[type]} ({byType.get(type)?.length ?? 0})</h3>
            <div className="space-y-2">
              {(byType.get(type) ?? []).map((t) => (
                <div key={t.id} className="muv-os-card rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
                  <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{t.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(var(--text-rgb),0.5)" }}>{t.priority} · {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "No due date"}</p>
                  <div className="mt-2"><TaskStatusToggle id={t.id} status={t.status} /></div>
                </div>
              ))}
              {(byType.get(type) ?? []).length === 0 && <p className="text-xs px-1" style={{ color: "rgba(var(--text-rgb),0.35)" }}>None</p>}
            </div>
          </div>
        ))}
      </div>
    </Workspace>
  );
}
