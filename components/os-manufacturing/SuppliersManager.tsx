"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier, transitionSupplier } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Vendor = { id: string; vendorCode: string; displayName: string; legalName: string; status: string; version: number; currency: string; leadTimeDays: number | null };

const NEXT_STATUS: Record<string, string[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"], UNDER_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ACTIVE", "SUSPENDED", "INACTIVE"], ACTIVE: ["SUSPENDED", "INACTIVE"],
  SUSPENDED: ["ACTIVE", "INACTIVE"], INACTIVE: ["ACTIVE", "ARCHIVED"], ARCHIVED: [],
};

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/** Milestone 7 — Manufacturing (Including Procurement). Suppliers = the existing EnterpriseVendor domain (terminology only differs). */
export function SuppliersManager({ initialVendors }: { initialVendors: Vendor[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");

  async function submitCreate() {
    if (!legalName.trim() || !displayName.trim()) { showToast("Legal name and display name are required", { tone: "dark" }); return; }
    setPending(true);
    const result = await createSupplier({ legalName: legalName.trim(), displayName: displayName.trim(), leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Supplier ${result.data.vendorCode} created`, { tone: "dark" });
    setLegalName(""); setDisplayName(""); setLeadTimeDays("");
    router.refresh();
  }

  async function changeStatus(vendor: Vendor, target: string) {
    setPending(true);
    const result = await transitionSupplier(vendor.id, target, vendor.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Supplier ${vendor.vendorCode} → ${target}`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Add Supplier</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal name" className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
          <input value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} type="number" placeholder="Lead time (days)" className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={submitCreate} disabled={pending} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
          {pending ? "Saving…" : "Add Supplier"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Code", "Name", "Status", "Lead Time", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {initialVendors.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No suppliers yet.</td></tr>
            ) : initialVendors.map((v) => (
              <tr key={v.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{v.vendorCode}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.displayName}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.status}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.leadTimeDays ?? "—"}</td>
                <td className="px-4 py-3">
                  <select disabled={pending || (NEXT_STATUS[v.status] ?? []).length === 0} value="" onChange={(e) => e.target.value && changeStatus(v, e.target.value)} className="muv-os-field rounded-lg px-2 py-1 text-xs bg-transparent" style={fieldStyle}>
                    <option value="">Change status…</option>
                    {(NEXT_STATUS[v.status] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
