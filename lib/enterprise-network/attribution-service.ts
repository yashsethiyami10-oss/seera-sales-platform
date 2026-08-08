import { z } from "zod";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { recordSourceReference } from "@/lib/enterprise-phase2/foundation";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal } from "./context";

const attributionInput = z.object({
  partnerId: z.string().cuid(),
  orderId: z.string().cuid(),
  territoryKey: z.string().trim().max(80).optional(),
  metricKey: z.string().trim().min(1).max(80).default("REVENUE"),
  attributedAmount: z.coerce.number().positive(),
  effectiveAt: z.coerce.date(),
});

export async function attributeOrderToPartner(input: unknown) {
  const data = attributionInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const [partner, order, existing] = await Promise.all([
      tx.networkPartner.findFirst({ where: { id: data.partnerId, organizationKey: principal.organizationKey, lifecycleStatus: "ACTIVE" } }),
      tx.order.findUnique({ where: { id: data.orderId } }),
      tx.networkPartnerOrderSource.aggregate({
        where: { organizationKey: principal.organizationKey, orderId: data.orderId, metricKey: data.metricKey },
        _sum: { attributedAmount: true },
      }),
    ]);
    if (!partner) throw new NotFoundError("Active partner");
    if (!order || order.paymentStatus !== "PAID") throw new NotFoundError("Paid order");
    if (Number(existing._sum.attributedAmount ?? 0) + data.attributedAmount > order.total) {
      throw new ConflictError("Partner attribution exceeds the authoritative order total");
    }
    const source = await tx.networkPartnerOrderSource.create({
      data: { ...data, organizationKey: principal.organizationKey, createdById: principal.id },
    });
    await recordSourceReference(tx, principal, { entityType: "NetworkPartnerOrderSource", entityId: source.id }, {
      organizationKey: principal.organizationKey, sourceDomain: "COMMERCE", sourceEntityType: "Order",
      sourceEntityId: order.id, sourceDocumentNo: order.orderNumber, sourceVersion: source.sourceVersion,
    });
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "PARTNER_ORDER_ATTRIBUTED",
      entityType: "NetworkPartnerOrderSource", entityId: source.id,
      description: `Order ${order.orderNumber} attributed to ${partner.partnerNumber}`,
      next: { partnerId: partner.id, orderId: order.id, metricKey: source.metricKey, attributedAmount: data.attributedAmount },
    });
    return source;
  });
}

