import type { PrismaClient } from "@prisma/client";

export type AnalyticsPortal =
  | "founder-admin"
  | "company-admin"
  | "accounts"
  | "sales-manager"
  | "sales-executive"
  | "distributor"
  | "super-stockist";
export type AnalyticsScopePortal = AnalyticsPortal | "retailer";

export async function analyticsScope(
  prisma: PrismaClient,
  userId: string,
  portal: AnalyticsScopePortal,
) {
  if (["founder-admin", "company-admin", "accounts"].includes(portal))
    return {
      employeeIds: null as string[] | null,
      partyIds: null as string[] | null,
      retailerIds: null as string[] | null,
    };
  if (portal === "sales-executive")
    return { employeeIds: [userId], partyIds: null, retailerIds: null };
  if (portal === "sales-manager") {
    const assignments = await prisma.seeraAssignment.findMany({
      where: {
        targetId: userId,
        assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
    });
    return {
      employeeIds: [
        userId,
        ...assignments.map((assignment) => assignment.subjectId),
      ],
      partyIds: null,
      retailerIds: null,
    };
  }
  if (portal === "retailer") {
    const assignments = await prisma.seeraAssignment.findMany({
      where: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: userId,
        targetType: "RETAILER",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { targetId: true },
    });
    return {
      employeeIds: null,
      partyIds: [] as string[],
      retailerIds: assignments.map((assignment) => assignment.targetId),
    };
  }
  const links = await prisma.seeraPartyUser.findMany({
    where: {
      userId,
      active: true,
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    select: { partnerId: true },
  });
  return {
    employeeIds: null,
    partyIds: links.map((link) => link.partnerId),
    retailerIds: null,
  };
}
