"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviseQuotation } from "@/actions/inst-quotations";
import { useToast } from "@/components/ui/toast";
import { QuotationLineItemsEditor, type LineRow } from "@/components/os-sales/quotations/QuotationLineItemsEditor";

type Product = { id: string; name: string; gstRate: number; variants: { id: string; size: string; price: number }[] };

export function ReviseQuotationPanel({ quotationId, products, previousRows }: { quotationId: string; products: Product[]; previousRows: LineRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LineRow[]>(previousRows);
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>+ Create Revision</button>;
  }

  async function submit() {
    setSaving(true);
    const result = await reviseQuotation({
      quotationId, validUntil, revisionReason: reason || undefined,
      lineItems: rows.map((r) => ({ productId: r.productId, variantId: r.variantId || undefined, quantity: r.quantity, unitPrice: r.unitPrice, discountPercent: r.discountPercent })),
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Version ${result.data.versionNumber} created`, { tone: "dark" });
    router.refresh();
    setOpen(false);
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <div className="space-y-3 muv-os-card rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
      <QuotationLineItemsEditor products={products} rows={rows} onChange={setRows} />
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={field} style={fieldStyle} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Revision reason" className={field} style={fieldStyle} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Saving…" : "Save Revision"}</button>
        <button type="button" onClick={() => setOpen(false)} className="muv-os-btn-ghost rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.6)" }}>Cancel</button>
      </div>
    </div>
  );
}
