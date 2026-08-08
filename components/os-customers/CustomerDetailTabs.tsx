"use client";

import { useState } from "react";
import type { getCustomerDetail } from "@/actions/customers";
import { CustomerForm } from "./CustomerForm";
import { CustomerContactPersons } from "./CustomerContactPersons";
import { CustomerDocumentUpload } from "./CustomerDocumentUpload";
import { CustomerNoteForm } from "./CustomerNoteForm";

type Option = { id: string; name: string };
type TabId = "overview" | "contacts" | "documents" | "notes" | "timeline";
type CustomerDetailResult = Awaited<ReturnType<typeof getCustomerDetail>>;
type CustomerDetail = Extract<CustomerDetailResult, { success: true }>["data"];
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contact Persons" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
  { id: "timeline", label: "Timeline / Audit" },
];

/** MUV OS™ — Milestone 2, Customer Profile detail: Overview/Contacts/Documents/Notes/Timeline. */
export function CustomerDetailTabs({
  customer,
  customerTypes,
  institutionCategories,
  paymentTerms,
  territories,
  owners,
}: {
  customer: CustomerDetail;
  customerTypes: Option[];
  institutionCategories: Option[];
  paymentTerms: Option[];
  territories: Option[];
  owners: Option[];
}) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div>
      <div role="tablist" aria-label="Customer profile sections" className="flex gap-1 border-b mb-6" style={{ borderColor: "var(--card-border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="muv-os-interactive px-3 py-2 text-sm -mb-px rounded-b-none"
            style={{
              color: tab === t.id ? "var(--lavender)" : "rgba(var(--text-rgb),0.55)",
              borderBottom: tab === t.id ? "2px solid var(--lavender)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <CustomerForm
          customerTypes={customerTypes}
          institutionCategories={institutionCategories}
          paymentTerms={paymentTerms}
          territories={territories}
          owners={owners}
          initial={{
            id: customer.id, name: customer.name, businessName: customer.businessName ?? "",
            customerTypeId: customer.customerTypeId ?? "", institutionCategoryId: customer.institutionCategoryId ?? "",
            industry: customer.industry ?? "", customerSince: customer.customerSince ? new Date(customer.customerSince).toISOString().slice(0, 10) : "",
            phone: customer.phone ?? "", alternatePhone: customer.alternatePhone ?? "", whatsappNumber: customer.whatsappNumber ?? "",
            landlineNumber: customer.landlineNumber ?? "", email: customer.email ?? "", website: customer.website ?? "",
            billingAddress: customer.billingAddress ?? "", shippingAddress: customer.shippingAddress ?? "",
            state: customer.state ?? "", city: customer.city ?? "", area: customer.area ?? "", pinCode: customer.pinCode ?? "",
            gstNumber: customer.gstNumber ?? "", pan: customer.pan ?? "", creditLimit: customer.creditLimit ? Number(customer.creditLimit) : "",
            paymentTermsId: customer.paymentTermsId ?? "", assignedOwnerId: customer.assignedOwnerId ?? "", assignedTerritoryId: customer.assignedTerritoryId ?? "",
          }}
        />
      )}

      {tab === "contacts" && <CustomerContactPersons customerId={customer.id} contacts={customer.contactPersons} />}

      {tab === "documents" && (
        <div className="space-y-4">
          <CustomerDocumentUpload customerId={customer.id} />
          {customer.documents.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No documents uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {customer.documents.map((d) => (
                <li key={d.id}>
                  <a href={d.mediaAsset.url} target="_blank" rel="noreferrer" className="text-sm hover:underline" style={{ color: "var(--lavender)" }}>
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <CustomerNoteForm customerId={customer.id} />
          {customer.notes.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {customer.notes.map((n) => (
                <li key={n.id} className="text-sm" style={{ color: "rgba(var(--text-rgb),0.8)" }}>
                  <p>{n.body}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(var(--text-rgb),0.4)" }}>
                    {n.author?.name ?? "Staff"} — {new Date(n.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "timeline" && (
        <ul className="space-y-3">
          {customer.salesTimeline.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No activity recorded yet.</p>
          ) : (
            customer.salesTimeline.map((e) => (
              <li key={e.id} className="text-sm" style={{ color: "rgba(var(--text-rgb),0.8)" }}>
                <p>{e.description}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(var(--text-rgb),0.4)" }}>{new Date(e.createdAt).toLocaleString()}</p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
