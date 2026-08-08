import { prisma } from "@/lib/prisma";
import { quotationScope } from "./repository";

export async function getQuotationDashboard() {
  const scope = await quotationScope(), now = new Date(), soon = new Date(Date.now() + 7 * 86400000);
  const [statuses, totals, accepted, expiring, approvals, discounts] = await Promise.all([
    prisma.quotationVersion.groupBy({ by: ["statusId"], where: { isActive: true, quotation: scope }, _count: true, _sum: { grandTotal: true } }),
    prisma.quotationVersion.aggregate({ where: { isActive: true, quotation: scope }, _count: true, _sum: { grandTotal: true } }),
    prisma.quotationVersion.aggregate({ where: { isActive: true, status: { code: "ACCEPTED" }, quotation: scope }, _count: true, _sum: { grandTotal: true } }),
    prisma.quotationVersion.count({ where: { isActive: true, validUntil: { gte: now, lte: soon }, status: { terminal: false }, quotation: scope } }),
    prisma.quotationApprovalRequest.groupBy({ by: ["status"], where: { quotationVersion: { quotation: scope } }, _count: true }),
    prisma.quotationLineItem.aggregate({ where: { quotationVersion: { quotation: scope } }, _avg: { discountValue: true } }),
  ]);
  return { totalQuotations: totals._count, totalQuotationValue: totals._sum.grandTotal ?? 0,
    acceptedQuotations: accepted._count, acceptedValue: accepted._sum.grandTotal ?? 0,
    acceptanceRate: totals._count ? accepted._count / totals._count * 100 : 0, expiringSoon: expiring,
    averageDiscount: discounts._avg.discountValue ?? 0, byStatus: statuses, approvals };
}

export async function getQuotationReports() {
  const scope = await quotationScope();
  const [summary, policy, owner, territory, customerType, channel, approvals] = await Promise.all([
    prisma.quotationVersion.groupBy({ by: ["statusId"], where: { quotation: scope }, _count: true, _sum: { grandTotal: true, discountTotal: true } }),
    prisma.quotationVersion.groupBy({ by: ["pricingPolicyId"], where: { quotation: scope }, _count: true, _sum: { grandTotal: true } }),
    prisma.quotation.groupBy({ by: ["ownerUserId"], where: scope, _count: true }),
    prisma.quotation.groupBy({ by: ["territoryId"], where: scope, _count: true }),
    prisma.quotationVersion.groupBy({ by: ["statusId"], where: { quotation: { AND: [scope, { opportunity: { customerTypeId: { not: null } } }] } }, _count: true }),
    prisma.quotationVersion.groupBy({ by: ["statusId"], where: { quotation: { AND: [scope, { opportunity: { salesChannelId: { not: null } } }] } }, _count: true }),
    prisma.quotationApprovalRequest.groupBy({ by: ["status"], where: { quotationVersion: { quotation: scope } }, _count: true }),
  ]);
  return { quotationSummary: summary, pricingPolicyUsage: policy, salesOfficerPerformance: owner,
    territoryPerformance: territory, customerTypePerformance: customerType, salesChannelPerformance: channel, approvalSummary: approvals };
}
