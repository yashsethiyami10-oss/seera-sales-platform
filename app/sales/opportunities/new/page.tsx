import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { CreateOpportunityForm } from "@/components/sales/create-opportunity-form";

/**
 * FR-006 — exposes the existing, already-implemented createOpportunityAction
 * through a real UI route. Reuses that action, its existing Zod schema, and
 * the existing opportunity pipeline as-is; no new business rule, permission,
 * or Prisma model is introduced here. Deliberately minimal: only the
 * schema's required fields (customerId, estimatedValue) plus two low-risk
 * optional fields (expectedCloseDate, priorityCode) are exposed — owner is
 * always the creating user (the same default the schema's own authorization
 * check already treats as always-permitted), and currency defaults to the
 * schema's own "INR" default. territoryId/salesChannelId/customerTypeId/
 * sourceInquiryId are valid to omit since the schema marks them optional.
 */
export default async function NewOpportunityPage() {
  await requirePermission(PERMISSIONS.OPPORTUNITIES_CREATE);
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, businessName: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return (
    <section className="space-y-5 text-white">
      <h1 className="text-3xl font-semibold">New Opportunity</h1>
      <p className="text-zinc-400">Creates a real opportunity via the existing CRM Core pipeline — the same one every quotation must originate from.</p>
      <CreateOpportunityForm customers={customers.map((c) => ({ id: c.id, label: c.businessName ?? c.name }))} />
    </section>
  );
}
