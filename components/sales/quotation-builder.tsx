"use client";
import { FormEvent, ReactNode, useState, useTransition } from "react";
import Link from "next/link";
import { createQuotationAction } from "@/actions/quotations";

/**
 * FR-004/FR-005/FR-007 correction — shared CRM Core quotation builder, used
 * by every role that reaches /sales/quotations/new (Founder, Sales Manager,
 * Sales Officer, Institutional Sales Officer). Deliberately not touched:
 * /os/sales/quotations/new and components/os-sales/quotations/CreateQuotationForm.tsx
 * are a separate, pre-existing Institutional Sales OS pipeline.
 *
 * Server-side pricing/tax/total calculation (lib/quotation/pricing.ts,
 * lib/quotation/workflow.ts) and the opportunity/permission authorization
 * (actions/quotations.ts) are unchanged by this component — everything
 * below is presentation: labels, units, required/optional state, help
 * text, inline errors, an explicit empty-opportunity state, and a real
 * Product -> Variant dependency (previously the Variant list showed every
 * product's variants unfiltered).
 */

type Product = { id: string; name: string; variants: { id: string; label: string; price: number }[] };

function Field({
  label, htmlFor, required, help, errors, children, className,
}: { label: string; htmlFor: string; required: boolean; help?: string; errors?: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-400">
        <span>{label}</span>
        <span className={required ? "text-amber-400" : "text-zinc-600"}>{required ? "Required" : "Optional"}</span>
      </label>
      {children}
      {help && <p className="mt-1 text-xs text-zinc-500">{help}</p>}
      {errors?.length ? <p className="mt-1 text-xs text-red-400">{errors.join(" ")}</p> : null}
    </div>
  );
}

export function QuotationBuilder({
  opportunities, products, canCreateOpportunity, preselectedOpportunityId,
}: {
  opportunities: { id: string; label: string }[];
  products: Product[];
  canCreateOpportunity: boolean;
  preselectedOpportunityId?: string;
}) {
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pending, start] = useTransition();

  if (opportunities.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 p-8 text-center">
        <p className="text-sm text-zinc-300">No eligible opportunities found. Create or qualify an opportunity before creating a quotation.</p>
        <div className="flex justify-center gap-3">
          {canCreateOpportunity && (
            <Link href="/sales/opportunities/new" className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-medium text-black">Create Opportunity</Link>
          )}
          <Link href="/sales/opportunities" className="rounded-xl border border-white/10 px-4 py-2 text-sm">Open Opportunities</Link>
        </div>
      </div>
    );
  }

  const selectedProduct = products.find((p) => p.id === productId);
  const availableVariants = selectedProduct?.variants ?? [];

  function handleProductChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextProductId = e.target.value;
    setProductId(nextProductId);
    const nextProduct = products.find((p) => p.id === nextProductId);
    if (!nextProduct?.variants.some((v) => v.id === variantId)) setVariantId("");
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const variant = availableVariants.find((v) => v.id === variantId);
    const rawVariantId = f.get("variantId");
    start(async () => {
      const r = await createQuotationAction({
        opportunityId: f.get("opportunityId"), pricingPolicyCode: f.get("policy"), validUntil: f.get("validUntil"),
        terms: { commercial: String(f.get("terms") ?? "") },
        lines: [{
          productId: f.get("productId"),
          variantId: rawVariantId ? rawVariantId : undefined,
          quantity: Number(f.get("quantity")),
          unitPrice: Number(f.get("unitPrice") || variant?.price || 0),
          discountType: "PERCENTAGE", discountValue: Number(f.get("discount") || 0),
        }],
      });
      if (r.success) {
        setMessage(`Created ${r.data.quotationNumber}`);
        setFieldErrors({});
      } else {
        setMessage(r.error.message);
        setFieldErrors(r.error.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-white/10 p-5 md:grid-cols-2">
      <Field label="Opportunity" htmlFor="opportunityId" required errors={fieldErrors.opportunityId}>
        <select id="opportunityId" name="opportunityId" required defaultValue={preselectedOpportunityId ?? ""} className="w-full rounded-lg bg-zinc-900 p-3">
          <option value="">Select opportunity…</option>
          {opportunities.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Field>

      <Field label="Pricing Policy" htmlFor="policy" required errors={fieldErrors.pricingPolicyCode}>
        <select id="policy" name="policy" required className="w-full rounded-lg bg-zinc-900 p-3">
          {["RETAIL", "DEALER", "DISTRIBUTOR", "INSTITUTIONAL", "CORPORATE", "FRANCHISE"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </Field>

      {fieldErrors.lines?.length ? <p className="text-xs text-red-400 md:col-span-2">{fieldErrors.lines.join(" ")}</p> : null}

      <Field label="Product" htmlFor="productId" required>
        <select id="productId" name="productId" required value={productId} onChange={handleProductChange} className="w-full rounded-lg bg-zinc-900 p-3">
          <option value="">Select product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      <Field label="Variant" htmlFor="variantId" required={false} help="Defaults to the product's base variant if left unselected.">
        <select id="variantId" name="variantId" disabled={!productId} value={variantId} onChange={(e) => setVariantId(e.target.value)} className="w-full rounded-lg bg-zinc-900 p-3 disabled:opacity-50">
          <option value="">{productId ? "Use product's base variant" : "Select a product first"}</option>
          {availableVariants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </Field>

      <Field label="Quantity" htmlFor="quantity" required help="Number of units of the selected variant.">
        <input id="quantity" name="quantity" type="number" min="1" step="1" required defaultValue="1" className="w-full rounded-lg bg-white/5 p-3" />
      </Field>

      <Field label="Unit Price (₹)" htmlFor="unitPrice" required={false} help="Leave blank to use the selected variant's catalogue price — all totals are recalculated server-side regardless.">
        <input id="unitPrice" name="unitPrice" type="number" min="0" step="0.01" placeholder="e.g. 499.00" className="w-full rounded-lg bg-white/5 p-3" />
      </Field>

      <Field label="Discount (%)" htmlFor="discount" required={false} help="Percentage discount on this line, 0–100.">
        <input id="discount" name="discount" type="number" min="0" max="100" defaultValue="0" className="w-full rounded-lg bg-white/5 p-3" />
      </Field>

      <Field label="Valid Until" htmlFor="validUntil" required errors={fieldErrors.validUntil}>
        <input id="validUntil" name="validUntil" type="date" required className="w-full rounded-lg bg-white/5 p-3" />
      </Field>

      <Field label="Commercial Terms" htmlFor="terms" required={false} className="md:col-span-2">
        <textarea id="terms" name="terms" placeholder="Commercial terms" className="w-full rounded-lg bg-white/5 p-3" />
      </Field>

      <button disabled={pending} className="rounded-lg bg-amber-400 p-3 text-black">Create quotation</button>
      {message && <p className="p-3 text-amber-400 md:col-span-2">{message}</p>}
    </form>
  );
}
