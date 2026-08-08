"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProductionPlan, createProductionOrder } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Plan = { id: string; productionPlanNumber: string; status: string; planDate: string | Date };
type Order = { id: string; productionOrderNumber: string; status: string; plannedQuantity: number };
type ActiveRevision = { id: string; revisionNumber: number; standardBatchSize: number; formula: { formulaCode: string; name: string; outputVariantId: string } };
type Warehouse = { id: string; name: string };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/**
 * Milestone 7 — Manufacturing (Including Procurement). Only ACTIVE formula
 * revisions are offered here — reinforces approved decision 3 ("Production
 * cannot start without an approved Formula/BOM") in the UI, on top of
 * createProductionOrder's own already-existing server-side ACTIVE check.
 */
export function ProductionManager({ plans, orders, activeRevisions, warehouses }: { plans: Plan[]; orders: Order[]; activeRevisions: ActiveRevision[]; warehouses: Warehouse[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  const [planDate, setPlanDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [revisionId, setRevisionId] = useState(activeRevisions[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [plannedQuantity, setPlannedQuantity] = useState(100);
  const [unitOfMeasure, setUnitOfMeasure] = useState("kg");
  const [planId, setPlanId] = useState("");

  async function submitPlan() {
    if (!planDate || !periodStart || !periodEnd) { showToast("All three dates are required", { tone: "dark" }); return; }
    setPending(true);
    const result = await createProductionPlan({ planDate, periodStart, periodEnd });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Production plan ${result.data.productionPlanNumber} created`, { tone: "dark" });
    router.refresh();
  }

  async function submitOrder() {
    const revision = activeRevisions.find((r) => r.id === revisionId);
    if (!revision) { showToast("Select an active formula revision", { tone: "dark" }); return; }
    if (!warehouseId) { showToast("Select a warehouse", { tone: "dark" }); return; }
    setPending(true);
    const result = await createProductionOrder({
      productionPlanId: planId || undefined, productVariantId: revision.formula.outputVariantId, formulaRevisionId: revisionId,
      plannedQuantity, unitOfMeasure, warehouseId,
    });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Production order ${result.data.productionOrderNumber} created`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Production Plans</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Plan date<input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} /></label>
          <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Period start<input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} /></label>
          <label className="text-xs space-y-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Period end<input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="muv-os-field w-full rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} /></label>
        </div>
        <button type="button" onClick={submitPlan} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Plan</button>
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm"><tbody>
            {plans.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No production plans yet.</td></tr> :
              plans.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{p.productionPlanNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{new Date(p.planDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{p.status}</td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Production Orders</p>
        {activeRevisions.length === 0 ? (
          <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No ACTIVE formula revision exists yet — approve and activate one under Formula &amp; BOM first.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <select value={revisionId} onChange={(e) => setRevisionId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {activeRevisions.map((r) => <option key={r.id} value={r.id}>{r.formula.formulaCode} v{r.revisionNumber}</option>)}
              </select>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <input type="number" value={plannedQuantity} onChange={(e) => setPlannedQuantity(Number(e.target.value))} placeholder="Planned quantity" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} placeholder="Unit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                <option value="">No plan</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.productionPlanNumber}</option>)}
              </select>
            </div>
            <button type="button" onClick={submitOrder} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Production Order</button>
          </>
        )}
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm"><tbody>
            {orders.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No production orders yet.</td></tr> :
              orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{o.productionOrderNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{o.plannedQuantity}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{o.status}</td>
                  <td className="px-3 py-2"><Link href={`/os/manufacturing/production/${o.id}`} className="muv-os-interactive text-xs" style={{ color: "var(--lavender)" }}>Open →</Link></td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
