import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import { type EnterprisePrincipal } from "./context";

// Advisory boundary only. No mutation method is exposed.
export async function getEnterpriseAdvisoryContext(
  principal: EnterprisePrincipal,
  area: "VENDOR" | "PROCUREMENT" | "PRODUCTION" | "QUALITY" | "INVENTORY" | "EXECUTIVE",
) {
  const flag = await prisma.aiConfiguration.findUnique({
    where: { organizationKey_key: { organizationKey: principal.organizationKey, key: "ENTERPRISE_AI_EXTENSIONS_ENABLED" } },
  });
  if (!flag?.active || !(flag.value as { enabled?: boolean }).enabled) throw new ForbiddenError("Enterprise AI extensions are disabled");
  const organizationKey = principal.organizationKey;
  switch (area) {
    case "VENDOR": return prisma.enterpriseVendor.findMany({ where: { organizationKey }, select: { vendorCode: true, displayName: true, status: true, riskClassification: true, performanceClassification: true }, take: 50 });
    case "PROCUREMENT": return prisma.enterprisePurchaseOrder.groupBy({ by: ["status"], where: { organizationKey }, _count: true, _sum: { grandTotal: true } });
    case "PRODUCTION": return prisma.enterpriseProductionOrder.groupBy({ by: ["status"], where: { organizationKey }, _count: true, _sum: { plannedQuantity: true, actualQuantity: true } });
    case "QUALITY": return prisma.enterpriseQualityDecision.groupBy({ by: ["decision"], where: { organizationKey }, _count: true });
    case "INVENTORY": return prisma.enterpriseWarehouseMovement.groupBy({ by: ["movementType"], where: { organizationKey }, _count: true, _sum: { quantity: true } });
    case "EXECUTIVE": return Promise.all([
      prisma.enterpriseVendor.count({ where: { organizationKey, status: "ACTIVE" } }),
      prisma.enterpriseProductionOrder.count({ where: { organizationKey, status: "IN_PROGRESS" } }),
      prisma.enterpriseBatch.count({ where: { organizationKey, status: "QC_HOLD" } }),
    ]);
  }
}

