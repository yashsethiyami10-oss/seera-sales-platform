"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer, updateCustomerAdmin } from "@/actions/customers";
import { useToast } from "@/components/ui/toast";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

type Option = { id: string; name: string };

/**
 * MUV OS™ — Milestone 2, Customer Profile create/edit form. One component,
 * two call sites (`app/os/customers/new` and the detail page's edit mode)
 * — real reuse, not speculative: both need the identical field set.
 */
export function CustomerForm({
  customerTypes,
  institutionCategories,
  paymentTerms,
  territories,
  owners,
  initial,
}: {
  customerTypes: Option[];
  institutionCategories: Option[];
  paymentTerms: Option[];
  territories: Option[];
  owners: Option[];
  initial?: Record<string, unknown> & { id?: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors(undefined);

    const form = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (value === "") continue;
      if (key === "creditLimit") raw[key] = Number(value);
      else raw[key] = value;
    }

    const result = initial?.id
      ? await updateCustomerAdmin({ id: initial.id, ...raw })
      : await createCustomer(raw);

    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      showToast(result.error.message, { tone: "dark" });
      if ("fieldErrors" in result.error) setFieldErrors(result.error.fieldErrors as Record<string, string[]>);
      return;
    }
    showToast(initial?.id ? "Customer updated" : "Customer created", { tone: "dark" });
    router.push(`/os/customers/${result.data.id}`);
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;
  const label = "text-xs font-medium mb-1 block";
  const labelStyle = { color: "rgba(var(--text-rgb),0.55)" } as const;

  function d(name: string, fallback = ""): string {
    const value = initial?.[name];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
  }

  const sectionClass = "pb-6 border-b";
  const sectionStyle = { borderColor: "var(--card-border)" } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate={false}>
      {error && (
        <p
          role="alert"
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
        >
          {error}
        </p>
      )}

      <section className={sectionClass} style={sectionStyle}>
        <div className="mb-3"><SectionHeader title="Basic Information" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label} style={labelStyle}>Customer Name *</label><input name="name" required defaultValue={d("name")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Company Name</label><input name="businessName" defaultValue={d("businessName")} className={field} style={fieldStyle} /></div>
          <div>
            <label className={label} style={labelStyle}>Customer Type *</label>
            <select name="customerTypeId" required defaultValue={d("customerTypeId")} className={field} style={fieldStyle}>
              <option value="">Select…</option>
              {customerTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} style={labelStyle}>Institution Category</label>
            <select name="institutionCategoryId" defaultValue={d("institutionCategoryId")} className={field} style={fieldStyle}>
              <option value="">None</option>
              {institutionCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className={label} style={labelStyle}>Industry</label><input name="industry" defaultValue={d("industry")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Customer Since</label><input type="date" name="customerSince" defaultValue={d("customerSince")} className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <div className="mb-3"><SectionHeader title="Contact Information" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label} style={labelStyle}>Primary Mobile *</label><input name="phone" required defaultValue={d("phone")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Secondary Mobile</label><input name="alternatePhone" defaultValue={d("alternatePhone")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>WhatsApp Number</label><input name="whatsappNumber" defaultValue={d("whatsappNumber")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Landline Number</label><input name="landlineNumber" defaultValue={d("landlineNumber")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Email Address *</label><input type="email" name="email" required defaultValue={d("email")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Website</label><input name="website" defaultValue={d("website")} className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <div className="mb-3"><SectionHeader title="Addresses" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className={label} style={labelStyle}>Billing Address</label><textarea name="billingAddress" defaultValue={d("billingAddress")} className={field} style={fieldStyle} rows={2} /></div>
          <div className="sm:col-span-2"><label className={label} style={labelStyle}>Shipping Address</label><textarea name="shippingAddress" defaultValue={d("shippingAddress")} className={field} style={fieldStyle} rows={2} /></div>
          <div><label className={label} style={labelStyle}>State</label><input name="state" defaultValue={d("state")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>City</label><input name="city" defaultValue={d("city")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Area</label><input name="area" defaultValue={d("area")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>PIN Code</label><input name="pinCode" defaultValue={d("pinCode")} className={field} style={fieldStyle} /></div>
        </div>
      </section>

      <section>
        <div className="mb-3"><SectionHeader title="Business Information" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label} style={labelStyle}>GST Number</label><input name="gstNumber" defaultValue={d("gstNumber")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>PAN</label><input name="pan" defaultValue={d("pan")} className={field} style={fieldStyle} /></div>
          <div><label className={label} style={labelStyle}>Credit Limit (₹)</label><input type="number" min={0} name="creditLimit" defaultValue={d("creditLimit")} className={field} style={fieldStyle} /></div>
          <div>
            <label className={label} style={labelStyle}>Payment Terms</label>
            <select name="paymentTermsId" defaultValue={d("paymentTermsId")} className={field} style={fieldStyle}>
              <option value="">None</option>
              {paymentTerms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} style={labelStyle}>Assigned Sales Officer</label>
            <select name="assignedOwnerId" defaultValue={d("assignedOwnerId")} className={field} style={fieldStyle}>
              <option value="">Unassigned</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} style={labelStyle}>Territory</label>
            <select name="assignedTerritoryId" defaultValue={d("assignedTerritoryId")} className={field} style={fieldStyle}>
              <option value="">None</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {fieldErrors && (
        <ul role="alert" className="text-xs rounded-lg px-3 py-2 space-y-0.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {Object.entries(fieldErrors).map(([field2, errs]) => <li key={field2}>{field2}: {errs.join(", ")}</li>)}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="muv-os-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--lavender)", color: "#0b0b0f" }}
        >
          {saving ? "Saving…" : initial?.id ? "Save Changes" : "Create Customer"}
        </button>
        <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>* Required fields</span>
      </div>
    </form>
  );
}
