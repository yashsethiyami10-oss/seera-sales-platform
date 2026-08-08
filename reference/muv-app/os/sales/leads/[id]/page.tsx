import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getLeadDetail } from "@/actions/inst-leads";
import { listCustomerTypes } from "@/actions/master-data";
import { LeadStatusControl } from "@/components/os-sales/leads/LeadStatusControl";
import { LeadConvertPanel } from "@/components/os-sales/leads/LeadConvertPanel";
import { NoteThread } from "@/components/os-sales/NoteThread";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, customerTypesResult] = await Promise.all([getLeadDetail(id), listCustomerTypes({ activeOnly: true })]);
  if (!result.success) notFound();
  const lead = result.data;

  return (
    <Workspace>
      <PageHeader
        title={lead.organizationName}
        description={`${lead.leadNumber} · ${lead.contactPerson} · ${lead.phone}`}
        actions={<LeadStatusControl leadId={lead.id} currentStatus={lead.status} />}
      />
      <div className="px-6 pb-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Lead Details" />
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Priority</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{lead.priority}</dd></div>
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Estimated Value</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{lead.estimatedValue.toLocaleString("en-IN")}</dd></div>
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Source</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{lead.leadSource?.name ?? "Unknown"}</dd></div>
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Territory</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{lead.territory?.name ?? "—"}</dd></div>
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Assigned To</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{lead.assignedTo?.name ?? "Unassigned"}</dd></div>
              <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Created By</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{lead.createdBy.name}</dd></div>
              {lead.lostReason && <div className="col-span-2"><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Lost Reason</dt><dd style={{ color: "#ef4444" }}>{lead.lostReason}</dd></div>}
            </dl>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Notes" />
            <div className="mt-3"><NoteThread entityType="LEAD" entityId={lead.id} /></div>
          </section>

          {lead.visits.length > 0 && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Visits" />
              <div className="mt-3 space-y-2">
                {lead.visits.map((v) => (
                  <Link key={v.id} href={`/os/sales/visits/${v.id}`} className="muv-os-interactive flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                    <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{new Date(v.visitDate).toLocaleDateString("en-IN")}</span>
                    <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{v.outcome ?? (v.checkOutAt ? "Completed" : "In progress")}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: lead.opportunity ? "1px solid rgba(var(--lavender-rgb),0.35)" : "1px solid var(--card-border)" }}>
            <SectionHeader title={lead.opportunity ? "Converted" : "Convert Lead"} />
            <div className="mt-3">
              <LeadConvertPanel
                leadId={lead.id}
                customerTypes={customerTypesResult.success ? customerTypesResult.data : []}
                prefill={{ organizationName: lead.organizationName, contactPerson: lead.contactPerson, phone: lead.phone, email: lead.email }}
                existingOpportunity={lead.opportunity}
              />
            </div>
          </section>

          {lead.followUps.length > 0 && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Follow-ups" />
              <div className="mt-3 space-y-1.5">
                {lead.followUps.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-sm">
                    <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{f.type}</span>
                    <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{new Date(f.dueDate).toLocaleDateString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Workspace>
  );
}
