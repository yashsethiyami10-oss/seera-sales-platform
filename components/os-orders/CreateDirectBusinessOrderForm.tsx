"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDirectBusinessOrder } from "@/actions/business-orders";
import { useToast } from "@/components/ui/toast";
import { QuotationLineItemsEditor, type LineRow } from "@/components/os-sales/quotations/QuotationLineItemsEditor";

type Product = { id: string; name: string; gstRate: number; variants: { id: string; size: string; price: number }[] };

/**
 * Milestone 4.2 — Direct Business Order Workflow. Mirrors
 * components/os-sales/quotations/CreateQuotationForm.tsx's exact structure
 * — same QuotationLineItemsEditor (reused verbatim, zero duplication of the
 * line-item table/pricing-preview UI), same disabled-while-pending submit
 * pattern. The only real difference is what happens on submit: no
 * InstQuotation/InstQuotationVersion is created at all — this goes straight
 * to createDirectBusinessOrder, which creates the BusinessOrder atomically.
 */
export function CreateDirectBusinessOrderForm({ opportunityId, products }: { opportunityId: string; products: Product[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rows, setRows] = useState<LineRow[]>(products[0] ? [{ productId: products[0].id, variantId: "", quantity: 1, unitPrice: products[0].variants[0]?.price ?? 0, discountPercent: 0 }] : []);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (rows.length === 0) { showToast("Add at least one line item", { tone: "dark" }); return; }
    if (saving) return; // disables repeat submission while a request is already in flight
    setSaving(true);
    const result = await createDirectBusinessOrder({
      opportunityId,
      lineItems: rows.map((r) => ({ productId: r.productId, variantId: r.variantId || undefined, quantity: r.quantity, unitPrice: r.unitPrice, discountPercent: r.discountPercent })),
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Order ${result.data.orderNumber} created`, { tone: "dark" });
    router.push(`/os/orders/business/${result.data.id}`);
  }

  return (
    <div className="space-y-4">
      <QuotationLineItemsEditor products={products} rows={rows} onChange={setRows} />
      <button type="button" onClick={submit} disabled={saving} className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
        {saving ? "Creating…" : "Create Business Order"}
      </button>
    </div>
  );
}
