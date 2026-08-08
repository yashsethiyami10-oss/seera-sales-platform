import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getVisitDetail } from "@/actions/inst-visits";
import { CheckOutForm } from "@/components/os-sales/visits/CheckOutForm";
import { SurveyForm } from "@/components/os-sales/visits/SurveyForm";
import { ConsumptionEstimateView } from "@/components/os-sales/visits/ConsumptionEstimateView";

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getVisitDetail(id);
  if (!result.success) notFound();
  const visit = result.data;

  return (
    <Workspace>
      <PageHeader
        title={visit.customer?.name ?? visit.lead?.organizationName ?? "Visit"}
        description={`${new Date(visit.visitDate).toLocaleString("en-IN")} · Officer: ${visit.officer.name}`}
      />
      <div className="px-6 pb-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {!visit.checkOutAt ? (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Check Out" description="Record what happened during this visit." />
              <div className="mt-3"><CheckOutForm visitId={visit.id} /></div>
            </section>
          ) : (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Visit Summary" />
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Outcome</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{visit.outcome ?? "—"}</dd></div>
                <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Decision Maker</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{visit.decisionMaker ?? "—"}</dd></div>
                <div className="col-span-2"><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Meeting Notes</dt><dd style={{ color: "rgba(var(--text-rgb),0.8)" }}>{visit.meetingNotes ?? "—"}</dd></div>
                <div className="col-span-2"><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Requirements</dt><dd style={{ color: "rgba(var(--text-rgb),0.8)" }}>{visit.requirements ?? "—"}</dd></div>
                {visit.competitorProducts.length > 0 && <div className="col-span-2"><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Competitor Products</dt><dd style={{ color: "rgba(var(--text-rgb),0.8)" }}>{visit.competitorProducts.join(", ")}</dd></div>}
                {visit.nextFollowUpDate && <div><dt style={{ color: "rgba(var(--text-rgb),0.5)" }}>Next Follow-up</dt><dd style={{ color: "rgba(var(--text-rgb),0.85)" }}>{new Date(visit.nextFollowUpDate).toLocaleDateString("en-IN")}</dd></div>}
              </dl>
              {visit.photoUrls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {visit.photoUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs muv-os-interactive px-2 py-1" style={{ color: "var(--lavender)" }}>Photo</a>)}
                </div>
              )}
            </section>
          )}

          {visit.checkOutAt && !visit.survey && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Customer Survey" description="Module 5 — capture business details to unlock the AI consumption estimate." />
              <div className="mt-3"><SurveyForm visitId={visit.id} /></div>
            </section>
          )}

          {visit.survey?.consumptionEstimate && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              {/* Prisma's Json columns type as JsonValue — this action's own consumption-engine.ts is the single producer of this shape, so the cast is safe. */}
              <ConsumptionEstimateView estimate={visit.survey.consumptionEstimate as unknown as Parameters<typeof ConsumptionEstimateView>[0]["estimate"]} />
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Context" />
            <div className="mt-3 text-sm space-y-2">
              {visit.customer && <Link href={`/os/customers/${visit.customer.id}`} className="muv-os-interactive block" style={{ color: "var(--lavender)" }}>{visit.customer.name} — Customer Profile →</Link>}
              {visit.opportunity && <Link href={`/os/sales/opportunities/${visit.opportunity.id}`} className="muv-os-interactive block" style={{ color: "var(--lavender)" }}>{visit.opportunity.opportunityNumber} — Opportunity →</Link>}
              {visit.lead && <Link href={`/os/sales/leads/${visit.lead.id}`} className="muv-os-interactive block" style={{ color: "var(--lavender)" }}>{visit.lead.leadNumber} — Lead →</Link>}
              <p style={{ color: "rgba(var(--text-rgb),0.5)" }}>Check-in: {visit.checkInAt ? new Date(visit.checkInAt).toLocaleTimeString("en-IN") : "—"}</p>
              <p style={{ color: "rgba(var(--text-rgb),0.5)" }}>Check-out: {visit.checkOutAt ? new Date(visit.checkOutAt).toLocaleTimeString("en-IN") : "—"}</p>
              {visit.checkInLat && <p style={{ color: "rgba(var(--text-rgb),0.4)" }} className="text-xs">GPS: {visit.checkInLat}, {visit.checkInLng}</p>}
            </div>
          </section>
        </div>
      </div>
    </Workspace>
  );
}
