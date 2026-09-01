import type { Prisma, PrismaClient, VisitOutcome } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { assertJointWorkAttribution, eligibleDelivered, salesAttribution } from "./business-rules";
import { deliveredValueForPeriod, createRetailer, findSimilarRetailers, capturePhoto } from "./field-portal-service";
import { canonicalDistributorExposure, creditPositionFor } from "./credit-service";
import { inventoryPosition } from "./business-rules";
import { placeRetailerOrder } from "./workflow-service";
import { recordGpsSample } from "./field-travel-service";
import { wholesaleOrderUnitToCanonicalPieces } from "./company-order-catalog";
import { queuePartnerVisitCommunicationSafe } from "./partner-communication-service";
import { isCompanyDirectEligible, distributorsForEmployeeIds } from "./scope";

async function managerTeamEmployeeIds(db: PrismaClient, managerId: string) {
  const assignments = await db.seeraAssignment.findMany({
    where: {
      assignmentType: { in: ["MANAGER_TEAM", "TEAM"] },
      targetId: managerId,
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    select: { subjectId: true },
  });
  return [managerId, ...assignments.map((a) => a.subjectId)];
}

export async function createManagerInstruction(
  db: PrismaClient,
  managerId: string,
  input: {
    assignedEmployeeId: string;
    title: string;
    body: string;
    priority?: "NORMAL" | "HIGH";
    dueAt?: Date;
  },
) {
  await authorize(db, { actorId: managerId, permission: "manager_instruction:manage" });
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  if (!employeeIds.includes(input.assignedEmployeeId))
    throw new FoundationError("EMPLOYEE_SCOPE_DENIED", "Executive is outside Manager scope", 403);
  if (!input.title.trim() || !input.body.trim())
    throw new FoundationError("INSTRUCTION_CONTENT_REQUIRED", "Title and body are required", 400);
  const instruction = await db.seeraManagerInstruction.create({
    data: {
      managerId,
      assignedEmployeeId: input.assignedEmployeeId,
      title: input.title.trim(),
      body: input.body.trim(),
      priority: input.priority ?? "NORMAL",
      dueAt: input.dueAt,
    },
  });
  // Stage 8 fix: "Manager Instruction" is an explicitly named Executive notification trigger, but
  // creating a SeeraManagerInstruction row never actually notified the assigned Executive — no
  // individual-USER notification producer existed anywhere in this file (notifyPartyUsers only
  // targets PARTY members — Distributor/S.S. — never a single employee). Direct
  // db.notification.create mirrors notifyPartyUsers's own pattern (a system-triggered side effect
  // of an already-authorized action, not a raw notification request, so createNotification's
  // Admin-only notifications:manage gate correctly does not apply here).
  const recipient = await db.user.findUnique({ where: { id: input.assignedEmployeeId, status: "ACTIVE" }, select: { id: true } });
  if (recipient)
    await db.notification.create({
      data: {
        recipientId: recipient.id,
        type: "MANAGER_INSTRUCTION",
        title: input.title.trim(),
        body: input.body.trim(),
        priority: input.priority === "HIGH" ? "HIGH" : "NORMAL",
        entityType: "SeeraManagerInstruction",
        entityId: instruction.id,
        payload: { actionPath: "/portal/sales-executive/instructions" },
      },
    });
  return instruction;
}

export async function correctAttendance(
  db: PrismaClient,
  managerId: string,
  workSessionId: string,
  input: {
    status?: "ACTIVE" | "ENDED" | "CANCELLED";
    endedAt?: Date;
    outcome?: string;
    remarks?: string;
    reason: string;
  },
) {
  await authorize(db, { actorId: managerId, permission: "network:manage" });
  if (!input.reason.trim())
    throw new FoundationError("ATTENDANCE_CORRECTION_REASON_REQUIRED", "A correction reason is required", 400);
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  return db.$transaction(async (tx) => {
    const session = await tx.seeraWorkSession.findFirst({
      where: { id: workSessionId, employeeId: { in: employeeIds } },
    });
    if (!session)
      throw new FoundationError("ATTENDANCE_SCOPE_DENIED", "Work day is outside your team's scope", 403);
    const beforeState = {
      status: session.status,
      endedAt: session.endedAt,
      outcome: session.outcome,
      remarks: session.remarks,
    };
    const updated = await tx.seeraWorkSession.update({
      where: { id: session.id },
      data: {
        status: input.status ?? session.status,
        endedAt: input.endedAt ?? session.endedAt,
        outcome: input.outcome ?? session.outcome,
        remarks: input.remarks ?? session.remarks,
      },
    });
    await recordAudit(tx, {
      actorId: managerId,
      action: "attendance.corrected",
      entityType: "SeeraWorkSession",
      entityId: session.id,
      beforeState: beforeState as Prisma.InputJsonValue,
      afterState: {
        status: updated.status,
        endedAt: updated.endedAt,
        outcome: updated.outcome,
        remarks: updated.remarks,
        reason: input.reason.trim(),
      },
      reason: input.reason.trim(),
    });
    return updated;
  });
}

// Any active Manager field day can check in to a retailer or partner — the day's declared
// workingType (Retailing, Distributor Visit, Market Development, ...) is reporting metadata, not a
// gate on what a Manager may actually do once in the field.
async function activeManagerFieldSession(db: PrismaClient, managerId: string) {
  const session = await db.seeraWorkSession.findFirst({
    where: {
      employeeId: managerId,
      employeeRole: "SALES_MANAGER",
      status: "ACTIVE",
    },
  });
  if (!session)
    throw new FoundationError(
      "MANAGER_RETAILING_SESSION_REQUIRED",
      "Active Manager field session required",
      409,
    );
  return session;
}

// Manager Own Retailing may either check in to an EXISTING retailer already in the Manager's own
// or team scope, or — matching the Executive's Add Customer parity requirement — create a brand
// new retailer on the spot via createRetailer (same function, same UNPLANNED_FIELD_ADDED source,
// same immediate-usability guarantee) and check in to it in one call.
export async function managerRetailerCheckIn(
  db: PrismaClient,
  managerId: string,
  input: {
    workSessionId: string;
    retailerId?: string;
    newRetailer?: {
      businessName: string;
      address: Record<string, unknown>;
      ownerName?: string;
      mobile?: string;
      alternateMobile?: string;
      pincode?: string;
      customerType?: string;
      gstin?: string;
      distributorId?: string;
      notes?: string;
      confirmDuplicate?: boolean;
    };
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsExceptionReason?: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, {
    actorId: managerId,
    permission: "manager_field:operate",
  });
  const session = await activeManagerFieldSession(db, managerId);
  let retailer;
  if (input.newRetailer) {
    retailer = await createRetailer(db, managerId, {
      ...input.newRetailer,
      customerType: input.newRetailer.customerType as
        | "RETAILER"
        | "WHOLESALER"
        | "DISTRIBUTOR_PROSPECT"
        | "INSTITUTIONAL_OTHER"
        | undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      idempotencyKey: `${input.idempotencyKey}-retailer`,
    });
  } else {
    if (!input.retailerId)
      throw new FoundationError("RETAILER_REQUIRED", "Choose a retailer or add a new one", 400);
    const team = await db.seeraAssignment.findMany({
      where: {
        assignmentType: "MANAGER_TEAM",
        targetId: managerId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { subjectId: true },
    });
    const found = await db.seeraRetailer.findFirst({
      where: {
        id: input.retailerId,
        lifecycle: "ACTIVE",
        salespersonId: { in: [managerId, ...team.map((x) => x.subjectId)] },
      },
    });
    if (!found)
      throw new FoundationError(
        "RETAILER_SCOPE_DENIED",
        "Retailer unavailable in Manager scope",
        403,
      );
    retailer = found;
  }
  const open = await db.seeraVisit.findFirst({
    where: { workSession: { employeeId: managerId }, checkedOutAt: null },
  });
  if (open && open.retailerId !== retailer.id)
    throw new FoundationError("OPEN_VISIT_EXISTS", "Checkout the current retailer first", 409);
  const visit = await db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      retailerId: retailer.id,
      checkedInAt: new Date(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      checkInAccuracy: input.accuracy,
      gpsExceptionReason: input.gpsExceptionReason,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordGpsSample(db, {
    employeeId: managerId,
    workSessionId: session.id,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    source: "CHECK_IN",
    trackingStatus: input.gpsExceptionReason ? "EXCEPTION" : input.latitude != null ? "OK" : "UNAVAILABLE",
  });
  return visit;
}
export async function managerRetailerCheckOut(
  db: PrismaClient,
  managerId: string,
  visitId: string,
  input: {
    outcome:
      | "ORDER_BOOKED"
      | "NO_ORDER"
      | "FOLLOW_UP"
      | "COLLECTION"
      | "MARKET_INTELLIGENCE";
    noOrderReason?: string;
    followUpAt?: Date;
    notes?: string;
    photoExceptionReason?: string;
    routeDeviationReason?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  },
) {
  await authorize(db, {
    actorId: managerId,
    permission: "manager_field:operate",
  });
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      workSession: { employeeId: managerId, status: "ACTIVE" },
      checkedOutAt: null,
    },
  });
  if (!visit)
    throw new FoundationError(
      "VISIT_SCOPE_DENIED",
      "Active Manager visit unavailable",
      403,
    );
  if (input.outcome === "NO_ORDER" && !input.noOrderReason)
    throw new FoundationError(
      "NO_ORDER_REASON_REQUIRED",
      "No-order reason required",
      400,
    );
  const outcome: VisitOutcome =
    input.outcome === "NO_ORDER"
      ? "NO_ORDER"
      : input.outcome === "FOLLOW_UP"
        ? "FOLLOW_UP"
        : "PRODUCTIVE";
  const updated = await db.seeraVisit.update({
    where: { id: visit.id },
    data: {
      outcome,
      noOrderReason: input.noOrderReason,
      followUpAt: input.followUpAt,
      notes: input.notes,
      photoExceptionReason: input.photoExceptionReason ?? visit.photoExceptionReason,
      routeDeviationReason: input.routeDeviationReason,
      checkedOutAt: new Date(),
    },
  });
  await recordGpsSample(db, {
    employeeId: managerId,
    workSessionId: visit.workSessionId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    source: "CHECK_OUT",
    trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
  });
  return updated;
}

// Distributor/S.S. can be picked from the existing ACTIVE partner master, OR — where that master
// is incomplete — the Manager can add one on the spot. A field-added party is created as a
// SeeraProspect (not a full commercial SeeraPartner: billing profile, credit terms, and Partner
// code assignment are deliberately a governed master-data step, not something a field visit screen
// should fabricate) and is immediately visitable via SeeraVisit.prospectId; it later "Activates"
// into a real Partner through the Distributor Search CRM's link-to-partner step.
export async function managerPartnerCheckIn(
  db: PrismaClient,
  managerId: string,
  input: {
    workSessionId: string;
    partnerType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partnerId?: string;
    newParty?: { businessName: string; area: string; geographyType?: string; contactPerson?: string; mobile?: string; notes?: string };
    purpose: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsExceptionReason?: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId: managerId, permission: "manager_field:operate" });
  const session = await activeManagerFieldSession(db, managerId);
  let partnerId: string | undefined;
  let prospectId: string | undefined;
  if (input.newParty) {
    const prospect = await createDistributorProspect(db, managerId, {
      prospectType: input.partnerType,
      businessName: input.newParty.businessName,
      mobile: input.newParty.mobile ?? "0000000000",
      geographyType: input.newParty.geographyType,
      notes: [input.newParty.area, input.newParty.contactPerson ? `Contact: ${input.newParty.contactPerson}` : null, input.newParty.notes]
        .filter(Boolean)
        .join(" · "),
      profile: { area: input.newParty.area, source: "MANAGER_FIELD_VISIT" },
    });
    prospectId = prospect.id;
  } else {
    if (!input.partnerId) throw new FoundationError("PARTNER_REQUIRED", "Choose a partner or add a new one", 400);
    const partner = await db.seeraPartner.findFirst({
      where: { id: input.partnerId, type: input.partnerType, lifecycle: "ACTIVE" },
    });
    if (!partner) throw new FoundationError("PARTNER_SCOPE_DENIED", "Partner unavailable", 403);
    partnerId = partner.id;
  }
  const visit = await db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      partnerId,
      prospectId,
      partnerType: input.partnerType,
      checkedInAt: new Date(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      checkInAccuracy: input.accuracy,
      gpsExceptionReason: input.gpsExceptionReason,
      partnerVisitPurpose: input.purpose,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await recordGpsSample(db, {
    employeeId: managerId,
    workSessionId: session.id,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    source: "CHECK_IN",
    trackingStatus: input.gpsExceptionReason ? "EXCEPTION" : input.latitude != null ? "OK" : "UNAVAILABLE",
  });
  return visit;
}

