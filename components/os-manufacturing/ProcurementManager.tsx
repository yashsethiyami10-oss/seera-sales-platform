"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRequisition, submitRequisition, createOrder, issueOrder, createGoodsReceipt } from "@/actions/manufacturing";
import { useToast } from "@/components/ui/toast";

type Variant = { id: string; label: string };
type Vendor = { id: string; vendorCode: string; displayName: string };
type Warehouse = { id: string; name: string };
type Requisition = { id: string; requisitionNumber: string; status: string; version: number; priority: string };
type OrderItem = { id: string; variantId: string; quantity: number; unitOfMeasure: string; receivedQuantity: number };
type Order = { id: string; purchaseOrderNumber: string; status: string; version: number; grandTotal: number; warehouseId: string; vendor: { displayName: string }; items: OrderItem[] };
type Receipt = { id: string; goodsReceiptNumber: string; status: string; createdAt: string | Date };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
const cardStyle = { border: "1px solid var(--card-border)" } as const;

/**
 * Milestone 7 — Manufacturing (Including Procurement). Requisitions were
 * already wired (Milestone-nothing, this is Enterprise v3 Phase 1); Purchase
 * Order and Goods Receipt are the two genuinely new Business Services this
 * milestone added — this component is the first real UI for all three.
 */
export function ProcurementManager({ variants, vendors, warehouses, requisitions, orders, receipts }: {
  variants: Variant[]; vendors: Vendor[]; warehouses: Warehouse[];
  requisitions: Requisition[]; orders: Order[]; receipts: Receipt[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  // Requisition form state
  const [reqLines, setReqLines] = useState([{ variantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg" }]);

  // Purchase Order form state
  const [poVendorId, setPoVendorId] = useState(vendors[0]?.id ?? "");
  const [poWarehouseId, setPoWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [poLines, setPoLines] = useState([{ variantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg", unitPrice: 0, tax: 0 }]);

  // Goods Receipt form state
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? "");
  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const [receiptLines, setReceiptLines] = useState<Record<string, { receivedQuantity: number; acceptedQuantity: number; rejectedQuantity: number; damagedQuantity: number }>>({});

  function variantLabel(id: string) { return variants.find((v) => v.id === id)?.label ?? id; }

  async function submitRequisitionForm() {
    setPending(true);
    const result = await createRequisition({ items: reqLines.filter((l) => l.variantId) });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Requisition ${result.data.requisitionNumber} created`, { tone: "dark" });
    router.refresh();
  }
  async function submitReq(id: string, version: number) {
    setPending(true);
    const result = await submitRequisition(id, version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Requisition submitted for approval", { tone: "dark" });
    router.refresh();
  }

  async function submitPurchaseOrderForm() {
    if (!poVendorId || !poWarehouseId) { showToast("Vendor and warehouse are required", { tone: "dark" }); return; }
    setPending(true);
    const result = await createOrder({ vendorId: poVendorId, warehouseId: poWarehouseId, items: poLines.filter((l) => l.variantId) });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Purchase order ${result.data.purchaseOrderNumber} created`, { tone: "dark" });
    router.refresh();
  }
  async function issuePO(id: string, version: number) {
    setPending(true);
    const result = await issueOrder(id, version);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Purchase order issued", { tone: "dark" });
    router.refresh();
  }

  async function submitGoodsReceiptForm() {
    if (!selectedOrder) return;
    const items = selectedOrder.items.map((item) => {
      const line = receiptLines[item.id] ?? { receivedQuantity: 0, acceptedQuantity: 0, rejectedQuantity: 0, damagedQuantity: 0 };
      return { purchaseOrderItemId: item.id, ...line };
    }).filter((l) => l.receivedQuantity > 0);
    if (items.length === 0) { showToast("Enter a received quantity for at least one line", { tone: "dark" }); return; }
    setPending(true);
    const result = await createGoodsReceipt({ purchaseOrderId: selectedOrder.id, warehouseId: selectedOrder.warehouseId, items });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Goods receipt ${result.data.goodsReceiptNumber} recorded`, { tone: "dark" });
    setReceiptLines({});
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Purchase Requisitions</p>
        <div className="space-y-2">
          {reqLines.map((line, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <select value={line.variantId} onChange={(e) => setReqLines((rows) => rows.map((r, idx) => idx === i ? { ...r, variantId: e.target.value } : r))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <input type="number" value={line.quantity} onChange={(e) => setReqLines((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: Number(e.target.value) } : r))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input value={line.unitOfMeasure} onChange={(e) => setReqLines((rows) => rows.map((r, idx) => idx === i ? { ...r, unitOfMeasure: e.target.value } : r))} placeholder="unit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setReqLines((rows) => [...rows, { variantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg" }])} className="muv-os-btn-ghost rounded-lg px-3 py-1 text-xs" style={fieldStyle}>+ Line</button>
            <button type="button" onClick={submitRequisitionForm} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Requisition</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl" style={cardStyle}>
          <table className="w-full text-sm"><tbody>
            {requisitions.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No requisitions yet.</td></tr> :
              requisitions.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{r.requisitionNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{r.status}</td>
                  <td className="px-3 py-2">{r.status === "DRAFT" && <button type="button" onClick={() => submitReq(r.id, r.version)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Submit</button>}</td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Purchase Orders</p>
        <div className="grid grid-cols-2 gap-2">
          <select value={poVendorId} onChange={(e) => setPoVendorId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
          </select>
          <select value={poWarehouseId} onChange={(e) => setPoWarehouseId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {poLines.map((line, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              <select value={line.variantId} onChange={(e) => setPoLines((rows) => rows.map((r, idx) => idx === i ? { ...r, variantId: e.target.value } : r))} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <input type="number" value={line.quantity} onChange={(e) => setPoLines((rows) => rows.map((r, idx) => idx === i ? { ...r, quantity: Number(e.target.value) } : r))} placeholder="qty" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input value={line.unitOfMeasure} onChange={(e) => setPoLines((rows) => rows.map((r, idx) => idx === i ? { ...r, unitOfMeasure: e.target.value } : r))} placeholder="unit" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input type="number" value={line.unitPrice} onChange={(e) => setPoLines((rows) => rows.map((r, idx) => idx === i ? { ...r, unitPrice: Number(e.target.value) } : r))} placeholder="unit price" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
              <input type="number" value={line.tax} onChange={(e) => setPoLines((rows) => rows.map((r, idx) => idx === i ? { ...r, tax: Number(e.target.value) } : r))} placeholder="tax" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPoLines((rows) => [...rows, { variantId: variants[0]?.id ?? "", quantity: 1, unitOfMeasure: "kg", unitPrice: 0, tax: 0 }])} className="muv-os-btn-ghost rounded-lg px-3 py-1 text-xs" style={fieldStyle}>+ Line</button>
            <button type="button" onClick={submitPurchaseOrderForm} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Create Purchase Order</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl" style={cardStyle}>
          <table className="w-full text-sm"><tbody>
            {orders.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No purchase orders yet.</td></tr> :
              orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{o.purchaseOrderNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{o.vendor.displayName}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>₹{o.grandTotal.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{o.status}</td>
                  <td className="px-3 py-2">{o.status === "DRAFT" && <button type="button" onClick={() => issuePO(o.id, o.version)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Issue</button>}</td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Goods Receipt</p>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Accepted quantity becomes available raw material stock immediately — rejected/damaged quantities never do.</p>
        {orders.filter((o) => o.status === "ISSUED").length === 0 ? (
          <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No issued purchase orders eligible to receive against.</p>
        ) : (
          <>
            <select value={selectedOrderId} onChange={(e) => { setSelectedOrderId(e.target.value); setReceiptLines({}); }} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
              {orders.filter((o) => o.status === "ISSUED").map((o) => <option key={o.id} value={o.id}>{o.purchaseOrderNumber} — {o.vendor.displayName}</option>)}
            </select>
            {selectedOrder && (
              <div className="space-y-2">
                {selectedOrder.items.map((item) => {
                  const line = receiptLines[item.id] ?? { receivedQuantity: 0, acceptedQuantity: 0, rejectedQuantity: 0, damagedQuantity: 0 };
                  const set = (patch: Partial<typeof line>) => setReceiptLines((rows) => ({ ...rows, [item.id]: { ...line, ...patch } }));
                  return (
                    <div key={item.id} className="grid grid-cols-5 gap-2 items-center">
                      <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{variantLabel(item.variantId)} (ordered {item.quantity})</span>
                      <input type="number" value={line.receivedQuantity} onChange={(e) => set({ receivedQuantity: Number(e.target.value) })} placeholder="received" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
                      <input type="number" value={line.acceptedQuantity} onChange={(e) => set({ acceptedQuantity: Number(e.target.value) })} placeholder="accepted" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
                      <input type="number" value={line.rejectedQuantity} onChange={(e) => set({ rejectedQuantity: Number(e.target.value) })} placeholder="rejected" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
                      <input type="number" value={line.damagedQuantity} onChange={(e) => set({ damagedQuantity: Number(e.target.value) })} placeholder="damaged" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
                    </div>
                  );
                })}
                <button type="button" onClick={submitGoodsReceiptForm} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Record Goods Receipt</button>
              </div>
            )}
          </>
        )}
        <div className="overflow-x-auto rounded-xl" style={cardStyle}>
          <table className="w-full text-sm"><tbody>
            {receipts.length === 0 ? <tr><td className="px-3 py-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No goods receipts yet.</td></tr> :
              receipts.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{r.goodsReceiptNumber}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
