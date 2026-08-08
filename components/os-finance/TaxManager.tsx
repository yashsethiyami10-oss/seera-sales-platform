"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTaxJurisdiction, createTaxType, createTaxRate } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Rate = { id: string; code: string; ratePercent: number; taxType: { name: string }; jurisdiction: { name: string } };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function TaxManager({ rates, jurisdictions, taxTypes }: { rates: Rate[]; jurisdictions: { id: string; name: string }[]; taxTypes: { id: string; name: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [jurisdictionName, setJurisdictionName] = useState("");
  const [taxTypeCode, setTaxTypeCode] = useState("");
  const [taxTypeName, setTaxTypeName] = useState("");
  const [rateTaxTypeId, setRateTaxTypeId] = useState(taxTypes[0]?.id ?? "");
  const [rateJurisdictionId, setRateJurisdictionId] = useState(jurisdictions[0]?.id ?? "");
  const [rateCode, setRateCode] = useState("");
  const [ratePercent, setRatePercent] = useState(18);

  async function addJurisdiction() {
    setPending(true);
    const result = await createTaxJurisdiction({ code: jurisdictionCode, name: jurisdictionName, country: "IN" });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Jurisdiction added", { tone: "dark" });
    router.refresh();
  }
  async function addTaxType() {
    setPending(true);
    const result = await createTaxType({ code: taxTypeCode, name: taxTypeName });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Tax type added", { tone: "dark" });
    router.refresh();
  }
  async function addRate() {
    setPending(true);
    const result = await createTaxRate({ taxTypeId: rateTaxTypeId, jurisdictionId: rateJurisdictionId, code: rateCode, ratePercent, effectiveFrom: new Date().toISOString() });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Tax rate added", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Jurisdiction</p>
          <input value={jurisdictionCode} onChange={(e) => setJurisdictionCode(e.target.value)} placeholder="Code" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={jurisdictionName} onChange={(e) => setJurisdictionName(e.target.value)} placeholder="Name" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={addJurisdiction} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
        </div>
        <div className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Tax Type (GST, TDS, TCS…)</p>
          <input value={taxTypeCode} onChange={(e) => setTaxTypeCode(e.target.value)} placeholder="Code" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={taxTypeName} onChange={(e) => setTaxTypeName(e.target.value)} placeholder="Name" className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={addTaxType} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Add</button>
        </div>
      </div>
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Tax Rate</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={rateTaxTypeId} onChange={(e) => setRateTaxTypeId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{taxTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select value={rateJurisdictionId} onChange={(e) => setRateJurisdictionId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>{jurisdictions.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
          <input value={rateCode} onChange={(e) => setRateCode(e.target.value)} placeholder="Code (e.g. GST18)" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={ratePercent} onChange={(e) => setRatePercent(Number(e.target.value))} placeholder="Rate %" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <button type="button" onClick={addRate} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Add Rate</button>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Code", "Type", "Jurisdiction", "Rate"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rates.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No tax rates configured yet.</td></tr> :
              rates.map((r) => <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{r.code}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.taxType.name}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.jurisdiction.name}</td><td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.ratePercent}%</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Statutory filing is explicitly out of scope. Tax Reconciliation (output vs input tax) is available via getTaxReconciliation, surfaced on the Reports page.</p>
    </div>
  );
}
