"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFormula, transitionFormula } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Variant = { id: string; label: string };
type Formula = { id: string; formulaCode: string; name: string; revisions: { id: string; revisionNumber: number; status: string }[] };

const NEXT_STATUS: Record<string, ("UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "ARCHIVED")[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"], UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["ACTIVE", "ARCHIVED"], ACTIVE: ["SUPERSEDED"], REJECTED: [], SUPERSEDED: ["ARCHIVED"], ARCHIVED: [],
};
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/**
 * Milestone 7 — Manufacturing (Including Procurement). Formula = the
 * existing EnterpriseFormula/EnterpriseFormulaRevision BOM domain. Only a
 * revision at status ACTIVE lets createProductionOrder succeed (already
 * enforced there) — satisfying the approved decision 3 ("Production cannot
 * start without an approved Formula/BOM") without any change to that check.
 */
export function FormulaManager({ initialFormulas, variants }: { initialFormulas: Formula[]; variants: Variant[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [formulaCode, setFormulaCode] = useState("");
  const [name, setName] = useState("");
  const [outputVariantId, setOutputVariantId] = useState(variants[0]?.id ?? "");
  const [standardBatchSize, setStandardBatchSize] = useState(100);
  const [unitOfMeasure, setUnitOfMeasure] = useState("kg");
  const [expectedYield, setExpectedYield] = useState(100);
  const [ingredients, setIngredients] = useState([{ materialVariantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg" }]);

  async function submit() {
    if (!formulaCode.trim() || !name.trim()) { showToast("Formula code and name are required", { tone: "dark" }); return; }
    setPending(true);
    const result = await createFormula({ formulaCode: formulaCode.trim(), name: name.trim(), outputVariantId, standardBatchSize, unitOfMeasure, expectedYield, ingredients: ingredients.filter((i) => i.materialVariantId) });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Formula ${result.data.formulaCode} created`, { tone: "dark" });
    setFormulaCode(""); setName("");
    router.refresh();
  }

  async function changeStatus(revisionId: string, target: "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "ARCHIVED", revisionNumber: number) {
    setPending(true);
    const result = await transitionFormula(revisionId, target, revisionNumber);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Formula revision → ${target}`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>New Formula</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input value={formulaCode} onChange={(e) => setFormulaCode(e.target.value)} placeholder="Formula code" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <select value={outputVariantId} onChange={(e) => setOutputVariantId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label} (output)</option>)}
          </select>
          <input type="number" value={standardBatchSize} onChange={(e) => setStandardBatchSize(Number(e.target.value))} placeholder="Standard batch size" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} placeholder="Unit of measure" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={expectedYield} onChange={(e) => setExpectedYield(Number(e.target.value))} placeholder="Expected yield %" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Ingredients (raw materials, per standard batch)</p>
        <div className="space-y-2">
          {ingredients.map((ing, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <select value={ing.materialVariantId} onChange={(e) => setIngredients((rows) => rows.map((r, idx) => idx === i ? { ...r, materialVariantId: e.target.value } : r))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <input type="number" value={ing.quantity} onChange={(e) => setIngredients((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: Number(e.target.value) } : r))} placeholder="qty" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input value={ing.unitOfMeasure} onChange={(e) => setIngredients((rows) => rows.map((r, idx) => idx === i ? { ...r, unitOfMeasure: e.target.value } : r))} placeholder="unit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setIngredients((rows) => [...rows, { materialVariantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg" }])} className="muv-os-btn-ghost rounded-lg px-3 py-1 text-xs" style={fieldStyle}>+ Ingredient</button>
            <button type="button" onClick={submit} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Formula</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Code", "Name", "Latest Revision", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {initialFormulas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No formulas yet.</td></tr>
            ) : initialFormulas.map((f) => {
              const rev = f.revisions[0];
              return (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{f.formulaCode}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.name}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>v{rev?.revisionNumber ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{rev?.status ?? "—"}</td>
                  <td className="px-4 py-3">
                    {rev && (NEXT_STATUS[rev.status] ?? []).length > 0 && (
                      <select disabled={pending} value="" onChange={(e) => e.target.value && changeStatus(rev.id, e.target.value as "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "ARCHIVED", rev.revisionNumber)} className="muv-os-field rounded-lg px-2 py-1 text-xs bg-transparent" style={fieldStyle}>
                        <option value="">Change status…</option>
                        {(NEXT_STATUS[rev.status] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
