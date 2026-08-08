import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { getSalesCalendar } from "@/lib/opportunity/calendar";

export default async function SalesCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAnyPermission(PERMISSIONS.OPPORTUNITY_TASKS_MANAGE, PERMISSIONS.OPPORTUNITY_ACTIVITIES_MANAGE);
  const p = await searchParams;
  const from = p.from ? new Date(p.from) : new Date(new Date().setHours(0,0,0,0));
  const to = p.to ? new Date(p.to) : new Date(from.getTime() + 30 * 86400000);
  const calendar = await getSalesCalendar({ from, to, ownerId: p.owner, territoryId: p.territory, opportunityId: p.opportunity, customerId: p.customer, taskTypeCode: p.taskType });
  return <section className="space-y-6 text-white"><header><h1 className="text-3xl font-semibold">Unified Sales Calendar</h1><p className="text-sm text-zinc-400">Day, week, month and agenda data from existing tasks, activities and expected close dates—no duplicate storage.</p></header>
    <form className="flex gap-3"><input type="date" name="from" defaultValue={from.toISOString().slice(0,10)} className="rounded-xl bg-zinc-900 p-3"/><input type="date" name="to" defaultValue={to.toISOString().slice(0,10)} className="rounded-xl bg-zinc-900 p-3"/><button className="rounded-xl bg-amber-400 px-4 text-black">Apply</button></form>
    <div className="grid gap-4 md:grid-cols-3">{[["Activities", calendar.activities],["Tasks",calendar.tasks],["Expected Closes",calendar.expectedCloses]].map(([label,items])=><article key={label as string} className="rounded-2xl border border-white/10 p-5"><h2>{label as string}</h2><p className="mt-3 text-3xl">{(items as unknown[]).length}</p></article>)}</div>
  </section>;
}
