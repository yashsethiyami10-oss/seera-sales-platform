"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createQuotation } from "@/actions/inst-quotations";
import { useToast } from "@/components/ui/toast";
import { QuotationLineItemsEditor, type LineRow } from "@/components/os-sales/quotations/QuotationLineItemsEditor";

type Product = { id: string; name: string; gstRate: number; variants: { id: string; size: string; price: number }[] };

export function CreateQuotationForm({ opportunityId, products }: { opportunityId: string; products: Product[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rows, setRows] = useState<LineRow[]>(products[0] ? [{ productId: products[0].id, variantId: "", quantity: 1, unitPrice: products[0].variants[0]?.price ?? 0, discountPercent: 0 }] : []);
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (rows.length === 0) { showToast("Add at least one line item", { tone: "dark" }); return; }
    setSaving(true);
    const result = await createQuotation({
      opportunityId, validUntil, termsSnapshot: terms || undefined,
      lineItems: rows.map((r) => ({ productId: r.productId, variantId: r.variantId || undefined, quantity: r.quantity, unitPrice: r.unitPrice, discountPercent: r.discountPercent })),
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Quotation ${result.data.quotationNumber} created`, { tone: "dark" });
    router.push(`/os/sales/quotations/${result.data.quotationId}`);
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <div className="space-y-4">
      <QuotationLineItemsEditor products={products} rows={rows} onChange={setRows} />
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div><label className="text-xs font-medium mb-1 block" style={{ color: "rgba(var(--text-rgb),0.55)" }}>Valid Until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={field} style={fieldStyle} /></div>
      </div>
      <div><label className="text-xs font-medium mb-1 block" style={{ color: "rgba(var(--text-rgb),0.55)" }}>Terms</label><textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className={field} style={fieldStyle} /></div>
      <button type="button" onClick={submit} disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Creating…" : "Create Quotation"}</button>
    </div>
  );
}
