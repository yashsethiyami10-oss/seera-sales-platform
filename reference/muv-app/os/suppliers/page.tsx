import Link from "next/link";
import { Plus } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listSuppliers } from "@/actions/suppliers";

/**
 * MUV OS™ — Milestone 2, Supplier Master. Thin read UI over the existing
 * `EnterpriseVendor` system (see actions/suppliers.ts) — if
 * `ENTERPRISE_OPERATIONS_ENABLED`/`ENTERPRISE_VENDOR_ENABLED` are off
 * (seeded off by default), this correctly shows that module-disabled
 * state below rather than an empty list, since that's this codebase's own
 * existing, deliberate rollout gate — not something this milestone
 * bypasses.
 */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const result = await listSuppliers({ q: params.q, page, pageSize: 20 });

  return (
    <Workspace>
      <PageHeader
        title="Suppliers"
        description="Reuses this codebase's existing Vendor Management system"
        actions={
          <Link href="/os/suppliers/new" className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
            <Plus size={14} /> New Supplier
          </Link>
        }
      />
      <div className="px-6">
        {!result.success ? (
          <div className="rounded-2xl p-6 text-sm" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.6)" }}>
            <p className="font-medium mb-1" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Supplier Master is not available yet</p>
            <p>{result.error.message} — enable Enterprise Operations / the Vendor module to use this section.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["Code", "Name", "Status", "Currency", "Lead Time"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No suppliers yet.</td></tr>
                ) : (
                  result.data.items.map((v) => (
                    <tr key={v.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td className="px-4 py-3" style={{ color: "var(--lavender)" }}>{v.vendorCode}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{v.displayName}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.status}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.currency}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.leadTimeDays ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Workspace>
  );
}
