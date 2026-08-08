"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acquireAsset, postDepreciationEntry } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Asset = { id: string; assetCode: string; name: string; status: string; cost: number; accumulatedDepreciation: number; netBookValue: number };
type Category = { id: string; code: string; name: string };
type DepreciationEntry = { id: string; assetCode: string; plannedAmount: number; fiscalPeriodId: string };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function FixedAssetsManager({ assets, categories, pendingEntries }: { assets: Asset[]; categories: Category[]; pendingEntries: DepreciationEntry[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [assetCode, setAssetCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [cost, setCost] = useState(0);

  async function submit() {
    setPending(true);
    const result = await acquireAsset({ assetCode, name, categoryId, acquisitionDate: new Date().toISOString(), cost });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Asset ${assetCode} capitalized`, { tone: "dark" });
    setAssetCode(""); setName("");
    router.refresh();
  }
  async function postDepreciation(entryId: string) {
    setPending(true);
    const result = await postDepreciationEntry(entryId);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Depreciation posted", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Acquire &amp; Capitalize Asset</p>
        {categories.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No asset categories exist yet — create one via Configuration first.</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input value={assetCode} onChange={(e) => setAssetCode(e.target.value)} placeholder="Asset code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} placeholder="Cost" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            </div>
            <button type="button" onClick={submit} disabled={pending || !assetCode || !name} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Capitalize (Dr Fixed Assets / Cr Accounts Payable)</button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Code", "Name", "Status", "Cost", "Accum. Dep.", "NBV"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {assets.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No fixed assets yet.</td></tr> :
              assets.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{a.assetCode}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.name}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.status}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{a.cost.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{a.accumulatedDepreciation.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{a.netBookValue.toLocaleString("en-IN")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Pending Depreciation Entries</p>
        {pendingEntries.length === 0 ? <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Nothing planned.</p> : (
          <div className="space-y-2">
            {pendingEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
                <span>{e.assetCode} — ₹{e.plannedAmount.toLocaleString("en-IN")}</span>
                <button type="button" onClick={() => postDepreciation(e.id)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Post</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
