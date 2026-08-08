import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getOpportunityDetail } from "@/actions/inst-opportunities";
import { OpportunityStageControl } from "@/components/os-sales/opportunities/OpportunityStageControl";
import { OpportunityEditPanel } from "@/components/os-sales/opportunities/OpportunityEditPanel";
import { NoteThread } from "@/components/os-sales/NoteThread";

function toDateInput(d: Date | string | null): string | null {
  if (!d) return null;
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getOpportunityDetail(id);
  if (!result.success) notFound();
  const opp = result.data;

  return (
    <Workspace>
      <PageHeader
        title={opp.customer.businessName ?? opp.customer.name}
        description={`${opp.opportunityNumber} · Owner: ${opp.owner.name} · Territory: ${opp.territory?.name ?? "—"}`}
        actions={<OpportunityStageControl opportunityId={opp.id} currentStage={opp.stage} />}
      />
      <div className="px-6 pb-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Opportunity Details" />
            <div className="mt-3">
              <OpportunityEditPanel
                opportunityId={opp.id}
                initial={{
                  estimatedRevenue: opp.estimatedRevenue, expectedQuantity: opp.expectedQuantity, probability: opp.probability,
                  closingDate: toDateInput(opp.closingDate), risks: opp.risks, competitors: opp.competitors,
                  nextAction: opp.nextAction, nextActionDate: toDateInput(opp.nextActionDate),
                }}
              />
            </div>
          </section>

          {opp.products.length > 0 && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Products" />
              <ul className="mt-3 space-y-1.5 text-sm">
                {opp.products.map((p) => <li key={p.id} style={{ color: "rgba(var(--text-rgb),0.8)" }}>{p.product.name}{p.quantity ? ` — Qty ${p.quantity}` : ""}{p.notes ? ` (${p.notes})` : ""}</li>)}
              </ul>
            </section>
          )}

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Visits" actions={<Link href={`/os/sales/visits/new?opportunityId=${opp.id}&customerId=${opp.customerId}`} className="text-xs" style={{ color: "var(--lavender)" }}>+ Check In</Link>} />
            <div className="mt-3 space-y-2">
              {opp.visits.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No visits recorded yet.</p>}
              {opp.visits.map((v) => (
                <Link key={v.id} href={`/os/sales/visits/${v.id}`} className="muv-os-interactive flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{new Date(v.visitDate).toLocaleDateString("en-IN")}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{v.survey ? "Survey captured" : v.outcome ?? "In progress"}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Samples" actions={<Link href={`/os/sales/samples/new?opportunityId=${opp.id}&customerId=${opp.customerId}`} className="text-xs" style={{ color: "var(--lavender)" }}>+ Issue Sample</Link>} />
            <div className="mt-3 space-y-2">
              {opp.samples.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No samples issued yet.</p>}
              {opp.samples.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{s.product.name} — {s.quantity}{s.unit}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{s.trialStatus}{s.trialResult ? ` · ${s.trialResult}` : ""}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Quotations" actions={<Link href={`/os/sales/quotations/new?opportunityId=${opp.id}`} className="text-xs" style={{ color: "var(--lavender)" }}>+ New Quotation</Link>} />
            <div className="mt-3 space-y-2">
              {opp.quotations.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No quotations yet.</p>}
              {opp.quotations.map((q) => (
                <Link key={q.id} href={`/os/sales/quotations/${q.id}`} className="muv-os-interactive flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{q.quotationNumber}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{q.versions[0] ? `v${q.versions[0].versionNumber} · ${q.versions[0].status} · ₹${q.versions[0].grandTotal.toLocaleString("en-IN")}` : "Draft"}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Notes" />
            <div className="mt-3"><NoteThread entityType="OPPORTUNITY" entityId={opp.id} /></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Customer" />
            <div className="mt-3 text-sm space-y-1">
              <p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{opp.customer.name}</p>
              {opp.customer.businessName && <p style={{ color: "rgba(var(--text-rgb),0.6)" }}>{opp.customer.businessName}</p>}
              <p style={{ color: "rgba(var(--text-rgb),0.6)" }}>{opp.customer.phone}</p>
              <Link href={`/os/customers/${opp.customer.id}`} className="muv-os-interactive inline-block mt-1 text-xs" style={{ color: "var(--lavender)" }}>View Customer Profile →</Link>
            </div>
          </section>

          {opp.lead && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Originating Lead" />
              <Link href={`/os/sales/leads/${opp.lead.id}`} className="mt-2 muv-os-interactive block text-sm" style={{ color: "var(--lavender)" }}>{opp.lead.leadNumber} — {opp.lead.organizationName}</Link>
            </section>
          )}

          {opp.followUps.length > 0 && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Follow-ups" actions={<Link href={`/os/sales/followups?opportunityId=${opp.id}`} className="text-xs" style={{ color: "var(--lavender)" }}>All →</Link>} />
              <div className="mt-3 space-y-1.5">
                {opp.followUps.slice(0, 5).map((f) => (
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
