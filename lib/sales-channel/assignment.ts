import type { Prisma, SalesInquiryPriority } from "@prisma/client";

export async function resolveAssignment(
  tx: Prisma.TransactionClient,
  channel: { id: string; defaultOwnerRoleId: string | null; defaultAssignmentQueueId: string | null },
  territoryId?: string,
) {
  const queue = channel.defaultAssignmentQueueId
    ? await tx.assignmentQueue.findFirst({ where: { id: channel.defaultAssignmentQueueId, active: true } })
    : await tx.assignmentQueue.findFirst({ where: { channelId: channel.id, active: true }, orderBy: { createdAt: "asc" } });
  const owner = channel.defaultOwnerRoleId
    ? await tx.user.findFirst({ where: { salesRoleId: channel.defaultOwnerRoleId, territoryId: territoryId ?? undefined, active: true }, orderBy: { createdAt: "asc" } })
    : null;
  return { queue, owner, territoryId: territoryId ?? queue?.territoryId ?? null };
}

export function resolvePriority(channelCode: string, detail: Record<string, unknown>): SalesInquiryPriority {
  const urgentDate = typeof detail.requiredDate === "string" && Date.parse(detail.requiredDate) - Date.now() < 3 * 86400000;
  if (urgentDate) return "URGENT";
  if (["DISTRIBUTOR_APPLICATION", "DEALER_APPLICATION", "FRANCHISE_INQUIRY"].includes(channelCode)) return "HIGH";
  const volume = Number(detail.estimatedBudget ?? detail.investmentCapacity ?? 0);
  return volume >= 100000 ? "HIGH" : "NORMAL";
}
