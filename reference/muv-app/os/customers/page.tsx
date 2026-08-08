import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listCustomers, getCustomerSummaryCounts } from "@/actions/customers";
import { listCustomerTypes, listInstitutionCategories } from "@/actions/master-data";
import { CustomerFilters } from "@/components/os-customers/CustomerFilters";
import { CustomerExportButton } from "@/components/os-customers/CustomerExportButton";
import { CustomerSummaryCards } from "@/components/os-customers/CustomerSummaryCards";
import { InstitutionalQuickFilters } from "@/components/os-customers/InstitutionalQuickFilters";

/**
 * MUV OS™ — Milestone 2 (Customer & Master Data Foundation), Customer
 * Master list. Refinement pass: summary cards (§1), Institutional quick
 * filters (§2), and reworked default columns focused on business
 * operations (§3) — Name/Company/Type/Institution Category/Territory/
 * Owner/Status/Last Activity/Actions, with Phone/GST/Code/Credit Limit
 * moved to the Customer Profile (still real data, just not repeated in
 * every row of the list).
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const q = params.q ?? "";

  const [customersResult, typesResult, categoriesResult, summaryResult] = await Promise.all([
    listCustomers({
      q: q || undefined,
      customerTypeId: params.customerTypeId || undefined,
      institutionCategoryId: params.institutionCategoryId || undefined,
      active: params.active === "false" ? false : params.active === "true" ? true : undefined,
      sortBy: (params.sortBy as never) || "createdAt",
      sortDir: (params.sortDir as never) || "desc",
      page,
      pageSize: 20,
    }),
    listCustomerTypes({ activeOnly: true }),
    listInstitutionCategories({ activeOnly: true }),
    getCustomerSummaryCounts(),
  ]);

  if (!customersResult.success) {
    return (
      <Workspace>
        <PageHeader title="Customers" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
          {customersResult.error.message}
        </p>
      </Workspace>
    );
  }

  const { items, total, pages } = customersResult.data;
  const customerTypes = typesResult.success ? typesResult.data : [];
  const institutionCategories = categoriesResult.success ? categoriesResult.data : [];
  const customerTypeIdByName = Object.fromEntries(customerTypes.map((t) => [t.name, t.id]));
  const isInstitutionalSelected =
    !!params.customerTypeId && params.customerTypeId === customerTypeIdByName.Institutional;

  return (
    <Workspace>
      <PageHeader
        title="Customers"
        description={`${total} customer${total === 1 ? "" : "s"}`}
        actions={
          <>
            <CustomerExportButton searchParams={params} />
            <Link
              href="/os/customers/new"
              className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--lavender)", color: "#0b0b0f" }}
            >
              <Plus size={14} /> New Customer
            </Link>
          </>
        }
      />

      <div className="px-6 space-y-4">
        {summaryResult.success && (
          <CustomerSummaryCards counts={summaryResult.data} customerTypeIdByName={customerTypeIdByName} currentParams={params} />
        )}

        <CustomerFilters customerTypes={customerTypes} institutionCategories={institutionCategories} />

        {isInstitutionalSelected && (
          <InstitutionalQuickFilters categories={institutionCategories} currentParams={params} />
        )}

        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Customer Name", "Company Name", "Customer Type", "Institution Category", "Territory", "Assigned Sales Officer", "Status", "Last Activity", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
                    No customers match these filters.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/os/customers/${c.id}`} className="muv-os-interactive px-1 -mx-1" style={{ color: "rgba(var(--text-rgb),0.9)" }}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.businessName ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.customerType?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.institutionCategory?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.assignedTerritory?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.assignedOwner?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: c.active ? "rgba(var(--lavender-rgb),0.12)" : "rgba(239,68,68,0.12)",
                          color: c.active ? "var(--lavender)" : "#ef4444",
                        }}
                      >
                        {c.active ? c.crmStatus : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
                      {new Date(c.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/os/customers/${c.id}`} className="muv-os-interactive flex w-fit items-center gap-1 px-2 py-1 text-xs" style={{ color: "var(--lavender)" }}>
                        View <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/os/customers?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`} className="muv-os-interactive px-2 py-1">
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link href={`/os/customers?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`} className="muv-os-interactive px-2 py-1">
                  Next
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </Workspace>
  );
}
