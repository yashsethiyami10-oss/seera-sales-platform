import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { warehouseBalance } from "@/lib/commerce/services";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireNetworkPrincipal, requirePortalAdminPrincipal, requirePortalPrincipal } from "./context";

export async function getPartnerOrderEligibility(partnerId: string) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const partner = await prisma.networkPartner.findFirst({
    where: { id: partnerId, organizationKey: principal.organizationKey },
    include: {
      agreements: { where: { status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] } },
      compliance: { where: { status: "COMPLIANT", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
    },
  });
  if (!partner) throw new NotFoundError("Partner");
  return {
    eligible: partner.lifecycleStatus === "ACTIVE" && partner.activationStatus === "ACTIVE" && partner.agreements.length > 0,
    partnerId: partner.id,
    activeAgreementIds: partner.agreements.map((item) => item.id),
    complianceRecordIds: partner.compliance.map((item) => item.id),
    orderService: "lib/commerce/services.ts",
  };
}

export async function getPartnerInventoryVisibility(partnerId: string, warehouseId: string, variantIds: string[]) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_PARTNERS_VIEW);
  const partner = await prisma.networkPartner.findFirst({ where: { id: partnerId, organizationKey: principal.organizationKey, lifecycleStatus: "ACTIVE" } });
  if (!partner) throw new NotFoundError("Active partner");
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, active: true } });
  if (!warehouse) throw new NotFoundError("Warehouse");
  return Promise.all(variantIds.map(async (variantId) => ({ variantId, ...(await warehouseBalance(warehouseId, variantId)) })));
}

export async function getPortalPartnerContext(userId: string) {
  const { mapping } = await requirePortalPrincipal(userId);
  return {
    partnerId: mapping.partnerId,
    partnerNumber: mapping.partner.partnerNumber,
    partnerType: mapping.partner.partnerType,
    permissions: mapping.permissions,
  };
}

export async function grantPartnerPortalAccess(input: { partnerId: string; userId: string; role: string; permissions: string[] }) {
  const principal = await requirePortalAdminPrincipal();
  return enterpriseTransaction(async (tx) => {
    const partner = await tx.networkPartner.findFirst({ where: { id: input.partnerId, organizationKey: principal.organizationKey, lifecycleStatus: "ACTIVE" } });
    if (!partner) throw new NotFoundError("Active partner");
    const mapping = await tx.networkPartnerUser.upsert({
      where: { organizationKey_partnerId_userId: { organizationKey: principal.organizationKey, partnerId: input.partnerId, userId: input.userId } },
      create: { ...input, organizationKey: principal.organizationKey, status: "ACTIVE", invitedById: principal.id, activatedAt: new Date() },
      update: { role: input.role, permissions: input.permissions, status: "ACTIVE", activatedAt: new Date(), revokedAt: null },
    });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "PARTNER_PORTAL_ACCESS_GRANTED", entityType: "NetworkPartnerUser", entityId: mapping.id, description: "Partner portal access granted by portal administrator", next: { partnerId: input.partnerId, userId: input.userId, role: input.role, permissions: input.permissions } });
    return mapping;
  });
}

export async function revokePartnerPortalAccess(mappingId: string) {
  const principal = await requirePortalAdminPrincipal();
  return enterpriseTransaction(async (tx) => {
    const current = await tx.networkPartnerUser.findFirst({ where: { id: mappingId, organizationKey: principal.organizationKey, status: "ACTIVE" } });
    if (!current) throw new NotFoundError("Active portal mapping");
    const mapping = await tx.networkPartnerUser.update({ where: { id: current.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await recordEnterpriseMutation(tx, principal, { module: "enterprise_network", action: "PARTNER_PORTAL_ACCESS_REVOKED", entityType: "NetworkPartnerUser", entityId: mapping.id, description: "Partner portal access revoked by portal administrator", next: { partnerId: mapping.partnerId, userId: mapping.userId } });
    return mapping;
  });
}

export async function portalPartnerSummary(userId: string, requestedPartnerId?: string) {
  const { principal, mapping } = await requirePortalPrincipal(userId);
  if (requestedPartnerId && requestedPartnerId !== mapping.partnerId) throw new ForbiddenError("Cross-partner access denied");
  const [claims, support, training, compliance] = await prisma.$transaction([
    prisma.networkClaim.count({ where: { organizationKey: principal.organizationKey, partnerId: mapping.partnerId } }),
    prisma.networkSupportCase.count({ where: { organizationKey: principal.organizationKey, partnerId: mapping.partnerId, status: { not: "CLOSED" } } }),
    prisma.networkTrainingAssignment.count({ where: { organizationKey: principal.organizationKey, partnerId: mapping.partnerId, status: { not: "COMPLETED" } } }),
    prisma.networkComplianceRecord.count({ where: { organizationKey: principal.organizationKey, partnerId: mapping.partnerId, status: { not: "COMPLIANT" } } }),
  ]);
  return { partnerId: mapping.partnerId, claims, openSupportCases: support, pendingTraining: training, complianceExceptions: compliance };
}

const reportInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  partnerId: z.string().cuid().optional(),
});

export async function getNetworkPerformanceReport(input: unknown) {
  const data = reportInput.parse(input);
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_ANALYTICS_VIEW);
  const where: Prisma.NetworkPartnerWhereInput = { organizationKey: principal.organizationKey, id: data.partnerId };
  const [total, partners] = await prisma.$transaction([
    prisma.networkPartner.count({ where }),
    prisma.networkPartner.findMany({
      where, orderBy: [{ partnerNumber: "asc" }, { id: "asc" }],
      skip: (data.page - 1) * data.pageSize, take: data.pageSize,
      include: { royaltyLines: true, commissionLines: true, targetLines: true, claims: true },
    }),
  ]);
  return {
    total, page: data.page, pageSize: data.pageSize,
    items: partners.map((partner) => ({
      partnerId: partner.id, partnerNumber: partner.partnerNumber, partnerType: partner.partnerType,
      royalties: partner.royaltyLines.reduce((sum, item) => sum + Number(item.calculatedAmount), 0),
      commissions: partner.commissionLines.reduce((sum, item) => sum + Number(item.calculatedAmount), 0),
      targets: partner.targetLines.map((item) => ({ metricKey: item.metricKey, targetValue: Number(item.targetValue) })),
      claimAmount: partner.claims.reduce((sum, item) => sum + Number(item.amount), 0),
    })),
  };
}

export async function exportNetworkPerformance(input: unknown) {
  const principal = await requireNetworkPrincipal(PERMISSIONS.NETWORK_ANALYTICS_VIEW);
  const report = await getNetworkPerformanceReport({ ...reportInput.parse(input), page: 1, pageSize: 100 });
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    ["partnerNumber", "partnerType", "royalties", "commissions", "claimAmount"].join(","),
    ...report.items.map((item) => [
      escape(item.partnerNumber), escape(item.partnerType), item.royalties, item.commissions, item.claimAmount,
    ].join(",")),
  ].join("\n");
  await enterpriseTransaction(async (tx) => {
    await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_network", action: "NETWORK_REPORT_EXPORTED",
      entityType: "NetworkPerformanceReport", entityId: crypto.randomUUID(),
      description: "Permission-scoped network performance report exported",
      next: { rowCount: report.items.length, format: "CSV" }, notify: false,
    });
  });
  return { contentType: "text/csv", filename: "network-performance.csv", csv };
}