export async function managerPartnerCheckOut(
  db: PrismaClient,
  managerId: string,
  visitId: string,
  input: {
    outcome: "PRODUCTIVE" | "FOLLOW_UP" | "NO_ORDER";
    notes?: string;
    nextAction?: string;
    followUpAt?: Date;
    photoExceptionReason?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  },
) {
  await authorize(db, { actorId: managerId, permission: "manager_field:operate" });
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      OR: [{ partnerId: { not: null } }, { prospectId: { not: null } }],
      workSession: { employeeId: managerId, status: "ACTIVE" },
      checkedOutAt: null,
    },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Active Manager partner visit unavailable", 403);
  // Photo is mandatory by default for a Distributor/S.S. visit — same governed-exception pattern
  // as the retailer/Executive visit flow, not a silently-optional field.
  const photoCount = await db.seeraVisitPhoto.count({ where: { visitId: visit.id, deletedAt: null } });
  if (photoCount === 0 && !input.photoExceptionReason && !visit.photoExceptionReason)
    throw new FoundationError("PHOTO_OR_EXCEPTION_REQUIRED", "Add a photo, or record a reason it could not be taken", 400);
  const updated = await db.seeraVisit.update({
    where: { id: visit.id },
    data: {
      outcome: input.outcome,
      notes: input.notes,
      nextAction: input.nextAction,
      followUpAt: input.followUpAt,
      photoExceptionReason: input.photoExceptionReason ?? visit.photoExceptionReason,
      checkedOutAt: new Date(),
    },
  });
  await recordGpsSample(db, {
    employeeId: managerId,
    workSessionId: visit.workSessionId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    source: "CHECK_OUT",
    trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
  });
  // Distributor/S.S. visit-completed WhatsApp trigger (Founder WhatsApp integration audit,
  // requirements 3-4) — queued strictly AFTER the visit is durably checked out above, never
  // before/inside it, and via the never-throws Safe wrapper so a queuing hiccup can never turn
  // an already-successful visit checkout into a user-visible failure. Only for a real Partner
  // (visit.partnerId) — a prospect-only visit (visit.prospectId, no partnerId yet) has no
  // WhatsApp-reachable business contact to notify.
  if (visit.partnerId && (visit.partnerType === "DISTRIBUTOR" || visit.partnerType === "SUPER_STOCKIST")) {
    try {
      await queuePartnerVisitCommunicationSafe(db, {
        partnerId: visit.partnerId,
        partnerType: visit.partnerType,
        visitId: visit.id,
        actorId: managerId,
      });
    } catch (error) {
      console.error("partner_communication.queue_failed", error);
    }
  }
  return updated;
}

export async function managerBookRetailerOrder(
  db: PrismaClient,
  managerId: string,
  input: {
    visitId: string;
    lines: { skuId: string; quantity: number; rate?: number }[];
    commercialPaymentType?: "CASH" | "CREDIT";
    notes?: string;
    photoExceptionReason?: string;
    routeDeviationReason?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    idempotencyKey: string;
  },
) {
  await authorize(db, {
    actorId: managerId,
    permission: "manager_field:operate",
  });
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: input.visitId,
      workSession: { employeeId: managerId, status: "ACTIVE" },
      checkedOutAt: null,
    },
  });
  if (!visit || !visit.retailerId)
    throw new FoundationError(
      "VISIT_SCOPE_DENIED",
      "Active Manager visit unavailable",
      403,
    );
  if (!input.lines.length)
    throw new FoundationError(
      "ORDER_LINES_REQUIRED",
      "At least one order line is required",
      400,
    );
  const order = await placeRetailerOrder(
    db,
    {
      actorId: managerId,
      sourcePortal: "sales-manager",
      commercialPartyType: "DISTRIBUTOR",
      commercialPartyId: "",
    },
    {
      retailerId: visit.retailerId,
      idempotencyKey: input.idempotencyKey,
      notes: input.notes,
      commercialPaymentType: input.commercialPaymentType,
      lines: input.lines,
    },
  );
  // Booking an order IS the checkout for this visit — it closes the visit itself rather than
  // requiring a separate retailer-check-out call afterward (which would find the visit already
  // closed and reject with VISIT_SCOPE_DENIED). GPS/photo-exception/route-deviation captured on
  // the same checkout screen are folded in here.
  await db.seeraVisit.update({
    where: { id: visit.id },
    data: {
      outcome: "PRODUCTIVE",
      notes: input.notes,
      photoExceptionReason: input.photoExceptionReason ?? visit.photoExceptionReason,
      routeDeviationReason: input.routeDeviationReason,
      checkedOutAt: new Date(),
    },
  });
  await recordGpsSample(db, {
    employeeId: managerId,
    workSessionId: visit.workSessionId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    source: "CHECK_OUT",
    trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
  });
  return order;
}
export async function managerDailyWorking(
  db: PrismaClient,
  managerId: string,
  sessionId: string,
) {
  await authorize(db, {
    actorId: managerId,
    permission: "field_reports:view_self",
  });
  const session = await db.seeraWorkSession.findFirstOrThrow({
    where: { id: sessionId, employeeId: managerId },
    include: { visits: true },
  });
  const orders = await db.seeraSalesOrder.findMany({
    where: {
      actorId: managerId,
      sourcePortal: "sales-manager",
      createdAt: { gte: session.startedAt, lte: session.endedAt ?? new Date() },
    },
  });
  return {
    session,
    visits: session.visits.length,
    bookedSales: orders.reduce((s, order) => s + Number(order.total), 0),
    managerAttributionOnly: true,
  };
}

// Richer End Day recap for the Manager's OWN field day — everything the Founder asked End Day to
// show before the session is closed: work type(s), who they worked jointly with, retailer vs.
// partner visits, own orders, photos, follow-ups, and (once End Day has actually run and
// recomputed it) GPS distance. Distinct from managerDailyWorking above (kept unchanged for
// backward compatibility with existing callers) and from managerDsrRollup (team-wide, not a
// pre-close-day recap).
export async function managerEndDaySummary(db: PrismaClient, managerId: string, sessionId: string) {
  await authorize(db, { actorId: managerId, permission: "field_reports:view_self" });
  const session = await db.seeraWorkSession.findFirstOrThrow({ where: { id: sessionId, employeeId: managerId } });
  const windowEnd = session.endedAt ?? new Date();
  const [visits, joints, orders, photos, followUps, prospects, estimate] = await Promise.all([
    db.seeraVisit.findMany({ where: { workSessionId: session.id } }),
    db.seeraJointWork.findMany({ where: { managerId, startedAt: { gte: session.startedAt, lte: windowEnd } } }),
    db.seeraSalesOrder.findMany({ where: { actorId: managerId, sourcePortal: "sales-manager", createdAt: { gte: session.startedAt, lte: windowEnd } } }),
    db.seeraVisitPhoto.count({ where: { actorId: managerId, capturedAt: { gte: session.startedAt, lte: windowEnd }, deletedAt: null } }),
    db.seeraFollowUp.findMany({ where: { ownerId: managerId, createdAt: { gte: session.startedAt, lte: windowEnd } } }),
    db.seeraProspect.count({ where: { ownerEmployeeId: managerId, createdAt: { gte: session.startedAt, lte: windowEnd } } }),
    db.seeraTravelEstimate.findUnique({ where: { employeeId_workSessionId: { employeeId: managerId, workSessionId: session.id } } }),
  ]);
  const executiveIds = [...new Set(joints.map((j) => j.salesExecutiveId))];
  const executives = executiveIds.length ? await db.user.findMany({ where: { id: { in: executiveIds } }, select: { id: true, name: true, email: true } }) : [];
  return {
    session,
    workingType: session.workingType,
    executivesWorkedWith: executives.map((e) => e.name ?? e.email),
    retailerVisits: visits.filter((v) => v.retailerId).length,
    distributorVisits: visits.filter((v) => v.partnerType === "DISTRIBUTOR" || (v.prospectId && v.partnerType === "DISTRIBUTOR")).length,
    superStockistVisits: visits.filter((v) => v.partnerType === "SUPER_STOCKIST").length,
    distributorProspects: prospects,
    ordersCount: orders.length,
    bookedValue: orders.reduce((s, o) => s + Number(o.total), 0),
    photos,
    followUps: followUps.length,
    distanceKm: estimate ? Number(estimate.distanceKm) : null,
    notes: session.remarks,
  };
}

const JOINT_WORK_OBJECTIVES = ["COACHING", "TARGET_RECOVERY", "MARKET_DEVELOPMENT", "PRODUCT_PUSH", "PAYMENT_FOLLOW_UP", "RETAILER_RELATIONSHIP", "PERFORMANCE_REVIEW", "OTHER"] as const;

