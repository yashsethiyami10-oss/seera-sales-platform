"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { convertLeadToOpportunity } from "@/actions/inst-leads";
import { quickCustomerSearch } from "@/actions/inst-dashboards";
import { useToast } from "@/components/ui/toast";

type CustomerType = { id: string; name: string };
type CustomerHit = { id: string; name: string; businessName: string | null; phone: string | null };

/**
 * Milestone 4.2 — Direct Business Order Workflow. The Lead conversion area
 * now offers two equally-valid, permanent workflows — clear wording per
 * explicit instruction: "Quotation Workflow" (creates/reuses the
 * Opportunity, then goes straight into quotation creation) and "Direct
 * Business Order" (creates/reuses the Opportunity, then goes straight into
 * the Direct Business Order line-item form). Neither button is labeled
 * "Create Quotation" — clicking either only ever produces an Opportunity as
 * an intermediate step, and the redirect target (not the underlying
 * convertLeadToOpportunity action, which is unchanged) is what actually
 * takes the officer into the chosen workflow.
 *
 * If the lead was already converted (existingOpportunityId set), the form
 * is skipped entirely — no second convertLeadToOpportunity call is ever
 * attempted (it would fail on InstOpportunity.leadId's existing unique
 * constraint anyway) — and both workflows are reachable as direct
 * continuation links using the existing opportunity.
 */
export function LeadConvertPanel({
  leadId, customerTypes, prefill, existingOpportunity,
}: {
  leadId: string;
  customerTypes: CustomerType[];
  prefill: { organizationName: string; contactPerson: string; phone: string; email: string | null };
  existingOpportunity?: { id: string; opportunityNumber: string; stage: string } | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function search(value: string) {
    setQ(value); setSelectedCustomerId(null);
    if (value.trim().length < 2) { setHits([]); return; }
    const result = await quickCustomerSearch(value);
    setHits(result.success ? result.data : []);
  }

  function buildPayload(form: HTMLFormElement) {
    const data = new FormData(form);
    return mode === "existing"
      ? { leadId, customerId: selectedCustomerId ?? undefined }
      : {
          leadId,
          newCustomer: {
            name: String(data.get("name") ?? ""),
            businessName: String(data.get("businessName") ?? "") || undefined,
            customerTypeId: String(data.get("customerTypeId") ?? ""),
            phone: String(data.get("phone") ?? ""),
            email: String(data.get("email") ?? ""),
            city: String(data.get("city") ?? "") || undefined,
          },
        };
  }

  async function convertThenGo(form: HTMLFormElement, destination: (opportunityId: string) => string) {
    setPending(true);
    const result = await convertLeadToOpportunity(buildPayload(form));
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    router.push(destination(result.data.opportunityId));
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  if (existingOpportunity) {
    return (
      <div className="space-y-3 text-sm">
        <p style={{ color: "rgba(var(--text-rgb),0.7)" }}>
          This lead became opportunity {existingOpportunity.opportunityNumber} ({existingOpportunity.stage}).
        </p>
        <Link href={`/os/sales/opportunities/${existingOpportunity.id}`} className="muv-os-interactive block" style={{ color: "var(--lavender)" }}>View Opportunity →</Link>
        <Link href={`/os/sales/quotations/new?opportunityId=${existingOpportunity.id}`} className="muv-os-btn-ghost block rounded-lg px-3 py-2 text-center" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Continue: Quotation Workflow →</Link>
        <Link href={`/os/sales/orders/new?opportunityId=${existingOpportunity.id}`} className="muv-os-btn-ghost block rounded-lg px-3 py-2 text-center" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Continue: Direct Business Order →</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setMode("new")} className="muv-os-chip rounded-full px-3 py-1" aria-pressed={mode === "new"} style={{ border: "1px solid var(--card-border)" }}>Create new customer</button>
        <button type="button" onClick={() => setMode("existing")} className="muv-os-chip rounded-full px-3 py-1" aria-pressed={mode === "existing"} style={{ border: "1px solid var(--card-border)" }}>Link existing customer</button>
      </div>

      {mode === "new" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="name" required defaultValue={prefill.contactPerson} placeholder="Contact name *" className={field} style={fieldStyle} />
          <input name="businessName" defaultValue={prefill.organizationName} placeholder="Company name" className={field} style={fieldStyle} />
          <select name="customerTypeId" required className={field} style={fieldStyle}>
            <option value="">Customer type *</option>
            {customerTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input name="phone" required defaultValue={prefill.phone} placeholder="Phone *" className={field} style={fieldStyle} />
          <input name="email" required type="email" defaultValue={prefill.email ?? ""} placeholder="Email *" className={field} style={fieldStyle} />
          <input name="city" placeholder="City" className={field} style={fieldStyle} />
        </div>
      ) : (
        <div>
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search customers…" className={field} style={fieldStyle} />
          {hits.length > 0 && (
            <div className="mt-2 space-y-1">
              {hits.map((c) => (
                <button type="button" key={c.id} onClick={() => { setSelectedCustomerId(c.id); setQ(`${c.name} — ${c.phone}`); setHits([]); }} className="muv-os-interactive block w-full text-left rounded-lg px-2 py-1.5 text-sm">
                  {c.name}{c.businessName ? ` — ${c.businessName}` : ""} ({c.phone})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs pt-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Choose the workflow for this customer:</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button" disabled={pending || (mode === "existing" && !selectedCustomerId)}
          onClick={(e) => convertThenGo(e.currentTarget.form as HTMLFormElement, (id) => `/os/sales/quotations/new?opportunityId=${id}`)}
          className="muv-os-btn-ghost flex-1 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}
        >
          {pending ? "Converting…" : "Quotation Workflow"}
        </button>
        <button
          type="button" disabled={pending || (mode === "existing" && !selectedCustomerId)}
          onClick={(e) => convertThenGo(e.currentTarget.form as HTMLFormElement, (id) => `/os/sales/orders/new?opportunityId=${id}`)}
          className="muv-os-btn-primary flex-1 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--lavender)", color: "#0b0b0f" }}
        >
          {pending ? "Converting…" : "Direct Business Order"}
        </button>
      </div>
    </form>
  );
}
