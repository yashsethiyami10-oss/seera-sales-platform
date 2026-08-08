import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getSalesPrincipal } from "@/lib/sales/authorization";
import { getDayView } from "@/actions/inst-planner";
import { PlannerNotesForm, EndOfDayForm, RoutePlanForm } from "@/components/os-sales/planner/PlannerForms";

/** Module 11 — Daily Planner. Morning → Today's Route → Visits → Tasks → Notes → End of Day Summary. */
export default async function PlannerPage() {
  const principal = await getSalesPrincipal();
  const today = new Date();
  const planDate = today.toISOString().slice(0, 10);
  const result = await getDayView(principal.id, today);

  if (!result.success) {
    return <Workspace><PageHeader title="Daily Planner" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { plan, route, visits, tasks, followUps } = result.data;

  return (
    <Workspace>
      <PageHeader title="Daily Planner" description={today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
      <div className="px-6 pb-10 grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Morning Notes" />
            <div className="mt-3"><PlannerNotesForm planDate={planDate} initialNotes={plan?.notes ?? null} /></div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Today's Route" description={route ? `${route.plannedDistanceKm ?? "—"} km planned` : "Not planned yet"} />
            <div className="mt-3"><RoutePlanForm planDate={planDate} /></div>
            {route && Array.isArray(route.plannedStops) && (route.plannedStops as { label: string }[]).length > 0 && (
              <ul className="mt-2 text-sm space-y-1">{(route.plannedStops as { label: string }[]).map((s, i) => <li key={i} style={{ color: "rgba(var(--text-rgb),0.7)" }}>{i + 1}. {s.label}</li>)}</ul>
            )}
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="End of Day Summary" />
            <div className="mt-3"><EndOfDayForm planDate={planDate} initialSummary={plan?.endOfDaySummary ?? null} /></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Visits" />
            <div className="mt-3 space-y-1.5">
              {visits.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No visits today.</p>}
              {visits.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{v.customer?.name ?? v.lead?.organizationName}</span>
                  <span style={{ color: v.checkOutAt ? "rgba(var(--text-rgb),0.5)" : "#f59e0b" }}>{v.checkOutAt ? "Done" : "Pending"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Tasks" />
            <div className="mt-3 space-y-1.5">
              {tasks.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No tasks due today.</p>}
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{t.title}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{t.status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Follow-ups" />
            <div className="mt-3 space-y-1.5">
              {followUps.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No follow-ups due today.</p>}
              {followUps.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-sm">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{f.customer?.name ?? "—"} — {f.type}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Workspace>
  );
}
