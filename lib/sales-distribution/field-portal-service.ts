import type { PrismaClient, VisitOutcome } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { FoundationError } from "@/lib/foundation/errors";

export async function executiveCheckIn(
  db: PrismaClient,
  actorId: string,
  input: {
    workSessionId: string;
    retailerId: string;
    latitude?: number;
    longitude?: number;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const session = await db.seeraWorkSession.findFirst({
    where: {
      id: input.workSessionId,
      employeeId: actorId,
      employeeRole: "SALES_EXECUTIVE",
      status: "ACTIVE",
    },
  });
  if (!session)
    throw new FoundationError(
      "ACTIVE_WORKDAY_REQUIRED",
      "Start Day before checking in",
      409,
    );
  const retailer = await db.seeraRetailer.findFirst({
    where: {
      id: input.retailerId,
      salespersonId: actorId,
      lifecycle: "ACTIVE",
    },
  });
  if (!retailer)
    throw new FoundationError(
      "RETAILER_SCOPE_DENIED",
      "Retailer is not assigned or active",
      403,
    );
  const open = await db.seeraVisit.findFirst({
    where: { workSession: { employeeId: actorId }, checkedOutAt: null },
  });
  if (open && open.retailerId !== retailer.id)
    throw new FoundationError(
      "OPEN_VISIT_EXISTS",
      "Checkout the current retailer first",
      409,
    );
  return db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      retailerId: retailer.id,
      checkedInAt: new Date(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
export async function executiveCheckOut(
  db: PrismaClient,
  actorId: string,
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
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      checkedOutAt: null,
      workSession: { employeeId: actorId, status: "ACTIVE" },
    },
  });
  if (!visit)
    throw new FoundationError(
      "VISIT_SCOPE_DENIED",
      "Active visit unavailable",
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
  return db.seeraVisit.update({
    where: { id: visit.id },
    data: {
      outcome,
      noOrderReason: input.noOrderReason,
      followUpAt: input.followUpAt,
      notes: input.notes,
      checkedOutAt: new Date(),
    },
  });
}
