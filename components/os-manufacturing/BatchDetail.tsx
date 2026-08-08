"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordBatchActualQuantity, createInspection, recordQualityDecision, transferBatchToFinishedGoods } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Inspection = { id: string; inspectionNumber: string; status: string; inspectionType: string };
type Batch = {
  id: string; batchNumber: string; status: string; qualityStatus: string;
  plannedQuantity: number; actualQuantity: number | null; unitOfMeasure: string;
  transferredToInventoryAt: string | Date | null; inspections: Inspection[];
};

const DECISIONS = ["PASSED", "CONDITIONALLY_PASSED", "FAILED", "HOLD", "RELEASED", "REJECTED", "REWORK_REQUIRED"] as const;
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/**
 * Milestone 7 — Manufacturing (Including Procurement). "Rejected batches
 * cannot move to Finished Goods" is enforced server-side by
 * transferReleasedBatchToInventory (only status RELEASED is eligible) —
 * this UI simply doesn't render the transfer action unless that's true.
 */
export function BatchDetail({ batch }: { batch: Batch }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [actualQuantity, setActualQuantity] = useState(batch.plannedQuantity);
  const [inspectionType, setInspectionType] = useState("IN_PROCESS");
  const [selectedInspectionId, setSelectedInspectionId] = useState(batch.inspections[0]?.id ?? "");
  const [decision, setDecision] = useState<typeof DECISIONS[number]>("RELEASED");
  const [comments, setComments] = useState("");

  async function completeProduction() {
    setPending(true);
    const result = await recordBatchActualQuantity(batch.id, actualQuantity);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Production completed for this batch", { tone: "dark" });
    router.refresh();
  }

  async function addInspection() {
    setPending(true);
    const result = await createInspection({ batchId: batch.id, inspectionType });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Inspection ${result.data.inspectionNumber} created`, { tone: "dark" });
    router.refresh();
  }

  async function submitDecision() {
    if (!selectedInspectionId) { showToast("Select an inspection first", { tone: "dark" }); return; }
    setPending(true);
    const result = await recordQualityDecision({ inspectionId: selectedInspectionId, decision, comments: comments.trim() || undefined });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Quality decision recorded: ${decision}`, { tone: "dark" });
    router.refresh();
  }

  async function transfer() {
    setPending(true);
    const result = await transferBatchToFinishedGoods(batch.id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Transferred to Finished Goods — inventory now ${result.data.inventoryQuantity}`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{batch.batchNumber}</p>
          <div className="flex gap-2">
            <span className="text-xs rounded-full px-3 py-1.5" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.7)" }}>Status: {batch.status}</span>
            <span className="text-xs rounded-full px-3 py-1.5" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.7)" }}>QC: {batch.qualityStatus}</span>
          </div>
        </div>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Planned {batch.plannedQuantity} {batch.unitOfMeasure} · Actual {batch.actualQuantity ?? "—"}</p>
      </section>

      {batch.status === "CREATED" && (
        <section className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Record Produced Quantity</p>
          <div className="flex items-center gap-2">
            <input type="number" value={actualQuantity} onChange={(e) => setActualQuantity(Number(e.target.value))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent w-32" style={fieldStyle} />
            <button type="button" onClick={completeProduction} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Complete Production</button>
          </div>
        </section>
      )}

      {batch.status === "COMPLETED" && (
        <section className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Quality Inspection</p>
          <div className="flex items-center gap-2">
            <input value={inspectionType} onChange={(e) => setInspectionType(e.target.value)} placeholder="Inspection type" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            <button type="button" onClick={addInspection} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>+ New Inspection</button>
          </div>
        </section>
      )}

      {batch.inspections.length > 0 && (batch.status === "COMPLETED" || batch.status === "QC_HOLD") && (
        <section className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Record Quality Decision</p>
          <div className="grid grid-cols-3 gap-2">
            <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {batch.inspections.map((i) => <option key={i.id} value={i.id}>{i.inspectionNumber} ({i.status})</option>)}
            </select>
            <select value={decision} onChange={(e) => setDecision(e.target.value as typeof DECISIONS[number])} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Remarks" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          </div>
          <button type="button" onClick={submitDecision} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Submit Decision</button>
        </section>
      )}

      {batch.status === "RELEASED" && (
        <section className="muv-os-card rounded-2xl p-4 space-y-2" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Finished Goods</p>
          {batch.transferredToInventoryAt ? (
            <p className="text-xs" style={{ color: "#22c55e" }}>Already transferred to Finished Goods inventory on {new Date(batch.transferredToInventoryAt).toLocaleString("en-IN")}.</p>
          ) : (
            <button type="button" onClick={transfer} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Transfer to Finished Goods / Operations Inventory</button>
          )}
        </section>
      )}

      {batch.status === "REJECTED" && (
        <p className="text-sm" style={{ color: "#ef4444" }}>This batch was rejected by Quality Control and cannot move to Finished Goods.</p>
      )}
    </div>
  );
}
