import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getSupportTicketDetail, getCustomerUnifiedTimeline, listDepartments } from "@/actions/support";
import { TicketDetailManager } from "@/components/os-support/TicketDetailManager";

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketResult = await getSupportTicketDetail(id);
  if (!ticketResult.success) {
    if (ticketResult.error.code === "NOT_FOUND") notFound();
    return (
      <Workspace>
        <PageHeader title="Ticket" />
        <div className="px-6 pb-10"><p className="text-sm" style={{ color: "#ef4444" }}>{ticketResult.error.message}</p></div>
      </Workspace>
    );
  }
  const ticket = ticketResult.data;
  const [timelineResult, departmentsResult] = await Promise.all([
    getCustomerUnifiedTimeline(ticket.customerId),
    listDepartments(),
  ]);

  return (
    <Workspace>
      <PageHeader title={`Ticket ${ticket.ticketNumber}`} description={ticket.subject} />
      <div className="px-6 pb-10">
        <TicketDetailManager
          ticket={ticket}
          timeline={timelineResult.success ? timelineResult.data : []}
          departments={departmentsResult.success ? departmentsResult.data.map((d) => ({ id: d.id, name: d.name })) : []}
        />
      </div>
    </Workspace>
  );
}
