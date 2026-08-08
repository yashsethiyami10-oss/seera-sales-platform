import Link from "next/link";
import { MetricCard } from "@/components/os-sales/MetricCard";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getUnifiedOrderSummaryCounts } from "@/actions/order-mgmt";

/**
 * Milestone 4 — Order Management OS. A self-contained async Server
 * Component, dropped into Founder/Manager/Officer dashboard views without
 * touching their existing data-fetching pipeline (app/os/sales/page.tsx's
 * own Promise.all) — "lightweight order widgets only if they fit cleanly
 * within scope," per the milestone brief. Degrades to nothing (not an
 * error) if the caller lacks order_mgmt.view, matching every other
 * permission-gated widget's behavior in this codebase.
 */
export async function OrderSummaryWidget() {
  const result = await getUnifiedOrderSummaryCounts();
  if (!result.success) return null;
  const { directTotal, institutionalTotal, directOpen, institutionalOpen } = result.data;

  return (
    <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
      <SectionHeader title="Orders" actions={<Link href="/os/orders" className="text-xs" style={{ color: "var(--lavender)" }}>Open Order Management →</Link>} />
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Direct Orders" value={directTotal} sub={`${directOpen} open`} />
        <MetricCard label="Business Orders" value={institutionalTotal} sub={`${institutionalOpen} open`} />
      </div>
    </section>
  );
}
