"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueSample } from "@/actions/inst-samples";
import { useToast } from "@/components/ui/toast";

type Product = { id: string; name: string; variants: { id: string; size: string }[] };

export function IssueSampleForm({ products, opportunityId, customerId }: { products: Product[]; opportunityId?: string; customerId?: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const selected = products.find((p) => p.id === productId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await issueSample({
      opportunityId, customerId: customerId || undefined,
      productId, variantId: String(form.get("variantId") ?? "") || undefined,
      quantity: Number(form.get("quantity")), unit: String(form.get("unit") ?? "Ltr"),
      issuedDate: String(form.get("issuedDate")),
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Sample ${result.data.sampleNumber} issued`, { tone: "dark" });
    router.push("/os/sales/samples");
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  if (!customerId && !opportunityId) {
    return <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Issue samples from a Customer or Opportunity page, so the sample is attached to the right record.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      <div>
        <label className={label} style={labelStyle}>Product *</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={field} style={fieldStyle}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {selected && selected.variants.length > 0 && (
        <div>
          <label className={label} style={labelStyle}>Variant</label>
          <select name="variantId" className={field} style={fieldStyle}>
            <option value="">Any</option>
            {selected.variants.map((v) => <option key={v.id} value={v.id}>{v.size}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} style={labelStyle}>Quantity *</label><input type="number" step="0.1" min={0.1} name="quantity" required className={field} style={fieldStyle} /></div>
        <div>
          <label className={label} style={labelStyle}>Unit</label>
          <select name="unit" defaultValue="Ltr" className={field} style={fieldStyle}>
            <option value="Ltr">Ltr</option><option value="Kg">Kg</option><option value="Pcs">Pcs</option>
          </select>
        </div>
      </div>
      <div><label className={label} style={labelStyle}>Issued Date *</label><input type="date" name="issuedDate" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} style={fieldStyle} /></div>
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Issuing…" : "Issue Sample"}</button>
    </form>
  );
}
