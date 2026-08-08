import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listSupportTickets, listDepartments } from "@/actions/support";
import { TicketsManager } from "@/components/os-support/TicketsManager";

export default async function SupportTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string; category?: string; q?: string }> }) {
  const { status, priority, category, q } = await searchParams;
  const [ticketsResult, departmentsResult, customers] = await Promise.all([
    listSupportTickets({ status, priority, category, q, pageSize: 50 }),
    listDepartments(),
    prisma.customer.findMany({ where: { active: true }, select: { id: true, name: true }, take: 200, orderBy: { name: "asc" } }),
  ]);

  return (
    <Workspace>
      <PageHeader title="Support Tickets" description="Every customer-service interaction, one queue" />
      <div className="px-6 pb-10">
        {ticketsResult.success && departmentsResult.success ? (
          <TicketsManager
            tickets={ticketsResult.data.items.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, category: t.category, status: t.status, priority: t.priority, channel: t.channel, slaBreached: t.slaBreached, departmentName: t.department.name }))}
            departments={departmentsResult.data.map((d) => ({ id: d.id, name: d.name }))}
            customers={customers}
            filters={{ status, priority, category, q }}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!ticketsResult.success ? ticketsResult.error.message : !departmentsResult.success ? departmentsResult.error.message : ""}</p>
        )}
      </div>
    </Workspace>
  );
}
