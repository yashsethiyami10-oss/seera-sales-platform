import { prisma } from "@/lib/prisma";
import { inquiryScope } from "./repository";

export async function getChannelReport(from?: Date, to?: Date) {
  const scope = await inquiryScope();
  const where = { AND: [scope, from || to ? { createdAt: { gte: from, lte: to } } : {}] };
  const [total, byChannel, bySource, byPriority, byStatus, pendingFollowUps] = await Promise.all([
    prisma.salesInquiry.count({ where }),
    prisma.salesInquiry.groupBy({ by: ["salesChannelId"], where, _count: true }),
    prisma.salesInquiry.groupBy({ by: ["leadSourceId"], where, _count: true }),
    prisma.salesInquiry.groupBy({ by: ["priority"], where, _count: true }),
    prisma.salesInquiry.groupBy({ by: ["statusId"], where, _count: true }),
    prisma.salesFollowUpTask.count({ where: { status: "PENDING", inquiry: scope } }),
  ]);
  return { total, byChannel, bySource, byPriority, byStatus, pendingFollowUps };
}
