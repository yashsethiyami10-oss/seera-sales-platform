import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { listOperationsQueue } from "@/actions/operations";

/**
 * Milestone 5 — Operations Foundation. Two buckets, both a filtered read
 * over BusinessOrder (no new table) — Pending (CONFIRMED) and Processing.
 * Same shell/table pattern every other OS list page already uses.
 */
export default async function OperationsQueuePage() {
  const result = await listOperationsQueue();

  if (!result.success) {
    return (
      <Workspace>
        <PageHeader title="Operations Queue" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
      </Workspace>
    );
  }

  const { pending, processing } = result.data;

  const table = (rows: typeof pending, showWarehouse: boolean) => (
    <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Order #", "Customer", "Total", showWarehouse ? "Warehouse" : "", "Created", "Actions"].filter(Boolean).map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Nothing here.</td></tr>
          ) : (
            rows.map((o) => (
              <tr key={o.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>#{o.orderNumber}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{o.customer.name}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{o.grandTotal.toLocaleString("en-IN")}</td>
                {showWarehouse && <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{o.warehouse?.name ?? "—"}</td>}
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-3">
                  <Link href={`/os/orders/business/${o.id}`} className="muv-os-interactive flex w-fit items-center gap-1 px-2 py-1 text-xs" style={{ color: "var(--lavender)" }}>
                    Open <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <Workspace>
      <PageHeader title="Operations Queue" description={`${pending.length} pending · ${processing.length} processing`} />
      <div className="px-6 pb-10 space-y-6">
        <section>
          <SectionHeader title="Pending Orders" description="Confirmed business orders awaiting inventory check" />
          <div className="mt-3">{table(pending, false)}</div>
        </section>
        <section>
          <SectionHeader title="Processing Orders" description="Stock reserved, warehouse assigned" />
          <div className="mt-3">{table(processing, true)}</div>
        </section>
      </div>
    </Workspace>
  );
}