export async function startJointWorking(
  db: PrismaClient,
  managerId: string,
  input: { salesExecutiveId: string; territoryId?: string; beatId?: string; objective: (typeof JOINT_WORK_OBJECTIVES)[number] },
) {
  await authorize(db, {
    actorId: managerId,
    permission: "joint_work:participate",
  });
  const assigned = await db.seeraAssignment.findFirst({
    where: {
      assignmentType: "MANAGER_TEAM",
      subjectId: input.salesExecutiveId,
      targetId: managerId,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  if (!assigned)
    throw new FoundationError(
      "TEAM_SCOPE_DENIED",
      "Sales Executive is outside Manager team scope",
      403,
    );
  const open = await db.seeraJointWork.findFirst({ where: { managerId, endedAt: null } });
  if (open) throw new FoundationError("OPEN_JOINT_WORK_EXISTS", "Close the current joint working session first", 409);
  return db.seeraJointWork.create({
    data: {
      managerId,
      salesExecutiveId: input.salesExecutiveId,
      territoryId: input.territoryId,
      beatId: input.beatId,
      objective: input.objective,
      leadActorId: input.salesExecutiveId,
      startedAt: new Date(),
    },
  });
}

// The Manager never re-enters what the Executive already logged — this reads the Executive's OWN
// visits/orders/photos that fall inside the joint-work time window, so the Manager can see exactly
// what happened together before closing out with only an observation and a coaching note.
// `eligibleDelivered` is the same netting function used everywhere else, so this can never disagree
// with the Executive's own DSR or the team rollup for the same visits.
export async function jointWorkLinkedActivity(db: PrismaClient, managerId: string, jointWorkId: string) {
  await authorize(db, { actorId: managerId, permission: "joint_work:participate" });
  const joint = await db.seeraJointWork.findFirst({ where: { id: jointWorkId, managerId } });
  if (!joint) throw new FoundationError("JOINT_WORK_SCOPE_DENIED", "Joint working session outside Manager scope", 403);
  const windowEnd = joint.endedAt ?? new Date();
  const visits = await db.seeraVisit.findMany({
    where: {
      workSession: { employeeId: joint.salesExecutiveId },
      checkedInAt: { gte: joint.startedAt, lte: windowEnd },
    },
    include: { retailer: { select: { businessName: true } }, photos: { where: { deletedAt: null }, select: { id: true } } },
    orderBy: { checkedInAt: "asc" },
  });
  const retailerIds = visits.map((v) => v.retailerId).filter((x): x is string => Boolean(x));
  const orders = retailerIds.length
    ? await db.seeraSalesOrder.findMany({
        where: { retailerId: { in: retailerIds }, salespersonId: joint.salesExecutiveId, createdAt: { gte: joint.startedAt, lte: windowEnd } },
        include: { lines: true },
      })
    : [];
  const bookedValue = orders.reduce((s, o) => s + Number(o.total), 0);
  const eligibleValue = orders.reduce(
    (s, o) =>
      s +
      o.lines.reduce(
        (ls, line) =>
          ls +
          eligibleDelivered({
            ordered: Number(line.orderedQuantity),
            cancelled: Number(line.cancelledQuantity),
            delivered: Number(line.deliveredQuantity),
            refused: Number(line.refusedQuantity),
            approvedReturn: Number(line.returnedQuantity),
            unitValue: Number(line.priceSnapshot),
          }).value,
        0,
      ),
    0,
  );
  return {
    joint,
    shopsVisited: visits.length,
    productive: visits.filter((v) => v.outcome === "PRODUCTIVE").length,
    orders: orders.length,
    bookedValue,
    eligibleDeliveredValue: eligibleValue,
    photos: visits.reduce((s, v) => s + v.photos.length, 0),
    followUpsDue: visits.filter((v) => v.followUpAt != null).length,
    exceptions: visits.filter((v) => v.gpsExceptionReason || v.photoExceptionReason || v.routeDeviationReason).length,
    rows: visits.map((v) => ({
      visitId: v.id,
      shop: v.retailer?.businessName ?? "Retailer",
      outcome: v.outcome,
      checkedInAt: v.checkedInAt,
      photos: v.photos.length,
    })),
  };
}

export async function closeJointWorking(
  db: PrismaClient,
  managerId: string,
  jointWorkId: string,
  input: {
    observations: string;
    coaching: string;
  },
) {
  await authorize(db, {
    actorId: managerId,
    permission: "joint_work:participate",
  });
  const joint = await db.seeraJointWork.findFirstOrThrow({
    where: { id: jointWorkId, managerId, endedAt: null },
  });
  const attribution = assertJointWorkAttribution({
    visitId: joint.id,
    primarySalesExecutiveId: joint.salesExecutiveId,
    participants: [joint.salesExecutiveId, managerId],
  });
  const updated = await db.seeraJointWork.update({
    where: { id: joint.id },
    data: {
      endedAt: new Date(),
      observations: input.observations,
      coaching: input.coaching,
      outcome: JSON.stringify(attribution),
    },
  });
  await recordAudit(db, { actorId: managerId, action: "joint_work.closed", entityType: "SeeraJointWork", entityId: joint.id });
  return { ...updated, creditedEmployeeId: attribution.creditedEmployeeId };
}

const PROSPECT_STAGES = ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP", "EVALUATION", "APPROVAL", "ACTIVATED", "NOT_INTERESTED"] as const;

// Same shape/purpose as findSimilarRetailers — a mobile OR business-name match against any
// prospect not already REJECTED/ACTIVATED, so the create screen can offer Open Existing /
// Update Existing / Cancel instead of silently logging a second row for the same lead.
export async function findSimilarProspects(db: PrismaClient, input: { businessName: string; mobile?: string }) {
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  return db.seeraProspect.findMany({
    where: {
      status: { notIn: ["REJECTED", "ACTIVE"] },
      OR: [
        ...(normalizedMobile ? [{ normalizedMobile }] : []),
        { businessName: { equals: input.businessName, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, businessName: true, normalizedMobile: true, stage: true, ownerEmployeeId: true },
    take: 5,
  });
}

export async function createDistributorProspect(
  db: PrismaClient,
  managerId: string,
  input: {
    businessName: string;
    mobile: string;
    alternateMobile?: string;
    areaId?: string;
    geographyType?: string;
    existingBrands?: string;
    expectedVolume?: string;
    sampleGiven?: boolean;
    sampleDetails?: string;
    notes?: string;
    profile: Record<string, unknown>;
    followUpAt?: Date;
    prospectType?: "DISTRIBUTOR" | "SUPER_STOCKIST";
    confirmDuplicate?: boolean;
  },
) {
  await authorize(db, { actorId: managerId, permission: "prospect:create" });
  const normalizedMobile = input.mobile.replace(/\D/g, "");
  if (normalizedMobile.length < 10)
    throw new FoundationError("INVALID_MOBILE", "Valid mobile required", 400);
  if (!input.businessName.trim())
    throw new FoundationError("BUSINESS_NAME_REQUIRED", "Business name is required", 400);
  if (!input.confirmDuplicate) {
    const similar = await findSimilarProspects(db, { businessName: input.businessName, mobile: input.mobile });
    if (similar.length)
      throw new FoundationError(
        "SIMILAR_PROSPECT_EXISTS",
        "A similar prospect already exists — open it, update it, or confirm to save anyway",
        409,
        { similar },
      );
  }
  let prospect;
  try {
    prospect = await db.seeraProspect.create({
      data: {
        prospectType: input.prospectType ?? "DISTRIBUTOR",
        businessName: input.businessName.trim(),
        normalizedMobile,
        alternateMobile: input.alternateMobile,
        areaId: input.areaId,
        geographyType: input.geographyType,
        existingBrands: input.existingBrands,
        expectedVolume: input.expectedVolume,
        sampleGiven: input.sampleGiven,
        sampleDetails: input.sampleDetails,
        notes: input.notes?.trim() || undefined,
        profile: input.profile as Prisma.InputJsonValue,
        followUpAt: input.followUpAt,
        ownerEmployeeId: managerId,
        status: "PROSPECT",
        stage: "NEW",
      },
    });
  } catch (error) {
    // A field rep re-submitting the exact same firm name + mobile (double-tap, or genuinely
    // re-visiting a prospect they forgot they'd already logged) previously surfaced as a raw
    // Prisma P2002 -> generic "An internal error occurred" (Founder UAT, 2026-08-10). Give it a
    // real, actionable message instead of hiding the cause.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
      throw new FoundationError(
        "PROSPECT_ALREADY_EXISTS",
        "A prospect with this business name and mobile number is already logged",
        409,
      );
    throw error;
  }
  await recordAudit(db, {
    actorId: managerId,
    action: "distributor_prospect.created",
    entityType: "SeeraProspect",
    entityId: prospect.id,
    afterState: { businessName: prospect.businessName, stage: prospect.stage },
  });
  return prospect;
}
export async function updateDistributorProspect(
  db: PrismaClient,
  managerId: string,
  prospectId: string,
  input: {
    stage: (typeof PROSPECT_STAGES)[number];
    interest?: string;
    recommendation?: string;
    notes?: string;
    followUpAt?: Date;
  },
) {
  await authorize(db, { actorId: managerId, permission: "prospect:create" });
  const prospect = await db.seeraProspect.findFirst({
    where: { id: prospectId, ownerEmployeeId: managerId },
  });
  if (!prospect)
    throw new FoundationError(
      "PROSPECT_SCOPE_DENIED",
      "Prospect outside Manager scope",
      403,
    );
  if (!PROSPECT_STAGES.includes(input.stage))
    throw new FoundationError("INVALID_PROSPECT_STAGE", "Invalid prospect stage", 400);
  const status =
    input.stage === "ACTIVATED"
      ? "ACTIVE"
      : input.stage === "NOT_INTERESTED"
        ? "REJECTED"
        : input.stage === "EVALUATION" || input.stage === "APPROVAL"
          ? "UNDER_REVIEW"
          : "PROSPECT";
  const updated = await db.seeraProspect.update({
    where: { id: prospect.id },
    data: {
      status,
      stage: input.stage,
      followUpAt: input.followUpAt,
      notes: input.notes?.trim() || prospect.notes,
      profile: {
        ...(prospect.profile as object),
        interest: input.interest,
        recommendation: input.recommendation,
      },
    },
  });
  await recordAudit(db, {
    actorId: managerId,
    action: "distributor_prospect.stage_changed",
    entityType: "SeeraProspect",
    entityId: prospect.id,
    beforeState: { stage: prospect.stage, status: prospect.status },
    afterState: { stage: updated.stage, status: updated.status },
  });
  return updated;
}

// Once a prospect is genuinely ready (stage ACTIVATED), link it to a real, already-onboarded
// Partner record. This is deliberately a LINK, not a creation — a new commercial Partner (billing
// profile, credit terms, Partner code) is a governed master-data action outside this remediation's
// scope; the Manager here is only recording that this lead became that already-existing party.
export async function activateDistributorProspect(
  db: PrismaClient,
  managerId: string,
  prospectId: string,
  partnerId: string,
) {
  await authorize(db, { actorId: managerId, permission: "prospect:create" });
  const prospect = await db.seeraProspect.findFirst({ where: { id: prospectId, ownerEmployeeId: managerId } });
  if (!prospect) throw new FoundationError("PROSPECT_SCOPE_DENIED", "Prospect outside Manager scope", 403);
  const partner = await db.seeraPartner.findFirst({ where: { id: partnerId, type: prospect.prospectType as "DISTRIBUTOR" | "SUPER_STOCKIST" } });
  if (!partner) throw new FoundationError("PARTNER_NOT_FOUND", "Partner not found", 404);
  const updated = await db.seeraProspect.update({
    where: { id: prospect.id },
    data: { stage: "ACTIVATED", status: "ACTIVE", approvedPartnerId: partner.id },
  });
  await recordAudit(db, {
    actorId: managerId,
    action: "distributor_prospect.activated",
    entityType: "SeeraProspect",
    entityId: prospect.id,
    afterState: { approvedPartnerId: partner.id },
  });
  return updated;
}

export async function prospectTimeline(db: PrismaClient, managerId: string, prospectId: string) {
  await authorize(db, { actorId: managerId, permission: "prospect:create" });
  const prospect = await db.seeraProspect.findFirst({ where: { id: prospectId, ownerEmployeeId: managerId } });
  if (!prospect) throw new FoundationError("PROSPECT_SCOPE_DENIED", "Prospect outside Manager scope", 403);
  const events = await db.auditLog.findMany({
    where: { entityType: "SeeraProspect", entityId: prospectId },
    orderBy: { occurredAt: "asc" },
  });
  return { prospect, events };
}
export async function managerTeamReadModel(
  db: PrismaClient,
  managerId: string,
) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const assignments = await db.seeraAssignment.findMany({
    where: {
      assignmentType: "MANAGER_TEAM",
      targetId: managerId,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  const employeeIds = assignments.map((item) => item.subjectId);
  const [sessions, visits, orders, targets, prospects, instructions] =
    await Promise.all([
      db.seeraWorkSession.findMany({
        where: { employeeId: { in: employeeIds } },
      }),
      db.seeraVisit.findMany({
        where: { workSession: { employeeId: { in: employeeIds } } },
      }),
      db.seeraSalesOrder.findMany({
        where: { salespersonId: { in: employeeIds } },
      }),
      db.seeraTarget.findMany({ where: { employeeId: { in: employeeIds } } }),
      db.seeraProspect.findMany({
        where: { ownerEmployeeId: { in: employeeIds } },
      }),
      db.seeraManagerInstruction.findMany({ where: { managerId } }),
    ]);
  return {
    employeeIds,
    attendance: sessions,
    dailyWorking: sessions,
    visits,
    bookedAndDeliveredSales: orders,
    targets,
    prospects,
    followUps: prospects.filter((p) => p.followUpAt),
    instructions,
  };
}

// Executive→Distributor routing foundation (RUN 1 shared-foundation pass): the write-side of the
// "PENDING DISTRIBUTOR ASSIGNMENT" queue `managerDashboardSummary` already surfaces below —
// placeRetailerOrder never guesses a Distributor for an unmapped retailer, so this is the governed
// resolution step a Manager takes once the right Distributor is known. Assigns both the order
// (this one instance) and the retailer (every future order) in the same transaction, exactly like
// a direct retailer→Distributor mapping would have behaved from the start.
export async function assignDistributorToOrder(
  db: PrismaClient,
  managerId: string,
  input: { orderId: string; distributorId: string; reason: string },
) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  if (!input.reason.trim())
    throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required to assign a Distributor", 400);
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  const order = await db.seeraSalesOrder.findFirst({
    where: { id: input.orderId, type: "RETAILER_ORDER", sellerPartnerId: null, salespersonId: { in: employeeIds } },
    include: { retailer: true },
  });
  if (!order) throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED", "Order is not an unassigned order in your team's scope", 403);
  // Widened to include COMPANY_DIRECT (Part B) — a Manager resolving an unassigned order in a
  // hybrid territory (e.g. Manoj Kumar's) must be able to route it to the Founder's own Company
  // Direct party, not only a normal Distributor.
  const distributor = await db.seeraPartner.findFirst({ where: { id: input.distributorId, type: { in: ["DISTRIBUTOR", "COMPANY_DIRECT"] }, lifecycle: "ACTIVE" } });
  if (!distributor) throw new FoundationError("DISTRIBUTOR_NOT_FOUND", "Distributor is unavailable", 404);
  return db.$transaction(async (tx) => {
    const updated = await tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { sellerPartnerId: distributor.id, commercialPartyId: distributor.id },
    });
    if (order.retailerId && !order.retailer?.distributorId)
      await tx.seeraRetailer.update({ where: { id: order.retailerId }, data: { distributorId: distributor.id } });
    await recordAudit(tx, {
      actorId: managerId,
      action: "order.distributor_assigned",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      afterState: { distributorId: distributor.id, reason: input.reason },
    });
    return updated;
  });
}

// Part B (Manoj Kumar hybrid territory): the actual per-retailer mechanism — lets a Manager flip
// one retailer between its normal Distributor and the Company Direct partner, at any time (not
// just reactively off an unassigned order, unlike assignDistributorToOrder above), since
// requirement B is explicitly "this can vary per retailer." Team-scoped the same way as every
// other Manager action in this file.
export async function assignRetailerCommercialParty(
  db: PrismaClient,
  managerId: string,
  input: { retailerId: string; partnerId: string; reason: string },
) {
  await authorize(db, { actorId: managerId, permission: "network:manage" });
  if (!input.reason.trim())
    throw new FoundationError("ASSIGNMENT_REASON_REQUIRED", "A reason is required to reassign a retailer's supplying party", 400);
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  const retailer = await db.seeraRetailer.findFirst({
    where: { id: input.retailerId, salespersonId: { in: employeeIds }, lifecycle: "ACTIVE" },
  });
  if (!retailer) throw new FoundationError("RETAILER_SCOPE_DENIED", "Retailer is outside your team's scope", 403);
  const partner = await db.seeraPartner.findFirst({
    where: { id: input.partnerId, type: { in: ["DISTRIBUTOR", "COMPANY_DIRECT"] }, lifecycle: "ACTIVE" },
  });
  if (!partner) throw new FoundationError("PARTNER_NOT_FOUND", "Supplying party is unavailable", 404);
  // Company Direct governance (GAP-004 addendum): the acting Manager's own eligibility gates this
  // reassignment — a Founder-approved-eligible Manager may route any retailer in their own team's
  // scope to Company Direct; an ineligible Manager cannot, regardless of who owns the retailer.
  if (partner.type === "COMPANY_DIRECT" && !(await isCompanyDirectEligible(db, managerId)))
    throw new FoundationError("COMPANY_DIRECT_NOT_ELIGIBLE", "You are not authorized to assign retailers to Company Direct", 403);
  const updated = await db.seeraRetailer.update({
    where: { id: retailer.id },
    data: { distributorId: partner.id },
  });
  await recordAudit(db, {
    actorId: managerId,
    action: "retailer.commercial_party_reassigned",
    entityType: "SeeraRetailer",
    entityId: retailer.id,
    beforeState: { distributorId: retailer.distributorId },
    afterState: { partnerId: partner.id, partnerType: partner.type, reason: input.reason },
  });
  return updated;
}

// Command-center summary for the Manager's own landing page: Team/Own/Territory sales (never
// double-counted — reuses managerSalesAttribution), who's active/not-started today, and the
// deterministic exception signals a Manager needs to act on. This is a purpose-built read model,
// not a reuse of managerTeamReadModel above (which is an unbounded historical dump, not shaped for
// a "today" view).
export async function managerDashboardSummary(db: PrismaClient, managerId: string, now = new Date()) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = (await managerTeamEmployeeIds(db, managerId)).filter((id) => id !== managerId);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lateCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0);
  // PERFORMANCE: managerSalesAttribution is independent of every other query in this batch (only
  // needs managerId + the date range) but was previously awaited sequentially AFTER this Promise.all
  // resolved — an extra full round trip added to every Manager Dashboard load for no reason other
  // than call order. Running it concurrently here removes that wait.
  const [employees, todaySessions, todayVisits, todayOrders, targets, followUpsOpen, prospectsDue, offlineIssues, unassignedOrders, attribution] = await Promise.all([
    db.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, email: true } }),
    // orderBy is load-bearing: sessionByEmployee (below) is built via `new Map(todaySessions.map(...))`,
    // which keeps the LAST entry per employeeId — an employee can legitimately have more than one
    // session today (e.g. an earlier Distributor Search day already ended, then Retailing started),
    // and without this the map could resolve to a stale ended session instead of the current one,
    // silently wrong-footing both the today.active/ended counters and teamToday's dayStatus.
    db.seeraWorkSession.findMany({ where: { employeeId: { in: employeeIds }, startedAt: { gte: todayStart } }, orderBy: { startedAt: "asc" } }),
    db.seeraVisit.findMany({
      where: { workSession: { employeeId: { in: employeeIds } }, checkedInAt: { gte: todayStart } },
      select: { outcome: true, retailerId: true, retailer: { select: { source: true } } },
    }),
    db.seeraSalesOrder.findMany({ where: { salespersonId: { in: employeeIds }, createdAt: { gte: todayStart } }, include: { lines: true } }),
    db.seeraTarget.findMany({ where: { employeeId: { in: employeeIds }, periodStart: { lte: now }, periodEnd: { gte: now }, metricType: "DELIVERED_VALUE" } }),
    db.seeraFollowUp.findMany({ where: { ownerId: { in: employeeIds }, status: "OPEN" }, select: { dueDate: true } }),
    db.seeraProspect.findMany({ where: { ownerEmployeeId: { in: employeeIds }, followUpAt: { lte: now }, status: { notIn: ["ACTIVE", "REJECTED"] } }, select: { id: true } }),
    db.seeraOfflineOperation.count({ where: { userId: { in: employeeIds }, status: { in: ["FAILED", "CONFLICT"] } } }),
    // Retailer orders booked with no Distributor mapping yet (see placeRetailerOrder's Manager
    // exception, Correction Pass #2 section J) — surfaced here so a Manager/Admin routing workflow
    // can find and assign them; never silently auto-routed to a guessed Distributor.
    db.seeraSalesOrder.findMany({
      where: { type: "RETAILER_ORDER", sellerPartnerId: null, salespersonId: { in: [managerId, ...employeeIds] } },
      select: { id: true, orderNumber: true, total: true, createdAt: true, retailer: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    managerSalesAttribution(db, managerId, { dateFrom: monthStart, dateTo: now }),
  ]);
  // Part B reporting split (COMPANY_DIRECT vs DISTRIBUTOR) — small lookup, only the distinct
  // seller partner ids already present on today's orders.
  const todaySellerPartnerIds = [...new Set(todayOrders.map((o) => o.sellerPartnerId).filter((id): id is string => Boolean(id)))];
  const todaySellerPartners = todaySellerPartnerIds.length
    ? await db.seeraPartner.findMany({ where: { id: { in: todaySellerPartnerIds } }, select: { id: true, type: true } })
    : [];
  const partnerTypeById = new Map(todaySellerPartners.map((p) => [p.id, p.type]));
  const companyDirectValue = todayOrders
    .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "COMPANY_DIRECT")
    .reduce((sum, o) => sum + Number(o.total), 0);
  const distributorValue = todayOrders
    .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "DISTRIBUTOR")
    .reduce((sum, o) => sum + Number(o.total), 0);
  // Distinguish MULTIPLE_DISTRIBUTOR_CANDIDATES from NO_DISTRIBUTOR_MAPPING (Founder decision,
  // RUN 2 shared-foundation residual) via the routing reason placeRetailerOrder recorded — reusing
  // the existing SeeraStatusHistory table rather than a new schema column.
  const routingHistory = unassignedOrders.length
    ? await db.seeraStatusHistory.findMany({
        where: { entityType: "SeeraSalesOrder", entityId: { in: unassignedOrders.map((o) => o.id) }, reason: { startsWith: "MULTIPLE_DISTRIBUTOR_CANDIDATES" } },
        select: { entityId: true, reason: true },
      })
    : [];
  const candidateIdsByOrder = new Map(routingHistory.map((h) => [h.entityId, h.reason.replace("MULTIPLE_DISTRIBUTOR_CANDIDATES:", "").split(",").filter(Boolean)]));
  const allCandidateIds = [...new Set(routingHistory.flatMap((h) => h.reason.replace("MULTIPLE_DISTRIBUTOR_CANDIDATES:", "").split(",").filter(Boolean)))];
  const candidateDistributors = allCandidateIds.length
    ? await db.seeraPartner.findMany({ where: { id: { in: allCandidateIds } }, select: { id: true, legalName: true, tradeName: true } })
    : [];
  const candidateNameById = new Map(candidateDistributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  const sessionByEmployee = new Map(todaySessions.map((s) => [s.employeeId, s]));
  const today = {
    active: 0,
    notStarted: 0,
    late: 0,
    ended: 0,
    planned: todayVisits.filter((v) => v.retailer && v.retailer.source !== "UNPLANNED_FIELD_ADDED").length,
    visited: todayVisits.filter((v) => v.outcome !== "SKIPPED").length,
    productive: todayVisits.filter((v) => v.outcome === "PRODUCTIVE").length,
    orders: todayOrders.length,
    companyDirectValue,
    distributorValue,
    newCustomers: todayVisits.filter((v) => v.retailer?.source === "UNPLANNED_FIELD_ADDED").length,
  };
  for (const e of employees) {
    const session = sessionByEmployee.get(e.id);
    if (!session) {
      today.notStarted += 1;
      if (now > lateCutoff) today.late += 1;
    } else if (session.status === "ENDED") today.ended += 1;
    else today.active += 1;
  }
  const targetValue = targets.reduce((s, t) => s + Number(t.targetValue), 0);
  const monthDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Manager visibility for the "Choose Working Distributor" Start Day context (Founder spec) —
  // reuses the sessionByEmployee lookup already built above for the active/notStarted/ended
  // counters, just also surfacing which Distributor (Firm — Town) each Executive picked today.
  const workingDistributorIds = [...new Set(todaySessions.map((s) => s.workingDistributorId).filter((x): x is string => Boolean(x)))];
  const workingDistributorPartners = workingDistributorIds.length
    ? await db.seeraPartner.findMany({ where: { id: { in: workingDistributorIds } }, select: { id: true, legalName: true, tradeName: true, addresses: true } })
    : [];
  const workingDistributorLabelById = new Map(
    workingDistributorPartners.map((d) => {
      const city = (d.addresses as { city?: string } | null)?.city;
      const firm = d.tradeName ?? d.legalName;
      return [d.id, city ? `${firm} — ${city}` : firm];
    }),
  );
  const teamToday = employees.map((e) => {
    const session = sessionByEmployee.get(e.id);
    return {
      employeeId: e.id,
      employeeName: e.name ?? e.email,
      dayStatus: !session ? ("NOT_STARTED" as const) : session.status === "ENDED" ? ("ENDED" as const) : ("ACTIVE" as const),
      workingType: session?.workingType ?? null,
      workingDistributorId: session?.workingDistributorId ?? null,
      workingDistributorLabel: session?.workingDistributorId ? (workingDistributorLabelById.get(session.workingDistributorId) ?? null) : null,
    };
  });
  return {
    today,
    teamToday,
    // Dashboard reminder fix (cross-portal re-audit): a Manager with zero SeeraAssignment{
    // MANAGER_TEAM} links previously saw every team-scoped screen (Beat Planner, Distributor
    // Oversight, Retailing) go silently empty with no explanation on the landing dashboard itself —
    // directly relevant now that Founder/Admin's "Field force -> Assign Manager" is the only way
    // that link gets created. Surfaced as a plain count; the rendering component turns 0 into a
    // visible attention card rather than requiring the Manager to notice each screen is empty.
    teamSize: employees.length,
    team: attribution.team,
    managerOwn: attribution.managerOwn,
    territory: attribution.territory,
    target: {
      value: targetValue,
      delivered: attribution.territory.eligibleDeliveredValue,
      remaining: Math.max(0, targetValue - attribution.territory.eligibleDeliveredValue),
      achievementPct: targetValue > 0 ? Math.round((attribution.territory.eligibleDeliveredValue / targetValue) * 1000) / 10 : null,
      requiredDailyRunRate: targetValue > 0 ? Math.round(Math.max(0, targetValue - attribution.territory.eligibleDeliveredValue) / Math.max(1, daysInMonth - monthDay)) : 0,
    },
    followUps: { open: followUpsOpen.length, overdue: followUpsOpen.filter((f) => f.dueDate < now).length },
    prospectsDue: prospectsDue.length,
    exceptions: { offlineSyncIssues: offlineIssues },
    unassignedOrders: unassignedOrders.map((o) => {
      const candidateIds = candidateIdsByOrder.get(o.id) ?? [];
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        total: Number(o.total),
        retailerName: o.retailer?.businessName ?? "Retailer",
        createdAt: o.createdAt,
        routingReason: candidateIds.length ? ("MULTIPLE_DISTRIBUTOR_CANDIDATES" as const) : ("NO_DISTRIBUTOR_MAPPING" as const),
        candidateDistributors: candidateIds.map((id) => ({ id, name: candidateNameById.get(id) ?? id })),
      };
    }),
  };
}

// Team-wide DSR rollup — one row per field day (work session), aggregated from the same historical
// sources the Executive's own DSR reads from (visits, orders, collections, follow-ups, photos). Never
// rewrites the original day: "booked" figures are what was recorded that day, and
// "linkedEligibleValue" is a read of whatever delivery/return outcome has since landed against those
// same order lines — a later delivery event changes the link's value, never the historical booked row.
export async function managerDsrRollup(
  db: PrismaClient,
  managerId: string,
  filters: {
    date?: Date;
    employeeId?: string;
    geographyId?: string;
    distributorId?: string;
    skip?: number;
    take?: number;
  } = {},
) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  if (filters.employeeId && !employeeIds.includes(filters.employeeId))
    throw new FoundationError("EMPLOYEE_SCOPE_DENIED", "Executive is outside Manager scope", 403);
  const scopedEmployeeIds = filters.employeeId ? [filters.employeeId] : employeeIds;
  const dayStart = filters.date
    ? new Date(filters.date.getFullYear(), filters.date.getMonth(), filters.date.getDate())
    : undefined;
  const dayEnd = dayStart ? new Date(dayStart.getTime() + 86_400_000) : undefined;
  const distributorSessionIds = filters.distributorId
    ? new Set(
        (
          await db.seeraVisit.findMany({
            where: {
              retailer: { distributorId: filters.distributorId },
              workSession: { employeeId: { in: scopedEmployeeIds } },
            },
            select: { workSessionId: true },
            distinct: ["workSessionId"],
          })
        ).map((v) => v.workSessionId),
      )
    : null;
  const where: Prisma.SeeraWorkSessionWhereInput = {
    employeeId: { in: scopedEmployeeIds },
    ...(dayStart ? { startedAt: { gte: dayStart, lt: dayEnd } } : {}),
    ...(filters.geographyId ? { plannedGeographyId: filters.geographyId } : {}),
    ...(distributorSessionIds ? { id: { in: [...distributorSessionIds] } } : {}),
  };
  const [sessions, total] = await Promise.all([
    db.seeraWorkSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: filters.skip ?? 0,
      take: filters.take ?? 25,
    }),
    db.seeraWorkSession.count({ where }),
  ]);
  const employeeRecords = await db.user.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, name: true, email: true },
  });
  const employeeName = new Map(employeeRecords.map((e) => [e.id, e.name ?? e.email]));

  const rows = await Promise.all(
    sessions.map(async (session) => {
      const sessionDayStart = new Date(
        session.startedAt.getFullYear(),
        session.startedAt.getMonth(),
        session.startedAt.getDate(),
      );
      const sessionDayEnd = new Date(sessionDayStart.getTime() + 86_400_000);
      const orderWindow = { gte: session.startedAt, lte: session.endedAt ?? sessionDayEnd };
      const [visits, plan, orders, collections, newRetailers, prospects, followUps, marketIssues, photoCount, estimate] =
        await Promise.all([
          db.seeraVisit.findMany({
            where: { workSessionId: session.id },
            include: { retailer: { select: { businessName: true, distributorId: true } } },
          }),
          db.seeraJourneyPlan.findFirst({
            where: {
              employeeId: session.employeeId,
              dayOfWeek: session.startedAt.getDay(),
              effectiveFrom: { lte: session.startedAt },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: session.startedAt } }],
            },
            orderBy: { effectiveFrom: "desc" },
          }),
          db.seeraSalesOrder.findMany({
            where: { salespersonId: session.employeeId, createdAt: orderWindow },
            include: { lines: true },
          }),
          db.seeraCollectionEntry.findMany({
            where: { actorId: session.employeeId, collectedAt: { gte: sessionDayStart, lt: sessionDayEnd } },
          }),
          db.seeraRetailer.count({
            where: { salespersonId: session.employeeId, createdAt: { gte: sessionDayStart, lt: sessionDayEnd } },
          }),
          db.seeraProspect.count({
            where: { ownerEmployeeId: session.employeeId, createdAt: { gte: sessionDayStart, lt: sessionDayEnd } },
          }),
          db.seeraFollowUp.count({
            where: { ownerId: session.employeeId, createdAt: { gte: sessionDayStart, lt: sessionDayEnd } },
          }),
          db.seeraMarketIntelligence.count({
            where: {
              actorId: session.employeeId,
              capturedAt: { gte: sessionDayStart, lt: sessionDayEnd },
              marketIssue: { not: null },
            },
          }),
          db.seeraVisitPhoto.count({
            where: { actorId: session.employeeId, capturedAt: { gte: sessionDayStart, lt: sessionDayEnd }, deletedAt: null },
          }),
          db.seeraTravelEstimate.findUnique({
            where: { employeeId_workSessionId: { employeeId: session.employeeId, workSessionId: session.id } },
          }),
        ]);
      const taClaim = estimate
        ? await db.seeraTaClaim.findFirst({
            where: { travelEstimateId: estimate.id },
            orderBy: { createdAt: "desc" },
          })
        : null;
      // Final Master Revision (Beat/Route add-on, 22-Aug) fix: same geography-level mismatch as
      // executiveBeat (field-portal-service.ts) — beatId/territoryId must match the plan's OWN
      // beatId/territoryId (Beat/Territory-level), not its leaf geographyId.
      const planned = plan
        ? await db.seeraRetailer.count({
            where: {
              salespersonId: session.employeeId,
              lifecycle: "ACTIVE",
              OR: [
                ...(plan.beatId ? [{ beatId: plan.beatId }] : []),
                { marketId: plan.geographyId },
                ...(plan.territoryId ? [{ territoryId: plan.territoryId }] : []),
              ],
            },
          })
        : visits.length;
      const distributorIds = [
        ...new Set(visits.map((v) => v.retailer?.distributorId).filter((x): x is string => Boolean(x))),
      ];
      const bookedValue = orders.reduce((sum, o) => sum + Number(o.total), 0);
      const linkedEligibleValue = orders.reduce(
        (sum, o) =>
          sum +
          o.lines.reduce(
            (lineSum, line) =>
              lineSum +
              eligibleDelivered({
                ordered: Number(line.orderedQuantity),
                cancelled: Number(line.cancelledQuantity),
                delivered: Number(line.deliveredQuantity),
                refused: Number(line.refusedQuantity),
                approvedReturn: Number(line.returnedQuantity),
                unitValue: Number(line.priceSnapshot),
              }).value,
            0,
          ),
        0,
      );
      const issues = [
        ...visits.filter((v) => v.gpsExceptionReason).map((v) => `GPS: ${v.gpsExceptionReason}`),
        ...visits.filter((v) => v.skipReason).map((v) => `Skip: ${v.skipReason}`),
        ...visits.filter((v) => v.routeDeviationReason).map((v) => `Route: ${v.routeDeviationReason}`),
        ...visits.filter((v) => v.photoExceptionReason).map((v) => `Photo: ${v.photoExceptionReason}`),
      ];
      return {
        workSessionId: session.id,
        employeeId: session.employeeId,
        employeeName: employeeName.get(session.employeeId) ?? session.employeeId,
        date: sessionDayStart,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
        geographyId: plan?.geographyId ?? session.plannedGeographyId ?? null,
        distributorIds,
        planned,
        visited: visits.filter((v) => v.outcome !== "SKIPPED").length,
        productive: visits.filter((v) => v.outcome === "PRODUCTIVE").length,
        skipped: visits.filter((v) => v.outcome === "SKIPPED").length,
        orders: orders.length,
        bookedValue,
        linkedEligibleValue,
        paymentReferences: collections.length,
        paymentAmount: collections.reduce((sum, c) => sum + Number(c.amount), 0),
        newRetailers,
        prospects,
        photosCaptured: photoCount,
        photoExceptions: visits.filter((v) => v.photoExceptionReason).length,
        followUps,
        marketIssues,
        issues,
        ta: taClaim
          ? { status: taClaim.status, totalClaimed: Number(taClaim.totalClaimed) }
          : null,
      };
    }),
  );
  const geographyIds = [...new Set(rows.map((r) => r.geographyId).filter((x): x is string => Boolean(x)))];
  const allDistributorIds = [...new Set(rows.flatMap((r) => r.distributorIds))];
  const [geographies, distributors] = await Promise.all([
    geographyIds.length
      ? db.seeraGeographyNode.findMany({ where: { id: { in: geographyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    allDistributorIds.length
      ? db.seeraPartner.findMany({
          where: { id: { in: allDistributorIds } },
          select: { id: true, legalName: true, tradeName: true },
        })
      : Promise.resolve([]),
  ]);
  const geographyName = new Map(geographies.map((g) => [g.id, g.name]));
  const distributorName = new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  return {
    total,
    employees: employeeRecords.map((e) => ({ id: e.id, name: e.name ?? e.email })),
    rows: rows.map((row) => ({
      ...row,
      area: row.geographyId ? (geographyName.get(row.geographyId) ?? null) : null,
      distributor:
        row.distributorIds.length === 0
          ? null
          : row.distributorIds.length === 1
            ? (distributorName.get(row.distributorIds[0]!) ?? null)
            : `${row.distributorIds.length} Distributors`,
    })),
  };
}

// Retailer-level drill-down for a single field day, scoped to the Manager's own team — mirrors the
// row shape the Executive sees on their own DSR (executiveDsr in field-portal-service.ts) so the two
// views stay in agreement, without letting a Manager reach into a day outside their team's scope.
export async function managerDsrDetail(db: PrismaClient, managerId: string, workSessionId: string) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  const session = await db.seeraWorkSession.findFirst({
    where: { id: workSessionId, employeeId: { in: employeeIds } },
  });
  if (!session)
    throw new FoundationError("SESSION_SCOPE_DENIED", "Field day outside Manager scope", 403);
  const [visits, followUps] = await Promise.all([
    db.seeraVisit.findMany({
      where: { workSessionId: session.id },
      include: {
        retailer: { select: { businessName: true, mobile: true, distributorId: true } },
        photos: { where: { deletedAt: null } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    db.seeraFollowUp.findMany({
      where: { ownerId: session.employeeId, createdAt: { gte: session.startedAt, lte: session.endedAt ?? new Date() } },
    }),
  ]);
  const retailerIds = visits.map((v) => v.retailerId).filter((x): x is string => Boolean(x));
  const distributorIds = [
    ...new Set(visits.map((v) => v.retailer?.distributorId).filter((x): x is string => Boolean(x))),
  ];
  const [orders, distributors] = await Promise.all([
    retailerIds.length
      ? db.seeraSalesOrder.findMany({
          where: { retailerId: { in: retailerIds }, salespersonId: session.employeeId },
          include: { lines: true },
        })
      : Promise.resolve([]),
    distributorIds.length
      ? db.seeraPartner.findMany({
          where: { id: { in: distributorIds } },
          select: { id: true, legalName: true, tradeName: true },
        })
      : Promise.resolve([]),
  ]);
  const distributorName = new Map(distributors.map((d) => [d.id, d.tradeName ?? d.legalName]));
  return {
    session,
    followUps,
    rows: visits.map((visit) => {
      const order = orders.find((o) => o.retailerId === visit.retailerId);
      const eligible = order
        ? order.lines.reduce(
            (sum, line) =>
              sum +
              eligibleDelivered({
                ordered: Number(line.orderedQuantity),
                cancelled: Number(line.cancelledQuantity),
                delivered: Number(line.deliveredQuantity),
                refused: Number(line.refusedQuantity),
                approvedReturn: Number(line.returnedQuantity),
                unitValue: Number(line.priceSnapshot),
              }).value,
            0,
          )
        : 0;
      return {
        visitId: visit.id,
        shop: visit.retailer?.businessName ?? "Retailer",
        contact: visit.retailer?.mobile ?? null,
        distributor: visit.retailer?.distributorId
          ? (distributorName.get(visit.retailer.distributorId) ?? null)
          : null,
        orderNumber: order?.orderNumber ?? null,
        bookedValue: order ? Number(order.total) : 0,
        outcome: visit.outcome,
        followUpAt: visit.followUpAt,
        linkedDeliveredOutcome: order?.status ?? null,
        linkedEligibleValue: eligible,
        photos: visit.photos.length,
        issue:
          visit.gpsExceptionReason ??
          visit.skipReason ??
          visit.routeDeviationReason ??
          visit.photoExceptionReason ??
          null,
      };
    }),
  };
}

// Rolling 30-day performance scorecard, one row per Executive on the Manager's team — distinct from
// the plain roster ("team" surface item) and from the day-by-day DSR rollup: this is the command-
// center view a Manager actually opens to spot who is falling behind before month-end, not a log of
// individual days.
export async function managerTeamScorecard(db: PrismaClient, managerId: string, now = new Date()) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = (await managerTeamEmployeeIds(db, managerId)).filter((id) => id !== managerId);
  if (!employeeIds.length) return [];
  const periodStart = new Date(now.getTime() - 29 * 86_400_000);
  const [employees, targets, sessions, visits, followUpsOpen, photos, taPending, orders, newRetailers, prospects, estimates] = await Promise.all([
    db.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true, email: true, status: true },
    }),
    db.seeraTarget.findMany({
      where: {
        employeeId: { in: employeeIds },
        periodStart: { lte: now },
        periodEnd: { gte: now },
        metricType: "DELIVERED_VALUE",
      },
    }),
    db.seeraWorkSession.findMany({
      where: { employeeId: { in: employeeIds }, startedAt: { gte: periodStart } },
      select: { id: true, employeeId: true, startedAt: true, status: true },
    }),
    db.seeraVisit.findMany({
      where: { workSession: { employeeId: { in: employeeIds } }, checkedInAt: { gte: periodStart } },
      select: { outcome: true, photoExceptionReason: true, workSession: { select: { employeeId: true } }, retailer: { select: { source: true } }, photos: { where: { deletedAt: null }, select: { id: true } } },
    }),
    db.seeraFollowUp.findMany({
      where: { ownerId: { in: employeeIds }, status: "OPEN" },
      select: { ownerId: true, dueDate: true },
    }),
    db.seeraVisitPhoto.findMany({
      where: { actorId: { in: employeeIds }, capturedAt: { gte: periodStart }, deletedAt: null },
      select: { actorId: true, id: true, secureUrl: true, photoType: true, capturedAt: true },
    }),
    db.seeraTaClaim.findMany({
      where: { employeeId: { in: employeeIds }, status: "SUBMITTED" },
      select: { employeeId: true, totalClaimed: true },
    }),
    db.seeraSalesOrder.findMany({
      where: { salespersonId: { in: employeeIds }, createdAt: { gte: periodStart } },
      include: { lines: true },
    }),
    db.seeraRetailer.findMany({
      where: { salespersonId: { in: employeeIds }, source: "UNPLANNED_FIELD_ADDED", createdAt: { gte: periodStart } },
      select: { salespersonId: true },
    }),
    db.seeraProspect.findMany({
      where: { ownerEmployeeId: { in: employeeIds }, prospectType: "DISTRIBUTOR", createdAt: { gte: periodStart } },
      select: { ownerEmployeeId: true },
    }),
    db.seeraTravelEstimate.findMany({
      where: { employeeId: { in: employeeIds }, estimateDate: { gte: periodStart } },
      select: { employeeId: true, distanceKm: true },
    }),
  ]);
  const targetByEmployee = new Map(targets.map((t) => [t.employeeId, t]));
  const achievedByEmployee = new Map(
    await Promise.all(
      targets.map(
        async (t) => [t.employeeId, await deliveredValueForPeriod(db, t.employeeId, t.periodStart, t.periodEnd)] as const,
      ),
    ),
  );
  const daysWorked = new Map<string, Set<number>>();
  const sessionsEnded = new Map<string, number>();
  for (const s of sessions) {
    const day = new Date(s.startedAt.getFullYear(), s.startedAt.getMonth(), s.startedAt.getDate()).getTime();
    const set = daysWorked.get(s.employeeId);
    if (set) set.add(day);
    else daysWorked.set(s.employeeId, new Set([day]));
    if (s.status === "ENDED") sessionsEnded.set(s.employeeId, (sessionsEnded.get(s.employeeId) ?? 0) + 1);
  }
  const sessionsTotal = new Map<string, number>();
  for (const s of sessions) sessionsTotal.set(s.employeeId, (sessionsTotal.get(s.employeeId) ?? 0) + 1);
  const visitedCount = new Map<string, number>();
  const productiveCount = new Map<string, number>();
  const plannedCount = new Map<string, number>();
  const photoCompliant = new Map<string, number>();
  for (const v of visits) {
    const id = v.workSession.employeeId;
    if (v.outcome !== "SKIPPED") visitedCount.set(id, (visitedCount.get(id) ?? 0) + 1);
    if (v.outcome === "PRODUCTIVE") productiveCount.set(id, (productiveCount.get(id) ?? 0) + 1);
    if (v.retailer && v.retailer.source !== "UNPLANNED_FIELD_ADDED") plannedCount.set(id, (plannedCount.get(id) ?? 0) + 1);
    if (v.photos.length > 0 || v.photoExceptionReason) photoCompliant.set(id, (photoCompliant.get(id) ?? 0) + 1);
  }
  const followUpBacklog = new Map<string, number>();
  const overdueFollowUps = new Map<string, number>();
  for (const f of followUpsOpen) {
    followUpBacklog.set(f.ownerId, (followUpBacklog.get(f.ownerId) ?? 0) + 1);
    if (f.dueDate < now) overdueFollowUps.set(f.ownerId, (overdueFollowUps.get(f.ownerId) ?? 0) + 1);
  }
  const photoEvidence = new Map<string, { id: string; secureUrl: string; photoType: string; capturedAt: Date }[]>();
  const photoCount = new Map<string, number>();
  for (const p of photos) {
    photoCount.set(p.actorId, (photoCount.get(p.actorId) ?? 0) + 1);
    if (p.secureUrl) {
      const list = photoEvidence.get(p.actorId) ?? [];
      if (list.length < 6) list.push({ id: p.id, secureUrl: p.secureUrl, photoType: p.photoType, capturedAt: p.capturedAt });
      photoEvidence.set(p.actorId, list);
    }
  }
  const taPendingCount = new Map<string, number>();
  const taPendingAmount = new Map<string, number>();
  for (const t of taPending) {
    taPendingCount.set(t.employeeId, (taPendingCount.get(t.employeeId) ?? 0) + 1);
    taPendingAmount.set(t.employeeId, (taPendingAmount.get(t.employeeId) ?? 0) + Number(t.totalClaimed));
  }
  const orderCount = new Map<string, number>();
  const bookedValue = new Map<string, number>();
  const eligibleValue = new Map<string, number>();
  const returnedQty = new Map<string, number>();
  const refusedQty = new Map<string, number>();
  for (const o of orders) {
    if (!o.salespersonId) continue;
    orderCount.set(o.salespersonId, (orderCount.get(o.salespersonId) ?? 0) + 1);
    bookedValue.set(o.salespersonId, (bookedValue.get(o.salespersonId) ?? 0) + Number(o.total));
    for (const line of o.lines) {
      const eligible = eligibleDelivered({
        ordered: Number(line.orderedQuantity),
        cancelled: Number(line.cancelledQuantity),
        delivered: Number(line.deliveredQuantity),
        refused: Number(line.refusedQuantity),
        approvedReturn: Number(line.returnedQuantity),
        unitValue: Number(line.priceSnapshot),
      });
      eligibleValue.set(o.salespersonId, (eligibleValue.get(o.salespersonId) ?? 0) + eligible.value);
      returnedQty.set(o.salespersonId, (returnedQty.get(o.salespersonId) ?? 0) + Number(line.returnedQuantity));
      refusedQty.set(o.salespersonId, (refusedQty.get(o.salespersonId) ?? 0) + Number(line.refusedQuantity));
    }
  }
  const newCustomers = new Map<string, number>();
  for (const r of newRetailers) if (r.salespersonId) newCustomers.set(r.salespersonId, (newCustomers.get(r.salespersonId) ?? 0) + 1);
  const prospectCount = new Map<string, number>();
  for (const p of prospects) prospectCount.set(p.ownerEmployeeId, (prospectCount.get(p.ownerEmployeeId) ?? 0) + 1);
  const distance = new Map<string, number>();
  for (const e of estimates) distance.set(e.employeeId, (distance.get(e.employeeId) ?? 0) + Number(e.distanceKm));
  return employees.map((e) => {
    const target = targetByEmployee.get(e.id);
    const achieved = achievedByEmployee.get(e.id) ?? 0;
    const targetValue = Number(target?.targetValue ?? 0);
    const planned = plannedCount.get(e.id) ?? 0;
    const visited = visitedCount.get(e.id) ?? 0;
    const daysCount = daysWorked.get(e.id)?.size ?? 0;
    const sessionsCount = sessionsTotal.get(e.id) ?? 0;
    const elapsedDays = Math.max(1, Math.min(30, Math.ceil((now.getTime() - periodStart.getTime()) / 86_400_000)));
    return {
      employeeId: e.id,
      employeeName: e.name ?? e.email,
      status: e.status,
      daysWorked30: daysCount,
      targetValue,
      achievedValue: achieved,
      achievementPct: targetValue > 0 ? Math.round((achieved / targetValue) * 1000) / 10 : null,
      planned30: planned,
      visited30: visited,
      productive30: productiveCount.get(e.id) ?? 0,
      orders30: orderCount.get(e.id) ?? 0,
      bookedValue30: bookedValue.get(e.id) ?? 0,
      eligibleDeliveredValue30: eligibleValue.get(e.id) ?? 0,
      returnedQty30: returnedQty.get(e.id) ?? 0,
      refusedQty30: refusedQty.get(e.id) ?? 0,
      newCustomers30: newCustomers.get(e.id) ?? 0,
      distributorProspects30: prospectCount.get(e.id) ?? 0,
      followUpBacklog: followUpBacklog.get(e.id) ?? 0,
      overdueFollowUps: overdueFollowUps.get(e.id) ?? 0,
      photos30: photoCount.get(e.id) ?? 0,
      photoEvidence: photoEvidence.get(e.id) ?? [],
      photoCompliancePct: visited > 0 ? Math.round(((photoCompliant.get(e.id) ?? 0) / visited) * 1000) / 10 : null,
      beatCompliancePct: planned > 0 ? Math.round((visited / planned) * 1000) / 10 : null,
      startDayCompliancePct: Math.round((daysCount / elapsedDays) * 1000) / 10,
      endDayCompliancePct: sessionsCount > 0 ? Math.round(((sessionsEnded.get(e.id) ?? 0) / sessionsCount) * 1000) / 10 : null,
      distance30Km: Math.round((distance.get(e.id) ?? 0) * 10) / 10,
      avgProductiveCallsPerDay: daysCount > 0 ? Math.round(((productiveCount.get(e.id) ?? 0) / daysCount) * 10) / 10 : 0,
      taPendingCount: taPendingCount.get(e.id) ?? 0,
      taPendingAmount: taPendingAmount.get(e.id) ?? 0,
    };
  });
}

export type ExecutiveSyncStatus = {
  employeeId: string;
  employeeName: string;
  status: "SYNCED" | "PENDING_SYNC" | "SYNC_ERROR";
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: Date | null;
};

// Per-Executive offline-sync visibility, independent of any activity count. A Manager looking at
// zero visits/orders for an Executive must be able to tell "genuinely did nothing" apart from
// "worked offline and hasn't synced yet" — this reads SeeraOfflineOperation directly rather than
// inferring sync state from whether activity rows already exist (an unsynced visit/order has no
// row at all yet, which is exactly the ambiguity this closes).
export async function teamSyncStatus(db: PrismaClient, managerId: string): Promise<ExecutiveSyncStatus[]> {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = (await managerTeamEmployeeIds(db, managerId)).filter((id) => id !== managerId);
  if (!employeeIds.length) return [];
  const [employees, operations] = await Promise.all([
    db.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, email: true } }),
    db.seeraOfflineOperation.findMany({
      where: { userId: { in: employeeIds } },
      select: { userId: true, status: true, syncedAt: true, updatedAt: true },
    }),
  ]);
  const nameOf = new Map(employees.map((e) => [e.id, e.name ?? e.email]));
  return employeeIds.map((employeeId) => {
    const ops = operations.filter((o) => o.userId === employeeId);
    const pendingCount = ops.filter((o) => o.status === "PENDING" || o.status === "SYNCING").length;
    const failedCount = ops.filter((o) => o.status === "FAILED" || o.status === "CONFLICT").length;
    const lastSyncedAt = ops
      .filter((o) => o.status === "SYNCED" && o.syncedAt)
      .reduce<Date | null>((latest, o) => (!latest || o.syncedAt! > latest ? o.syncedAt! : latest), null);
    return {
      employeeId,
      employeeName: nameOf.get(employeeId) ?? employeeId,
      status: failedCount > 0 ? "SYNC_ERROR" : pendingCount > 0 ? "PENDING_SYNC" : "SYNCED",
      pendingCount,
      failedCount,
      lastSyncedAt,
    };
  });
}

