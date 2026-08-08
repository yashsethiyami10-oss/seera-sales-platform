"use client";

import { useState } from "react";
import {
  createUnit, updateUnit, createBrand, updateBrand, createDepartment, updateDepartment,
  createInstitutionCategory, updateInstitutionCategory, createPaymentTerms, updatePaymentTerms,
  createCustomerType, updateCustomerType, createTaxRate, updateTaxRate,
} from "@/actions/master-data";
import { SimpleMasterSection } from "./SimpleMasterSection";

type Row = { id: string; active: boolean; [key: string]: unknown };
const TABS = ["Units", "Brands", "Departments", "Customer Types", "Institution Categories", "Payment Terms", "Tax Masters"] as const;
type Tab = (typeof TABS)[number];

/** MUV OS™ — Milestone 2, Common Masters hub — one tab per master entity. */
export function MastersHubTabs({
  units, brands, departments, customerTypes, institutionCategories, paymentTerms, taxRates,
}: {
  units: Row[]; brands: Row[]; departments: Row[]; customerTypes: Row[];
  institutionCategories: Row[]; paymentTerms: Row[]; taxRates: Row[];
}) {
  const [tab, setTab] = useState<Tab>("Units");

  return (
    <div>
      <div role="tablist" aria-label="Common Masters" className="flex flex-wrap gap-1 border-b mb-6" style={{ borderColor: "var(--card-border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="muv-os-interactive px-3 py-2 text-sm -mb-px rounded-b-none"
            style={{ color: tab === t ? "var(--lavender)" : "rgba(var(--text-rgb),0.55)", borderBottom: tab === t ? "2px solid var(--lavender)" : "2px solid transparent" }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Units" && (
        <SimpleMasterSection
          title="Units"
          description="Unit of measure used across products and quotations"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "code", label: "Code", type: "text", required: true }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={units}
          createAction={createUnit}
          toggleActiveAction={(id, active) => updateUnit({ id, active })}
        />
      )}

      {tab === "Brands" && (
        <SimpleMasterSection
          title="Brands"
          description="Brand list for Supplier and future Product references"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "code", label: "Code", type: "text", required: true }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={brands}
          createAction={createBrand}
          toggleActiveAction={(id, active) => updateBrand({ id, active })}
        />
      )}

      {tab === "Departments" && (
        <SimpleMasterSection
          title="Departments"
          description="Used by Employee Master"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "code", label: "Code", type: "text", required: true }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={departments}
          createAction={createDepartment}
          toggleActiveAction={(id, active) => updateDepartment({ id, active })}
        />
      )}

      {tab === "Customer Types" && (
        <SimpleMasterSection
          title="Customer Types"
          description="Individual, Institutional, Distributor, Dealer, Retailer, Wholesaler, and more"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "code", label: "Code", type: "text", required: true }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={customerTypes}
          createAction={createCustomerType}
          toggleActiveAction={(id, active) => updateCustomerType({ id, active })}
        />
      )}

      {tab === "Institution Categories" && (
        <SimpleMasterSection
          title="Institution Categories"
          description="Admin-configurable — used by Institutional customer quick filters"
          fields={[{ key: "name", label: "Name", type: "text", required: true }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={institutionCategories}
          createAction={createInstitutionCategory}
          toggleActiveAction={(id, active) => updateInstitutionCategory({ id, active })}
        />
      )}

      {tab === "Payment Terms" && (
        <SimpleMasterSection
          title="Payment Terms"
          description="Used on Customer and Supplier profiles"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "days", label: "Days", type: "number", required: true }, { key: "description", label: "Description", type: "text" }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "days", label: "Days" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={paymentTerms}
          createAction={createPaymentTerms}
          toggleActiveAction={(id, active) => updatePaymentTerms({ id, active })}
        />
      )}

      {tab === "Tax Masters" && (
        <SimpleMasterSection
          title="Tax Masters"
          description="GST rate reference list"
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "code", label: "Code", type: "text", required: true }, { key: "rate", label: "Rate %", type: "number", required: true }, { key: "inclusive", label: "Inclusive", type: "checkbox" }]}
          displayColumns={[{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "rate", label: "Rate %" }, { key: "active", label: "Status", format: (i) => (i.active ? "Active" : "Inactive") }]}
          items={taxRates}
          createAction={createTaxRate}
          toggleActiveAction={(id, active) => updateTaxRate({ id, active })}
        />
      )}
    </div>
  );
}
