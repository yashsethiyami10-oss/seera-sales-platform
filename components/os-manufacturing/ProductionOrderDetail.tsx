"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { transitionProductionOrder, reserveProductionMaterials, createBatch } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Allocation = { id: string; materialVariantId: string; plannedQuantity: number; allocatedQuantity: number; consumedQuantity: number; status: string };
type Batch = { id: string; batchNumber: string; status: string; qualityStatus: string; plannedQuantity: number; actualQuantity: number | null };
type Order = {
  id: string; productionOrderNumber: string; status: string; version: number;
  plannedQuantity: number; plannedBatchCount: number; unitOfMeasure: string;
  formulaRevision: { formula: { formulaCode: string; name: string } };
  allocations: Allocation[]; batches: Batch[];
};

// SCHEDULED -> MATERIAL_RESERVED is deliberately excluded here — that edge
// always goes through reserveProductionMaterials (a real reservation, not a
// bare status flip), never the generic transition dropdown.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PLANNED", "CANCELLED"], PLANNED: ["PENDING_APPROVAL"], PENDING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["SCHEDULED"], SCHEDULED: [], MATERIAL_RESERVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["PAUSED", "COMPLETED_PENDING_QC"], PAUSED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED_PENDING_QC: ["COMPLETED"], COMPLETED: ["CLOSED"],
};

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function ProductionOrderDetail({ order }: { order: Order }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(order.plannedQuantity);

  async function transition(target: string) {
    setPending(true);
    const result = await transitionProductionOrder(order.id, target, order.version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Production order → ${target}`, { tone: "dark" });
    router.refresh();
  }

  async function reserve() {
    setPending(true);
    const result = await reserveProductionMaterials(order.id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Raw materials reserved", { tone: "dark" });
    router.refresh();
  }

  async function addBatch() {
    setPending(true);
    const result = await createBatch({ productionOrderId: order.id, plannedQuantity: batchQuantity, unitOfMeasure: order.unitOfMeasure });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Batch ${result.data.batchNumber} created`, { tone: "dark" });
    router.refresh();
  }

  const nextOptions = ALLOWED_TRANSITIONS[order.status] ?? [];
  const canReserve = order.status === "SCHEDULED";
  const canCreateBatch = ["APPROVED", "SCHEDULED", "MATERIAL_RESERVED", "IN_PROGRESS"].includes(order.status);

  return (
    <div className="space-y-6">
      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{order.formulaRevision.formula.formulaCode} — {order.formulaRevision.formula.name}</p>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Planned {order.plannedQuantity} {order.unitOfMeasure}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm rounded-full px-3 py-1.5" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.7)" }}>{order.status}</span>
            {canReserve && (
              <button type="button" onClick={reserve} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Reserve Raw Materials</button>
            )}
            {nextOptions.length > 0 && (
              <select disabled={pending} value="" onChange={(e) => e.target.value && transition(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                <option value="">Change status…</option>
                {nextOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            )}
          </div>
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Raw Material Reservation</p>
        {order.allocations.length === 0 ? (
          <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Not reserved yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
            <table className="w-full text-sm"><thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["Material Variant", "Planned", "Allocated", "Consumed", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
            </tr></thead><tbody>
              {order.allocations.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs font-mono" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.materialVariantId}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.plannedQuantity}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.allocatedQuantity}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.consumedQuantity}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.status}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </section>

      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Batches</p>
        {canCreateBatch && (
          <div className="flex items-center gap-2">
            <input type="number" value={batchQuantity} onChange={(e) => setBatchQuantity(Number(e.target.value))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent w-32" style={fieldStyle} />
            <button type="button" onClick={addBatch} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>+ Create Batch</button>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm"><tbody>
            {order.batches.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No batches yet.</td></tr> :
              order.batches.map((b) => (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{b.batchNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{b.status}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>QC: {b.qualityStatus}</td>
                  <td className="px-3 py-2"><Link href={`/os/manufacturing/batches/${b.id}`} className="muv-os-interactive text-xs" style={{ color: "var(--lavender)" }}>Open →</Link></td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