// P1 21-Aug fix (real production incident: Sales Manager AWDHESH KUMAR MISHRA's team has 13
// retailers, ZERO of them mapped to a distributor, but the team's own executive (Neeraj Rawat)
// already holds 10 real, ACTIVE, governed EXECUTIVE_DISTRIBUTOR assignments — the exact same
// M/s Ratan Products & Traders onboarding the Founder asked about). This function previously
// derived "the Manager's authorized distributors" SOLELY from retailer.distributorId mappings, so
// a legitimately-scoped Distributor with zero mapped team retailers was completely invisible in
// Distributor Oversight — not a data gap, a read-model gap. The exact same class of bug (a
// retailer-derived-only distributor scope with no cold-start bootstrap) was already found and
// fixed once for the Sales Executive's own "Choose Working Distributor" (Start Day) scope — see
// scope.ts's executiveAuthorizedDistributors, which unions retailer-derived + direct
// EXECUTIVE_DISTRIBUTOR assignments for exactly this reason. That fix was never propagated to
// Manager Distributor Oversight; this closes that gap the same governed way, reusing the same
// SeeraAssignment relation and the same distributorsForEmployeeIds() helper scope.ts already
// exports (previously duplicated here) — no new table, no new assignment type.
async function mappedDistributorsFor(db: PrismaClient, managerId: string) {
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  const [retailerDerived, directAssignments] = await Promise.all([
    distributorsForEmployeeIds(db, employeeIds),
    db.seeraAssignment.findMany({
      where: { assignmentType: "EXECUTIVE_DISTRIBUTOR", subjectId: { in: employeeIds }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      select: { targetId: true },
    }),
  ]);
  const directIds = [...new Set(directAssignments.map((a) => a.targetId))].filter((id) => !retailerDerived.some((d) => d.id === id));
  const directDerived = directIds.length
    ? await db.seeraPartner.findMany({
        where: { id: { in: directIds }, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
        select: { id: true, legalName: true, tradeName: true, code: true, addresses: true },
      })
    : [];
  return [...retailerDerived, ...directDerived].sort((a, b) => a.legalName.localeCompare(b.legalName));
}

// Distributor-first Collections: the Manager searches/chooses a Distributor mapped to their own
// team's retailers, then sees one canonical outstanding/current/overdue/oldest-due/last-payment/
// promise/credit-status snapshot — the same creditPositionFor() the Distributor's own Credit page
// and the S.S. downstream view use, so this can never disagree with what those screens show.
export async function managerMappedDistributors(db: PrismaClient, managerId: string) {
  await authorize(db, { actorId: managerId, permission: "payment_promise:create" });
  return mappedDistributorsFor(db, managerId);
}

export async function managerDistributorCollectionsSnapshot(
  db: PrismaClient,
  managerId: string,
  distributorId: string,
  now = new Date(),
) {
  await authorize(db, { actorId: managerId, permission: "payment_promise:create" });
  const mapped = await mappedDistributorsFor(db, managerId);
  const distributor = mapped.find((d) => d.id === distributorId);
  if (!distributor)
    throw new FoundationError("DISTRIBUTOR_SCOPE_DENIED", "Distributor is outside this Manager's mapped team", 403);
  const [position, recentLedger] = await Promise.all([
    creditPositionFor(db, distributorId, now),
    db.seeraFinancialEntry.findMany({
      where: {
        status: "POSTED",
        OR: [
          { debitPartyType: "DISTRIBUTOR", debitPartyId: distributorId },
          { creditPartyType: "DISTRIBUTOR", creditPartyId: distributorId },
        ],
      },
      orderBy: { postedAt: "desc" },
      take: 10,
      select: { id: true, type: true, amount: true, debitPartyType: true, creditPartyType: true, postedAt: true, reason: true },
    }),
  ]);
  return {
    distributor,
    ...position,
    recentLedger: recentLedger.map((e) => ({
      id: e.id,
      type: e.type,
      amount: Number(e.amount),
      direction: e.debitPartyType === "DISTRIBUTOR" ? "DEBIT" : "CREDIT",
      postedAt: e.postedAt,
      reason: e.reason,
    })),
  };
}

// Distributor 360 (Founder sections 21-26): a dedicated, read-only, distributor-wise supervisory
// view. Every field below is read directly off the exact same canonical rows the Distributor's own
// portal (and the S.S. portal, for the Distributor's own replenishment orders) writes — the same
// mappedDistributorsFor() scope already used by managerDistributorCollectionsSnapshot, the same
// creditPositionFor() the Money page uses, the same inventoryPosition() ledger math the Stock page
// uses. Nothing here is a duplicate Manager-only record. Manager is supervisory only — this function
// performs no mutation.
export async function managerDistributorSnapshot(db: PrismaClient, managerId: string, distributorId: string, now = new Date()) {
  await authorize(db, { actorId: managerId, permission: "network:manage" });
  const mapped = await mappedDistributorsFor(db, managerId);
  const distributor = mapped.find((d) => d.id === distributorId);
  if (!distributor)
    throw new FoundationError("DISTRIBUTOR_SCOPE_DENIED", "Distributor is outside this Manager's mapped team", 403);
  const [partner, retailerOrders, pendingDeliveries, ssOrders, movements, receivedMovements, skus, returns, claims, position] =
    await Promise.all([
      db.seeraPartner.findUnique({
        where: { id: distributorId },
        select: { legalName: true, tradeName: true, code: true, lifecycle: true, territoryIds: true, updatedAt: true },
      }),
      db.seeraSalesOrder.findMany({
        where: { sellerPartnerId: distributorId, type: "RETAILER_ORDER" },
        select: {
          id: true, orderNumber: true, status: true, total: true, createdAt: true,
          retailer: { select: { businessName: true } },
          lines: { select: { orderedQuantity: true, acceptedQuantity: true, cancelledQuantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.seeraDelivery.findMany({
        where: { status: { in: ["PENDING", "RESCHEDULED"] }, order: { sellerPartnerId: distributorId, type: "RETAILER_ORDER" } },
        select: { id: true, status: true, order: { select: { orderNumber: true, retailer: { select: { businessName: true } } } } },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
      db.seeraSalesOrder.findMany({
        where: { buyerPartnerId: distributorId, type: "DISTRIBUTOR_REPLENISHMENT" },
        select: {
          id: true, orderNumber: true, status: true, total: true, createdAt: true,
          sellerPartner: { select: { legalName: true, tradeName: true } },
          lines: { select: { skuId: true, skuCodeSnapshot: true, dispatchedQuantity: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.seeraInventoryMovement.findMany({
        where: { partyType: "DISTRIBUTOR", partyId: distributorId },
        select: { skuId: true, direction: true, quantity: true },
      }),
      db.seeraInventoryMovement.groupBy({
        by: ["sourceId", "skuId"],
        where: { partyType: "DISTRIBUTOR", partyId: distributorId, sourceType: "IncomingReceipt", direction: "IN" },
        _sum: { quantity: true },
      }),
      db.seeraSku.findMany({ where: { status: "ACTIVE" }, select: { id: true, productName: true, brand: true } }),
      db.seeraReturnRequest.findMany({
        where: { partyType: "DISTRIBUTOR", partyId: distributorId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.seeraClaim.findMany({
        where: { claimantType: "DISTRIBUTOR", claimantId: distributorId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      creditPositionFor(db, distributorId, now),
    ]);
  const territories = partner?.territoryIds.length
    ? await db.seeraGeographyNode.findMany({ where: { id: { in: partner.territoryIds } }, select: { name: true } })
    : [];
  const pendingRetailerOrders = retailerOrders.filter((o) => ["SUBMITTED", "ACKNOWLEDGED", "HELD"].includes(o.status));
  const acceptedCount = retailerOrders.filter((o) => o.status === "ACCEPTED").length;
  const partialCount = retailerOrders.filter((o) => o.status === "PARTIAL_ACCEPTED").length;
  const rejectedCount = retailerOrders.filter((o) => o.status === "REJECTED").length;
  const remainingQtyExceptions = retailerOrders
    .filter((o) => o.status === "PARTIAL_ACCEPTED")
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      retailer: o.retailer?.businessName ?? "Retailer",
      remaining: o.lines.reduce((sum, l) => sum + Math.max(0, Number(l.orderedQuantity) - Number(l.acceptedQuantity) - Number(l.cancelledQuantity)), 0),
    }))
    .filter((o) => o.remaining > 0);
  const movementsBySku = new Map<string, { direction: "IN" | "OUT" | "RESERVE" | "RELEASE"; quantity: number }[]>();
  for (const m of movements) {
    const list = movementsBySku.get(m.skuId) ?? [];
    list.push({ direction: m.direction, quantity: Number(m.quantity) });
    movementsBySku.set(m.skuId, list);
  }
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const receivedFor = (orderId: string, skuId: string) =>
    Number(receivedMovements.find((x) => x.sourceId === orderId && x.skuId === skuId)?._sum.quantity ?? 0);
  // STAGE 12: line.dispatchedQuantity stays in the order's own commercial unit (e.g. Boxes), but
  // receivedFor(...) sums the physical stock ledger (canonical pieces, post-Stage-12 conversion) —
  // must convert the dispatched figure to pieces before comparing, or a partially-received Box/Bag
  // order shows a wrong (often negative) "incoming" figure on this Manager Distributor-snapshot view.
  const incomingBySku = new Map<string, number>();
  for (const order of ssOrders.filter((o) => ["DISPATCHED", "PARTIAL_DELIVERED"].includes(o.status)))
    for (const line of order.lines) {
      const dispatchedPieces = wholesaleOrderUnitToCanonicalPieces(line.skuCodeSnapshot, Number(line.dispatchedQuantity));
      const outstanding = dispatchedPieces - receivedFor(order.id, line.skuId);
      if (outstanding > 0) incomingBySku.set(line.skuId, (incomingBySku.get(line.skuId) ?? 0) + outstanding);
    }
  const stock = [...movementsBySku.keys(), ...incomingBySku.keys()]
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((skuId) => {
      const p = inventoryPosition(movementsBySku.get(skuId) ?? []);
      return {
        skuId,
        productName: skuById.get(skuId)?.productName ?? skuId,
        brand: skuById.get(skuId)?.brand ?? "Seera",
        available: Math.max(0, p.onHand - p.reserved),
        reserved: p.reserved,
        incoming: incomingBySku.get(skuId) ?? 0,
      };
    });
  const shortReceipts = ssOrders.filter((o) => o.status === "PARTIAL_DELIVERED");
  const lastActivity = [retailerOrders[0]?.createdAt, ssOrders[0]?.createdAt, partner?.updatedAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    distributor: {
      id: distributorId,
      name: partner?.tradeName ?? partner?.legalName ?? distributor.legalName,
      code: partner?.code ?? distributor.code,
      territory: territories.map((t) => t.name).join(", ") || null,
      status: partner?.lifecycle ?? null,
      lastActivity,
    },
    orders: {
      pending: pendingRetailerOrders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, retailer: o.retailer?.businessName ?? "Retailer", total: Number(o.total), placedAt: o.createdAt })),
      pendingCount: pendingRetailerOrders.length,
      acceptedCount,
      partialCount,
      rejectedCount,
    },
    deliveries: {
      pending: pendingDeliveries.map((d) => ({ id: d.id, orderNumber: d.order.orderNumber, retailer: d.order.retailer?.businessName ?? "Retailer", status: d.status })),
      pendingCount: pendingDeliveries.length,
    },
    remainingQtyExceptions,
    ssOrders: ssOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      superStockist: o.sellerPartner?.tradeName ?? o.sellerPartner?.legalName ?? "Super Stockist",
      total: Number(o.total),
      status: o.status,
      placedAt: o.createdAt,
    })),
    stock,
    money: position,
    exceptions: {
      returns: returns.map((r) => ({ id: r.id, requestNumber: r.requestNumber, status: r.status, quantity: Number(r.quantity), condition: r.condition, reason: r.reason })),
      claims: claims.map((c) => ({ id: c.id, claimNumber: c.claimNumber, type: c.type, status: c.status })),
      shortReceipts: shortReceipts.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status })),
    },
  };
}

export type ManagerAlert = {
  code: string;
  severity: "HIGH" | "NORMAL";
  title: string;
  detail: string;
  employeeName?: string;
  occurredAt: Date;
};

// Deterministic, rule-based alerts computed directly from operational data (work sessions, visits,
// follow-ups, deliveries, targets, TA claims, offline sync state) — intentionally NOT the dead
// SeeraInsight/Phase-10 pipeline (nothing in the codebase ever writes to that table). This is the
// minimum practical alert set the master spec calls for; it is not an automation/intelligence engine.
export async function managerAlerts(db: PrismaClient, managerId: string, now = new Date()): Promise<ManagerAlert[]> {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = (await managerTeamEmployeeIds(db, managerId)).filter((id) => id !== managerId);
  if (!employeeIds.length) return [];
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hour = now.getHours();
  const alerts: ManagerAlert[] = [];

  const employees = await db.user.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(employees.map((e) => [e.id, e.name ?? e.email]));

  const [
    todaySessions,
    staleSessions,
    todayVisits,
    plansToday,
    retailerCounts,
    overdueFollowUps,
    overdueProspects,
    taSubmitted,
    offlineIssues,
    deliveryExceptions,
    targets,
  ] = await Promise.all([
    db.seeraWorkSession.findMany({
      where: { employeeId: { in: employeeIds }, startedAt: { gte: startOfDay } },
      select: { employeeId: true, status: true, startedAt: true, endedAt: true },
    }),
    db.seeraWorkSession.findMany({
      where: { employeeId: { in: employeeIds }, status: "ACTIVE", startedAt: { lt: startOfDay } },
      select: { employeeId: true, startedAt: true },
    }),
    db.seeraVisit.findMany({
      where: { workSession: { employeeId: { in: employeeIds } }, checkedInAt: { gte: startOfDay } },
      select: {
        workSession: { select: { employeeId: true } },
        outcome: true,
        photoExceptionReason: true,
        photos: { select: { id: true }, take: 1 },
      },
    }),
    db.seeraJourneyPlan.findMany({
      where: {
        employeeId: { in: employeeIds },
        dayOfWeek: now.getDay(),
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { employeeId: true },
    }),
    db.seeraRetailer.findMany({
      where: { salespersonId: { in: employeeIds }, lifecycle: "ACTIVE" },
      select: { salespersonId: true },
    }),
    db.seeraFollowUp.findMany({
      where: { ownerId: { in: employeeIds }, status: "OPEN", dueDate: { lt: now } },
      select: { ownerId: true, type: true, dueDate: true },
    }),
    db.seeraProspect.findMany({
      where: {
        ownerEmployeeId: { in: employeeIds },
        status: { in: ["PROSPECT", "UNDER_REVIEW"] },
        followUpAt: { lt: now },
      },
      select: { ownerEmployeeId: true, businessName: true, followUpAt: true },
    }),
    db.seeraTaClaim.findMany({
      where: { managerId, status: "SUBMITTED" },
      select: { employeeId: true, claimNumber: true, submittedAt: true },
    }),
    db.seeraOfflineOperation.findMany({
      where: { userId: { in: employeeIds }, status: { in: ["FAILED", "CONFLICT"] } },
      select: { userId: true, status: true, updatedAt: true },
    }),
    db.seeraDelivery.findMany({
      where: {
        status: { in: ["PARTIAL_DELIVERED", "REFUSED"] },
        occurredAt: { gte: startOfDay },
        order: { salespersonId: { in: employeeIds } },
      },
      select: { status: true, occurredAt: true, order: { select: { orderNumber: true, salespersonId: true } } },
    }),
    db.seeraTarget.findMany({
      where: {
        employeeId: { in: employeeIds },
        periodStart: { lte: now },
        periodEnd: { gte: now },
        metricType: "DELIVERED_VALUE",
      },
    }),
  ]);

  const sessionsByEmployee = new Map<string, typeof todaySessions>();
  for (const s of todaySessions) sessionsByEmployee.set(s.employeeId, [...(sessionsByEmployee.get(s.employeeId) ?? []), s]);
  const visitsByEmployee = new Map<string, typeof todayVisits>();
  for (const v of todayVisits) {
    const id = v.workSession.employeeId;
    visitsByEmployee.set(id, [...(visitsByEmployee.get(id) ?? []), v]);
  }
  const plannedToday = new Set(plansToday.map((p) => p.employeeId));
  const retailerCountByEmployee = new Map<string, number>();
  for (const r of retailerCounts)
    if (r.salespersonId) retailerCountByEmployee.set(r.salespersonId, (retailerCountByEmployee.get(r.salespersonId) ?? 0) + 1);

  for (const employeeId of employeeIds) {
    const name = nameOf.get(employeeId) ?? employeeId;
    const sessions = sessionsByEmployee.get(employeeId) ?? [];
    const visits = visitsByEmployee.get(employeeId) ?? [];
    const hasPlan = plannedToday.has(employeeId);
    if (sessions.length === 0 && hour >= 11)
      alerts.push({
        code: "EXECUTIVE_NOT_STARTED",
        severity: "HIGH",
        title: "Not started",
        detail: `${name} has not started today's field day yet`,
        employeeName: name,
        occurredAt: now,
      });
    if (hasPlan && sessions.length > 0 && visits.length === 0 && hour >= 12)
      alerts.push({
        code: "BEAT_MISS",
        severity: "HIGH",
        title: "Beat miss",
        detail: `${name} started the day but has no visits logged against the published beat`,
        employeeName: name,
        occurredAt: now,
      });
    const bookSize = retailerCountByEmployee.get(employeeId) ?? 0;
    if (hour >= 15 && bookSize > 0 && visits.length < bookSize * 0.3)
      alerts.push({
        code: "LOW_VISITS",
        severity: "NORMAL",
        title: "Low visits",
        detail: `${name} has visited ${visits.length} of ~${bookSize} retailers today`,
        employeeName: name,
        occurredAt: now,
      });
    for (const v of visits)
      if (v.outcome !== "SKIPPED" && v.photos.length === 0 && !v.photoExceptionReason)
        alerts.push({
          code: "MISSING_PHOTO",
          severity: "NORMAL",
          title: "Missing photo",
          detail: `${name} logged a visit today with no photo and no exception reason`,
          employeeName: name,
          occurredAt: now,
        });
  }

  for (const s of staleSessions)
    alerts.push({
      code: "DSR_MISSING",
      severity: "HIGH",
      title: "DSR missing",
      detail: `${nameOf.get(s.employeeId) ?? s.employeeId}'s field day from ${s.startedAt.toLocaleDateString("en-IN")} was never ended`,
      employeeName: nameOf.get(s.employeeId),
      occurredAt: s.startedAt,
    });

  for (const f of overdueFollowUps)
    alerts.push({
      code: f.type === "PAYMENT_COLLECTION" ? "PAYMENT_FOLLOW_UP" : "FOLLOW_UP_OVERDUE",
      severity: f.type === "PAYMENT_COLLECTION" ? "HIGH" : "NORMAL",
      title: f.type === "PAYMENT_COLLECTION" ? "Payment follow-up overdue" : "Follow-up overdue",
      detail: `${nameOf.get(f.ownerId) ?? f.ownerId} has an overdue ${f.type.toLowerCase().replaceAll("_", " ")} follow-up (due ${f.dueDate.toLocaleDateString("en-IN")})`,
      employeeName: nameOf.get(f.ownerId),
      occurredAt: f.dueDate,
    });

  for (const p of overdueProspects)
    alerts.push({
      code: "PROSPECT_FOLLOW_UP",
      severity: "NORMAL",
      title: "Prospect follow-up overdue",
      detail: `${nameOf.get(p.ownerEmployeeId) ?? p.ownerEmployeeId}'s Distributor prospect "${p.businessName}" is overdue for follow-up`,
      employeeName: nameOf.get(p.ownerEmployeeId),
      occurredAt: p.followUpAt ?? now,
    });

  for (const t of taSubmitted)
    alerts.push({
      code: "TA_PENDING",
      severity: "NORMAL",
      title: "TA pending verification",
      detail: `${nameOf.get(t.employeeId) ?? t.employeeId}'s TA claim ${t.claimNumber} is awaiting your verification`,
      employeeName: nameOf.get(t.employeeId),
      occurredAt: t.submittedAt ?? now,
    });

  for (const o of offlineIssues)
    alerts.push({
      code: "SYNC_ERROR",
      severity: "HIGH",
      title: "Sync error",
      detail: `${nameOf.get(o.userId) ?? o.userId} has an offline operation stuck in ${o.status}`,
      employeeName: nameOf.get(o.userId),
      occurredAt: o.updatedAt,
    });

  for (const d of deliveryExceptions)
    alerts.push({
      code: "DELIVERY_EXCEPTION",
      severity: "NORMAL",
      title: d.status === "REFUSED" ? "Delivery refused" : "Partial delivery",
      detail: `Order ${d.order.orderNumber} for ${nameOf.get(d.order.salespersonId ?? "") ?? "the team"} was ${d.status === "REFUSED" ? "refused" : "only partially delivered"}`,
      employeeName: d.order.salespersonId ? nameOf.get(d.order.salespersonId) : undefined,
      occurredAt: d.occurredAt ?? now,
    });

  for (const target of targets) {
    const periodStart = target.periodStart.getTime(),
      periodEnd = target.periodEnd.getTime();
    const elapsedPct = Math.min(1, Math.max(0, (now.getTime() - periodStart) / (periodEnd - periodStart)));
    if (elapsedPct < 0.15) continue;
    const achieved = await deliveredValueForPeriod(db, target.employeeId, target.periodStart, now);
    const targetValue = Number(target.targetValue);
    const achievementPct = targetValue > 0 ? achieved / targetValue : 0;
    if (achievementPct < elapsedPct - 0.15)
      alerts.push({
        code: "TARGET_LAG",
        severity: "HIGH",
        title: "Target lag",
        detail: `${nameOf.get(target.employeeId) ?? target.employeeId} is at ${Math.round(achievementPct * 100)}% achievement with ${Math.round(elapsedPct * 100)}% of the period elapsed`,
        employeeName: nameOf.get(target.employeeId),
        occurredAt: now,
      });
  }

  const mappedDistributors = await db.seeraRetailer.findMany({
    where: { salespersonId: { in: employeeIds }, distributorId: { not: null }, lifecycle: "ACTIVE" },
    select: { distributorId: true },
    distinct: ["distributorId"],
  });
  const distributorIds = mappedDistributors.map((r) => r.distributorId).filter((x): x is string => Boolean(x));
  if (distributorIds.length) {
    const distributors = await db.seeraPartner.findMany({
      where: { id: { in: distributorIds } },
      select: { id: true, legalName: true, tradeName: true },
    });
    for (const distributor of distributors) {
      const exposure = await canonicalDistributorExposure(db, distributor.id, now);
      const oldest = exposure.openOrders[0];
      if (oldest?.originalDueDate && now > oldest.originalDueDate)
        alerts.push({
          code: "DISTRIBUTOR_OVERDUE",
          severity: "HIGH",
          title: "Distributor overdue",
          detail: `${distributor.tradeName ?? distributor.legalName} has an overdue balance of ₹${exposure.exposure.toLocaleString("en-IN")}`,
          occurredAt: oldest.originalDueDate,
        });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1));
}

// Team-wide purpose-built delivered-sales read model (replaces the generic orders-list fallback
// the Manager's "delivered-sales" surface item used to hit). Every row keeps the historically
// BOOKED value (order.total, never rewritten) separate from the later, possibly-partial DELIVERY
// outcome — eligibleDelivered() nets cancelled/refused/approved-returns out of what was actually
// delivered, matching the same rule executiveDeliveredSales() already applies for a single
// Executive, so a Manager's team total can never disagree with what each Executive sees for
// themselves.
export async function managerDeliveredSales(
  db: PrismaClient,
  managerId: string,
  input: {
    executiveId?: string;
    distributorId?: string;
    areaId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    skip?: number;
    take?: number;
  } = {},
) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  if (input.executiveId && !employeeIds.includes(input.executiveId))
    throw new FoundationError("EXECUTIVE_SCOPE_DENIED", "Executive is outside your team's scope", 403);
  const orders = await db.seeraSalesOrder.findMany({
    where: {
      salespersonId: { in: input.executiveId ? [input.executiveId] : employeeIds },
      type: "RETAILER_ORDER",
      ...(input.distributorId ? { sellerPartnerId: input.distributorId } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            createdAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
      ...(input.areaId
        ? { retailer: { OR: [{ territoryId: input.areaId }, { beatId: input.areaId }] } }
        : {}),
    },
    include: {
      lines: true,
      retailer: { select: { businessName: true, territoryId: true, beatId: true } },
      sellerPartner: { select: { legalName: true, tradeName: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 50,
  });
  const employees = await db.user.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.salespersonId).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true, email: true },
  });
  const nameFor = new Map(employees.map((e) => [e.id, e.name ?? e.email]));
  const rows = orders.map((order) => {
    const bookedQty = order.lines.reduce((sum, l) => sum + Number(l.orderedQuantity), 0);
    const deliveredQty = order.lines.reduce((sum, l) => sum + Number(l.deliveredQuantity), 0);
    const refusedQty = order.lines.reduce((sum, l) => sum + Number(l.refusedQuantity), 0);
    const returnedQty = order.lines.reduce((sum, l) => sum + Number(l.returnedQuantity), 0);
    const eligible = order.lines.reduce(
      (sum, line) =>
        sum +
        eligibleDelivered({
          ordered: Number(line.orderedQuantity),
          cancelled: Number(line.cancelledQuantity),
          delivered: Number(line.deliveredQuantity),
          refused: Number(line.refusedQuantity),
          approvedReturn: Number(line.returnedQuantity),
          unitValue: Number(line.priceSnapshot),
        }).value,
      0,
    );
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      executiveId: order.salespersonId,
      executive: order.salespersonId ? (nameFor.get(order.salespersonId) ?? "Executive") : "—",
      retailer: order.retailer?.businessName ?? "Retailer",
      distributor: order.sellerPartner?.tradeName ?? order.sellerPartner?.legalName ?? "—",
      status: order.status,
      bookedQty,
      bookedValue: Number(order.total),
      deliveredQty,
      refusedQty,
      returnedQty,
      partial: deliveredQty > 0 && deliveredQty < bookedQty - Number(order.lines.reduce((s, l) => s + Number(l.cancelledQuantity), 0)),
      eligibleDeliveredValue: eligible,
    };
  });
  const totals = rows.reduce(
    (sum, row) => ({
      bookedValue: sum.bookedValue + row.bookedValue,
      eligibleDeliveredValue: sum.eligibleDeliveredValue + row.eligibleDeliveredValue,
      refusedQty: sum.refusedQty + row.refusedQty,
      returnedQty: sum.returnedQty + row.returnedQty,
    }),
    { bookedValue: 0, eligibleDeliveredValue: 0, refusedQty: 0, returnedQty: 0 },
  );
  const attribution = salesAttribution(
    orders.map((o) => ({
      id: o.id,
      salespersonId: o.salespersonId,
      sourcePortal: o.sourcePortal,
      bookedValue: Number(o.total),
      eligibleDeliveredValue: rows.find((r) => r.id === o.id)?.eligibleDeliveredValue ?? 0,
    })),
    managerId,
    employeeIds.filter((id) => id !== managerId),
  );
  return { rows, totals, attribution };
}

// Team Sales (Executives' own orders) / Manager Own Sales / Territory Sales (the sum), computed
// from disjoint order subsets — see salesAttribution in business-rules.ts for why this can never
// double-count a Joint Working order under both buckets.
export async function managerSalesAttribution(
  db: PrismaClient,
  managerId: string,
  input: { dateFrom?: Date; dateTo?: Date } = {},
) {
  await authorize(db, { actorId: managerId, permission: "manager_team:view" });
  const employeeIds = await managerTeamEmployeeIds(db, managerId);
  const orders = await db.seeraSalesOrder.findMany({
    where: {
      salespersonId: { in: employeeIds },
      type: "RETAILER_ORDER",
      ...(input.dateFrom || input.dateTo
        ? { createdAt: { ...(input.dateFrom ? { gte: input.dateFrom } : {}), ...(input.dateTo ? { lte: input.dateTo } : {}) } }
        : {}),
    },
    include: { lines: true },
  });
  const attribution = salesAttribution(
    orders.map((o) => ({
      id: o.id,
      salespersonId: o.salespersonId,
      sourcePortal: o.sourcePortal,
      bookedValue: Number(o.total),
      eligibleDeliveredValue: o.lines.reduce(
        (sum, line) =>
          sum +
          eligibleDelivered({
            ordered: Number(line.orderedQuantity),
            cancelled: Number(line.cancelledQuantity),
            delivered: Number(line.deliveredQuantity),
            refused: Number(line.refusedQuantity),
            approvedReturn: Number(line.returnedQuantity),
            unitValue: Number(line.priceSnapshot),
          }).value,
        0,
      ),
    })),
    managerId,
    employeeIds.filter((id) => id !== managerId),
  );
  // Part B reporting split (COMPANY_DIRECT vs DISTRIBUTOR) — additive field alongside
  // team/managerOwn/territory, computed independently here rather than inside salesAttribution
  // itself (that function's team/own/territory disjointness guarantee is unit-tested and stays
  // untouched). Territory-wide (team + manager-own combined), matching territory.bookedValue.
  const territorySellerPartnerIds = [...new Set(orders.map((o) => o.sellerPartnerId).filter((id): id is string => Boolean(id)))];
  const territorySellerPartners = territorySellerPartnerIds.length
    ? await db.seeraPartner.findMany({ where: { id: { in: territorySellerPartnerIds } }, select: { id: true, type: true } })
    : [];
  const partnerTypeById = new Map(territorySellerPartners.map((p) => [p.id, p.type]));
  const supplySplit = {
    companyDirectValue: orders
      .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "COMPANY_DIRECT")
      .reduce((sum, o) => sum + Number(o.total), 0),
    distributorValue: orders
      .filter((o) => o.sellerPartnerId && partnerTypeById.get(o.sellerPartnerId) === "DISTRIBUTOR")
      .reduce((sum, o) => sum + Number(o.total), 0),
  };
  return { ...attribution, supplySplit };
}
