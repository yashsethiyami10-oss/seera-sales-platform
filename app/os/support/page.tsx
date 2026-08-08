import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getFounderSupportDashboard } from "@/actions/support";

const TILES = [
  { href: "/os/support/tickets", label: "Tickets" },
  { href: "/os/support/escalations", label: "Escalations" },
  { href: "/os/support/feedback", label: "Feedback, CSAT & NPS" },
  { href: "/os/support/knowledge-base", label: "Knowledge Base" },
  { href: "/os/support/faq", label: "FAQ" },
  { href: "/os/support/templates", label: "Resolution Templates" },
  { href: "/os/support/reports", label: "Reports" },
  { href: "/os/support/configuration", label: "Configuration" },
];

/** Milestone 9 — Customer Support. Founder Dashboard: every tile reuses
 * Part 3D's own FounderAlert/FounderWidgetDefinition data model — no
 * parallel founder-alerting mechanism. */
export default async function SupportDashboardPage() {
  const dashboardResult = await getFounderSupportDashboard();

  return (
    <Workspace>
      <PageHeader title="Customer Support" description="The Customer Care Operating System of MUV" />
      <div className="px-6 pb-10 space-y-6">
        {!dashboardResult.success && (
          <p className="text-sm" style={{ color: "#ef4444" }}>{dashboardResult.error.message}</p>
        )}
        {dashboardResult.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ["Open Tickets", dashboardResult.data.openTickets],
              ["Critical Tickets", dashboardResult.data.criticalTickets],
              ["CSAT (avg)", dashboardResult.data.csat.average !== null ? `${dashboardResult.data.csat.average}/5` : "—"],
              ["CSAT Responses", dashboardResult.data.csat.count],
              ["Reopen Rate", `${dashboardResult.data.reopenRate}%`],
              ["Products Returned", dashboardResult.data.mostReturnedProductsCount],
            ] as const).map(([label, value]) => (
              <div key={label} className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
                <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{label}</p>
                <p className="text-xl font-semibold mt-1" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TILES.map((t) => (
            <Link key={t.href} href={t.href} className="muv-os-card muv-os-interactive rounded-2xl p-4 text-sm font-medium" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </Workspace>
  );
}
