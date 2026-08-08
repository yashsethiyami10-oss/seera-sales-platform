import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getQuotationDetail } from "@/actions/inst-quotations";
import { listInstProducts } from "@/actions/inst-shared";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { QuotationVersionActions } from "@/components/os-sales/quotations/QuotationVersionActions";
import { ReviseQuotationPanel } from "@/components/os-sales/quotations/ReviseQuotationPanel";
import type { LineRow } from "@/components/os-sales/quotations/QuotationLineItemsEditor";

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, productsResult] = await Promise.all([getQuotationDetail(id), listInstProducts()]);
  if (!result.success) notFound();
  const quotation = result.data;
  const latest = quotation.versions[0];

  let canApprove = false;
  try { await requirePermission(PERMISSIONS.INST_QUOTATIONS_APPROVE); canApprove = true; } catch { canApprove = false; }

  const previousRows: LineRow[] = latest
    ? latest.lineItems.map((li) => ({ productId: li.productId, variantId: li.variantId ?? "", quantity: li.quantity, unitPrice: li.unitPrice, discountPercent: li.discountPercent }))
    : [];

  return (
    <Workspace>
      <PageHeader
        title={quotation.quotationNumber}
        description={`${quotation.customer.name} · Owner: ${quotation.owner.name} · ${quotation.opportunity.opportunityNumber}`}
        actions={latest && <QuotationVersionActions versionId={latest.id} status={latest.status} canApprove={canApprove} existingOrderId={latest.businessOrder?.id} />}
      />
      <div className="px-6 pb-10 space-y-6">
        {latest && (
          <section id="printable-quotation" className="muv-os-card rounded-2xl p-6" style={{ border: "1px solid var(--card-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-lg font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>Quotation {quotation.quotationNumber}</p>
                <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Version {latest.versionNumber} · Issued {new Date(latest.issueDate).toLocaleDateString("en-IN")} · Valid until {new Date(latest.validUntil).toLocaleDateString("en-IN")}</p>
              </div>
              <span className="text-xs rounded-full px-2 py-1" style={{ background: "rgba(var(--lavender-rgb),0.12)", color: "var(--lavender)" }}>{latest.status.replace(/_/g, " ")}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><p style={{ color: "rgba(var(--text-rgb),0.5)" }}>Bill To</p><p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{quotation.customer.businessName ?? quotation.customer.name}</p><p style={{ color: "rgba(var(--text-rgb),0.6)" }}>{quotation.customer.phone} · {quotation.customer.email}</p></div>
              <div><p style={{ color: "rgba(var(--text-rgb),0.5)" }}>Prepared By</p><p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{latest.createdBy.name}</p>{latest.approvedBy && <p style={{ color: "rgba(var(--text-rgb),0.6)" }}>Approved by {latest.approvedBy.name}</p>}</div>
            </div>
            <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
              <table className="w-full text-sm">
                <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Product", "Variant", "Qty", "Unit Price", "Discount", "Tax", "Total"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {latest.lineItems.map((li) => (
                    <tr key={li.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.8)" }}>{li.product.name}</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{li.variant?.size ?? "—"}</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{li.quantity}</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>₹{li.unitPrice.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{li.discountPercent}%</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{li.taxRate}%</td>
                      <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{li.lineTotal.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-sm text-right space-y-0.5" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
              <p>Subtotal: ₹{latest.subtotal.toLocaleString("en-IN")}</p>
              <p>Discount: -₹{latest.discountTotal.toLocaleString("en-IN")}</p>
              <p>Tax: ₹{latest.taxTotal.toLocaleString("en-IN")}</p>
              <p className="font-semibold text-base" style={{ color: "rgba(var(--text-rgb),0.95)" }}>Grand Total: ₹{latest.grandTotal.toLocaleString("en-IN")}</p>
            </div>
            {latest.termsSnapshot && <p className="mt-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>{latest.termsSnapshot}</p>}
            {latest.rejectionReason && <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>Rejected: {latest.rejectionReason}</p>}
            {latest.status === "ACCEPTED" && latest.acceptedAt && (
              <p className="mt-2 text-xs" style={{ color: "#22c55e" }}>
                Accepted via {latest.acceptanceMethod?.replace(/_/g, " ")} by {latest.accepter?.name ?? "—"} on {new Date(latest.acceptedAt).toLocaleString("en-IN")}
                {latest.acceptanceRemarks ? ` — ${latest.acceptanceRemarks}` : ""}
              </p>
            )}
          </section>
        )}

        <section>
          <SectionHeader title="Version History" />
          <div className="mt-2 space-y-1.5">
            {quotation.versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: "rgba(var(--text-rgb),0.03)" }}>
                <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>v{v.versionNumber} — ₹{v.grandTotal.toLocaleString("en-IN")}{v.revisionReason ? ` (${v.revisionReason})` : ""}</span>
                <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{v.status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </section>

        {(latest?.status === "REJECTED" || latest?.status === "EXPIRED" || latest?.status === "SENT") && (
          <ReviseQuotationPanel quotationId={quotation.id} products={productsResult.success ? productsResult.data : []} previousRows={previousRows} />
        )}

        <Link href={`/os/sales/opportunities/${quotation.opportunity.id}`} className="muv-os-interactive inline-block text-sm" style={{ color: "var(--lavender)" }}>← Back to Opportunity</Link>
      </div>
    </Workspace>
  );
}
