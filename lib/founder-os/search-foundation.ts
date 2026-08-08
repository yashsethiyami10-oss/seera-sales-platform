import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { searchInput } from "./schemas";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Global Search
 * Foundation. Foundation only, exactly as scoped: no ranking model, no
 * embeddings, no AI call of any kind — a fixed fan-out of simple,
 * case-insensitive `contains` queries across a handful of existing tables,
 * merged into one unified result shape. No new search-index table is
 * introduced (the existing storefront-facing `SearchQuery` model is a
 * different concern — a log of customer-facing product searches, not a
 * founder-facing cross-entity index — and is left untouched). A future
 * stage can replace the fan-out with a real index or add ranking/AI; this
 * stage defines the result contract and the entity coverage only.
 */

export type FounderSearchResultType = "CUSTOMER" | "ORDER" | "PRODUCT" | "RECEIVABLE_INVOICE" | "VENDOR_BILL" | "SAVED_VIEW" | "SAVED_REPORT" | "DASHBOARD_LAYOUT";
export type FounderSearchResult = { type: FounderSearchResultType; id: string; title: string; subtitle: string; deepLink: string };

const ALL_SEARCH_TYPES: FounderSearchResultType[] = [
  "CUSTOMER", "ORDER", "PRODUCT", "RECEIVABLE_INVOICE", "VENDOR_BILL", "SAVED_VIEW", "SAVED_REPORT", "DASHBOARD_LAYOUT",
];

export async function globalSearch(input: unknown) {
  const data = searchInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const types = data.types ?? ALL_SEARCH_TYPES;
  const perTypeLimit = Math.max(1, Math.floor(data.limit / types.length)) || data.limit;

  const searches: Promise<FounderSearchResult[]>[] = [];

  if (types.includes("CUSTOMER")) {
    searches.push(prisma.customer.findMany({
      where: { OR: [{ name: { contains: data.query, mode: "insensitive" } }, { email: { contains: data.query, mode: "insensitive" } }] },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "CUSTOMER" as const, id: r.id, title: r.name, subtitle: r.email, deepLink: `/admin/customers/${r.id}` }))));
  }
  if (types.includes("ORDER")) {
    searches.push(prisma.order.findMany({
      where: { orderNumber: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "ORDER" as const, id: r.id, title: r.orderNumber, subtitle: r.status, deepLink: `/admin/orders/${r.id}` }))));
  }
  if (types.includes("PRODUCT")) {
    searches.push(prisma.product.findMany({
      where: { name: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "PRODUCT" as const, id: r.id, title: r.name, subtitle: "Product", deepLink: `/admin/products?highlight=${r.id}` }))));
  }
  if (types.includes("RECEIVABLE_INVOICE")) {
    searches.push(prisma.financeReceivableInvoice.findMany({
      where: { organizationKey: principal.organizationKey, invoiceNumber: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "RECEIVABLE_INVOICE" as const, id: r.id, title: r.invoiceNumber, subtitle: `${r.status} — ${r.outstandingAmount.toString()} outstanding`, deepLink: `/admin/finance/receivables/${r.id}` }))));
  }
  if (types.includes("VENDOR_BILL")) {
    searches.push(prisma.financeVendorBill.findMany({
      where: { organizationKey: principal.organizationKey, billNumber: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "VENDOR_BILL" as const, id: r.id, title: r.billNumber, subtitle: `${r.status} — ${r.outstandingAmount.toString()} outstanding`, deepLink: `/admin/finance/payables/${r.id}` }))));
  }

  // Part 3D, Stage 4 — a Founder's own Saved Views/Reports/Layouts.
  // `ownerId: principal.id` is not optional here — this is the entire
  // enforcement behind "No cross-user results" for these three types
  // (there is no `isFounder` bypass of ownership anywhere in Stage 4;
  // two different Founder-role accounts must not see each other's
  // workspace configuration through search either).
  if (types.includes("SAVED_VIEW")) {
    searches.push(prisma.founderSavedView.findMany({
      where: { organizationKey: principal.organizationKey, ownerId: principal.id, name: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "SAVED_VIEW" as const, id: r.id, title: r.name, subtitle: r.surface, deepLink: `/dashboard/founder/workspace/views/${r.id}` }))));
  }
  if (types.includes("SAVED_REPORT")) {
    searches.push(prisma.founderSavedReport.findMany({
      where: { organizationKey: principal.organizationKey, ownerId: principal.id, name: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "SAVED_REPORT" as const, id: r.id, title: r.name, subtitle: r.reportType, deepLink: `/dashboard/founder/workspace/reports/${r.id}` }))));
  }
  if (types.includes("DASHBOARD_LAYOUT")) {
    searches.push(prisma.founderDashboardLayout.findMany({
      where: { organizationKey: principal.organizationKey, ownerId: principal.id, name: { contains: data.query, mode: "insensitive" } },
      take: perTypeLimit,
    }).then((rows) => rows.map((r) => ({ type: "DASHBOARD_LAYOUT" as const, id: r.id, title: r.name, subtitle: r.isActive ? "Active" : "Inactive", deepLink: `/dashboard/founder/workspace/layouts/${r.id}` }))));
  }

  const results = (await Promise.all(searches)).flat();
  return { query: data.query, results };
}
