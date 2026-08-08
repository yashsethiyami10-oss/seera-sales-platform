import { prisma } from "@/lib/prisma";
import { inquiryScope } from "./repository";

export async function getSalesDashboardMetrics() {
  const scope = await inquiryScope();
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const pendingCodes = ["NEW", "ASSIGNMENT_PENDING", "ASSIGNED", "CONTACT_ATTEMPTED", "CONTACTED", "QUALIFIED", "IN_PROGRESS"];
  const count = (extra = {}) => prisma.salesInquiry.count({ where: { AND: [scope, extra] } });
  const [total, todayCount, monthCount, pendingAssignment, highPriority, pendingFollowUps, pendingResponses, dealer, distributor, franchise, samples, quotations, bulk, institutional, recent, upcoming] = await Promise.all([
    count(), count({ createdAt: { gte: today } }), count({ createdAt: { gte: month } }),
    count({ assignedOwnerId: null }), count({ priority: { in: ["HIGH", "URGENT"] }, status: { code: { in: pendingCodes } } }),
    prisma.salesFollowUpTask.count({ where: { status: "PENDING", inquiry: scope } }),
    count({ firstResponseAt: null, responseSlaAt: { not: null }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "DEALER_APPLICATION" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "DISTRIBUTOR_APPLICATION" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "FRANCHISE_INQUIRY" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "SAMPLE_REQUEST" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "QUOTATION_REQUEST" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "BULK_ORDER" }, status: { code: { in: pendingCodes } } }),
    count({ salesChannel: { code: "INSTITUTIONAL_SALES" }, status: { code: { in: pendingCodes } } }),
    prisma.salesTimelineEvent.findMany({ where: { inquiry: scope }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.salesFollowUpTask.findMany({ where: { status: "PENDING", inquiry: scope }, orderBy: { dueAt: "asc" }, take: 8 }),
  ]);
  return {
    cards: [
      ["Total Inquiries", total], ["Today's Inquiries", todayCount], ["This Month's Inquiries", monthCount],
      ["Pending Assignment", pendingAssignment], ["Pending Follow-ups", pendingFollowUps], ["Pending Responses", pendingResponses],
      ["High Priority Inquiries", highPriority], ["Dealer Applications Pending", dealer],
      ["Distributor Applications Pending", distributor], ["Franchise Applications Pending", franchise],
      ["Sample Requests Pending", samples], ["Quotation Requests Pending", quotations],
      ["Bulk Orders Pending", bulk], ["Institutional Pipeline", institutional],
    ] as Array<[string, number]>,
    recent, upcoming,
  };
}
