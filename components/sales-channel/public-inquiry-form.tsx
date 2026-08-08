"use client";

import { FormEvent, useRef, useState } from "react";

type Field = { name: string; label: string; type?: string; required?: boolean; list?: boolean };
const CONFIG: Record<string, { code: string; type: string; title: string; fields: Field[] }> = {
  institutional: { code: "INSTITUTIONAL_SALES", type: "INSTITUTIONAL", title: "Institutional Inquiry", fields: [{ name: "institutionType", label: "Institution Type", required: true }, { name: "organizationName", label: "Organization Name", required: true }, { name: "monthlyRequirement", label: "Monthly Requirement", required: true }, { name: "requestedCategories", label: "Products Required (comma separated)", required: true, list: true }, { name: "siteVisitRequired", label: "Site Visit Required", type: "checkbox" }] },
  corporate: { code: "CORPORATE_INQUIRY", type: "CORPORATE", title: "Corporate Inquiry", fields: [{ name: "companyName", label: "Company", required: true }, { name: "industry", label: "Industry", required: true }, { name: "locations", label: "Number of Locations", type: "number", required: true }, { name: "requestedCategories", label: "Requirements (comma separated)", required: true, list: true }, { name: "decisionMaker", label: "Decision Maker" }] },
  bulk: { code: "BULK_ORDER", type: "CORPORATE", title: "Bulk Order Inquiry", fields: [{ name: "deliveryCity", label: "Delivery City", required: true }, { name: "requestedProducts", label: "Products (comma separated)", required: true, list: true }, { name: "requestedQuantities", label: "Quantities (comma separated)", required: true, list: true }, { name: "requiredDate", label: "Required Date", type: "date", required: true }, { name: "estimatedBudget", label: "Budget", type: "number" }] },
  quotation: { code: "QUOTATION_REQUEST", type: "CORPORATE", title: "Quotation Request", fields: [{ name: "deliveryLocation", label: "Delivery Location", required: true }, { name: "requestedProducts", label: "Products (comma separated)", required: true, list: true }, { name: "quantities", label: "Quantities (comma separated)", required: true, list: true }, { name: "requiredDate", label: "Required Date", type: "date" }] },
  sample: { code: "SAMPLE_REQUEST", type: "CORPORATE", title: "Sample Request", fields: [{ name: "requestedProducts", label: "Products (comma separated)", required: true, list: true }, { name: "reason", label: "Reason", required: true }, { name: "expectedMonthlyPurchase", label: "Expected Monthly Purchase", required: true }, { name: "deliveryAddress", label: "Delivery Address", required: true }] },
  dealer: { code: "DEALER_APPLICATION", type: "DEALER", title: "Dealer Application", fields: [{ name: "businessName", label: "Business Name", required: true }, { name: "businessType", label: "Business Type", required: true }, { name: "yearsInBusiness", label: "Years in Business", type: "number", required: true }, { name: "marketArea", label: "Market Area", required: true }, { name: "requestedTerritory", label: "Requested Territory", required: true }, { name: "currentBrands", label: "Current Brands (comma separated)", list: true }] },
  distributor: { code: "DISTRIBUTOR_APPLICATION", type: "DISTRIBUTOR", title: "Distributor Application", fields: [{ name: "businessName", label: "Business Name", required: true }, { name: "warehouseCapacity", label: "Warehouse / Capacity", required: true }, { name: "investmentCapacity", label: "Investment Capacity", type: "number", required: true }, { name: "requestedTerritory", label: "Requested Territory", required: true }, { name: "currentBrands", label: "Current Brands (comma separated)", list: true }] },
  franchise: { code: "FRANCHISE_INQUIRY", type: "FRANCHISE", title: "Franchise Inquiry", fields: [{ name: "applicantName", label: "Applicant", required: true }, { name: "preferredCity", label: "Preferred City", required: true }, { name: "investmentCapacity", label: "Investment Range", type: "number", required: true }, { name: "propertyAvailable", label: "Property Available", type: "checkbox" }, { name: "timelineExpectation", label: "Expected Timeline", required: true }, { name: "businessExperience", label: "Business Background", required: true }] },
  contact: { code: "CONTACT_SALES", type: "D2C", title: "Contact Sales", fields: [{ name: "contactReason", label: "Reason", required: true }, { name: "preferredContactMethod", label: "Preferred Contact Method" }, { name: "preferredContactTime", label: "Preferred Contact Time" }] },
};

export function PublicInquiryForm({ kind }: { kind: string }) {
  const config = CONFIG[kind];
  const [state, setState] = useState<{ loading?: boolean; error?: string; reference?: string }>({});
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  if (!config) return <p>Form not found.</p>;
  const cfg = config;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ loading: true });
    const form = new FormData(event.currentTarget);
    const detail: Record<string, unknown> = {};
    for (const field of cfg.fields) {
      const raw = field.type === "checkbox" ? form.get(field.name) === "on" : String(form.get(field.name) ?? "");
      detail[field.name] = field.list ? String(raw).split(",").map((v) => v.trim()).filter(Boolean) : raw;
    }
    const response = await fetch("/api/sales/inquiries", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channelCode: cfg.code, customerTypeCode: cfg.type, leadSourceCode: "WEBSITE",
        name: form.get("name"), businessName: form.get("businessName") || undefined,
        email: form.get("email") || undefined, phone: form.get("phone") || undefined,
        gstNumber: form.get("gstNumber") || undefined, city: form.get("city") || undefined,
        subject: cfg.title, requirementSummary: form.get("message"), consent: form.get("consent") === "on",
        honeypot: form.get("website"), idempotencyKey: idempotencyKey.current, sourceUrl: location.href, detail,
      }),
    });
    const result = await response.json();
    setState(response.ok ? { reference: result.data.referenceNumber } : { error: result.error?.message ?? "Submission failed" });
  }
  if (state.reference) return <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6"><h2 className="text-xl text-white">Thank you</h2><p className="mt-2 text-zinc-300">Reference: {state.reference}</p><p className="mt-2 text-sm text-zinc-400">Our team will review your request. Submission does not guarantee approval.</p></div>;
  return <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
    {[["name","Contact Person"],["businessName","Business Name"],["email","Email"],["phone","Phone"],["gstNumber","GST"],["city","City"]].map(([name,label]) => <label key={name} className="text-sm text-zinc-300">{label}<input name={name} required={name === "name"} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white" /></label>)}
    {config.fields.map((field) => <label key={field.name} className="text-sm text-zinc-300">{field.label}<input name={field.name} type={field.type ?? "text"} required={field.required} className={field.type === "checkbox" ? "ml-3" : "mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white"} /></label>)}
    <label className="md:col-span-2 text-sm text-zinc-300">Message<textarea name="message" required maxLength={5000} className="mt-1 min-h-32 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white" /></label>
    <input name="website" className="hidden" tabIndex={-1} autoComplete="off" />
    <label className="md:col-span-2 text-sm text-zinc-300"><input type="checkbox" name="consent" required className="mr-2" />I consent to being contacted about this request.</label>
    {state.error && <p className="md:col-span-2 text-sm text-red-400">{state.error}</p>}
    <button disabled={state.loading} className="rounded-xl bg-amber-400 px-5 py-3 font-medium text-black disabled:opacity-50">{state.loading ? "Submitting…" : "Submit Request"}</button>
  </form>;
}
