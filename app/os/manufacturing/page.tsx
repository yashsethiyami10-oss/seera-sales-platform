import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getManufacturingSummary } from "@/actions/manufacturing";

const TILES = [
  { href: "/os/manufacturing/suppliers", label: "Suppliers" },
  { href: "/os/manufacturing/procurement", label: "Procurement" },
  { href: "/os/manufacturing/formulas", label: "Formula & BOM" },
  { href: "/os/manufacturing/production", label: "Production" },
  { href: "/os/manufacturing/quality", label: "Quality Control" },
];

/**
 * Milestone 7 — Manufacturing (Including Procurement). Entry point for the
 * new MUV-OS-shell surface over the frozen Enterprise v3 Phase 1 domain —
 * every number/link below reads through actions/manufacturing.ts, which
 * wraps lib/enterprise/* Business Services rather than duplicating them.
 */
export default async function ManufacturingDashboardPage() {
  const result = await getManufacturingSummary();
  const summary = result.success ? result.data : null;

  return (
    <Workspace>
      <PageHeader title="Manufacturing" description="Procurement, Formula/BOM, Production, Batches, Quality, Finished Goods" />
      <div className="px-6 pb-10 space-y-6">
        {!result.success && (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
        )}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {([
              ["Open Requisitions", summary.openRequisitions],
              ["Issued Purchase Orders", summary.openOrders],
              ["Active Production Orders", summary.activeProductionOrders],
              ["Pending Inspections", summary.pendingInspections],
              ["Released Batches Awaiting Transfer", summary.releasedBatchesAwaitingTransfer],
            ] as const).map(([label, value]) => (
              <div key={label} className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
                <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{label}</p>
                <p className="text-2xl font-semibold mt-1" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TILES.map((t) => (
            <Link key={t.href} href={t.href} className="muv-os-card muv-os-interactive rounded-2xl p-5 text-sm font-medium" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </Workspace>
  );
}
