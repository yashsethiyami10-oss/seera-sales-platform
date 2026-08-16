import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, VisitOutcome } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { timeOperation } from "@/lib/foundation/logger";
import { eligibleDelivered } from "./business-rules";
import { canonicalDistributorExposure } from "./credit-service";
import { recordGpsSample } from "./field-travel-service";
import { queueRetailerCommunication, type RetailerCommEventType } from "./retailer-communication-service";

const numberFor = (prefix: string, key: string) =>
  `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;

export async function executiveCheckIn(
  db: PrismaClient,
  actorId: string,
  input: {
    workSessionId: string;
    retailerId: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    gpsExceptionReason?: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  // These three reads are independent of each other (none consumes another's result, only the
  // validation logic below combines them) — one round trip instead of three.
  const [session, retailer, open] = await Promise.all([
    db.seeraWorkSession.findFirst({
      where: {
        id: input.workSessionId,
        employeeId: actorId,
        employeeRole: "SALES_EXECUTIVE",
        status: "ACTIVE",
      },
    }),
    db.seeraRetailer.findFirst({
      where: {
        id: input.retailerId,
        salespersonId: actorId,
        lifecycle: "ACTIVE",
      },
    }),
    db.seeraVisit.findFirst({
      where: { workSession: { employeeId: actorId }, checkedOutAt: null },
    }),
  ]);
  if (!session)
    throw new FoundationError(
      "ACTIVE_WORKDAY_REQUIRED",
      "Start Day before checking in",
      409,
    );
  if (!retailer)
    throw new FoundationError(
      "RETAILER_SCOPE_DENIED",
      "Retailer is not assigned or active",
      403,
    );
  if (open && open.retailerId !== retailer.id)
    throw new FoundationError(
      "OPEN_VISIT_EXISTS",
      "Checkout the current retailer first",
      409,
    );
  // The visit upsert and the GPS sample write are independent (recordGpsSample only needs
  // session.id, already known) — one round trip instead of two.
  const [visit] = await Promise.all([
    db.seeraVisit.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        workSessionId: session.id,
        retailerId: retailer.id,
        checkedInAt: new Date(),
        checkInLatitude: input.latitude,
        checkInLongitude: input.longitude,
        gpsExceptionReason: input.gpsExceptionReason,
        idempotencyKey: input.idempotencyKey,
      },
    }),
    recordGpsSample(db, {
      employeeId: actorId,
      workSessionId: session.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "CHECK_IN",
      trackingStatus: input.gpsExceptionReason
        ? "EXCEPTION"
        : input.latitude != null
          ? "OK"
          : "UNAVAILABLE",
    }),
  ]);
  return visit;
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
    photoExceptionReason?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  // Photo count folded into the same query as a relation count instead of a second round trip.
  const visit = await db.seeraVisit.findFirst({
    where: {
      id: visitId,
      checkedOutAt: null,
      workSession: { employeeId: actorId, status: "ACTIVE" },
    },
    include: { _count: { select: { photos: { where: { deletedAt: null } } } } },
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
  if (visit._count.photos === 0 && !input.photoExceptionReason && !visit.photoExceptionReason)
    throw new FoundationError(
      "PHOTO_OR_EXCEPTION_REQUIRED",
      "Add a shop photo or choose a valid no-photo reason.",
      400,
    );
  const outcome: VisitOutcome =
    input.outcome === "NO_ORDER"
      ? "NO_ORDER"
      : input.outcome === "FOLLOW_UP"
        ? "FOLLOW_UP"
        : "PRODUCTIVE";
  // The visit update and the GPS sample write are independent (recordGpsSample only needs
  // visit.workSessionId, already known) — one round trip instead of two. Retailer WhatsApp
  // notification is fire-and-forget (never awaited inline): it was already documented as "never
  // allowed to fail checkout" via try/catch, which only protected against errors, not latency —
  // this closes the same gap for speed, since a governed communication/outbox concern was never
  // something the field user needed to wait on. The visit is already durably updated (this same
  // Promise.all) before the notification even starts, so there is no consistency risk.
  const commEventType: RetailerCommEventType | null =
    input.outcome === "ORDER_BOOKED" ? "ORDER_RECORDED" : input.outcome === "NO_ORDER" ? "REFUSED_OR_UNABLE" : input.outcome === "FOLLOW_UP" ? "FOLLOW_UP" : null;
  if (commEventType && visit.retailerId) {
    void queueRetailerCommunication(db, { eventType: commEventType, retailerId: visit.retailerId, visitId: visit.id, actorId }).catch((error) => {
      console.error("retailer_communication.queue_failed", error);
    });
  }
  const [updated] = await Promise.all([
    db.seeraVisit.update({
      where: { id: visit.id },
      data: {
        outcome,
        noOrderReason: input.noOrderReason,
        followUpAt: input.followUpAt,
        notes: input.notes,
        photoExceptionReason: input.photoExceptionReason ?? visit.photoExceptionReason,
        checkedOutAt: new Date(),
      },
    }),
    recordGpsSample(db, {
      employeeId: actorId,
      workSessionId: visit.workSessionId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: "CHECK_OUT",
      trackingStatus: input.latitude != null ? "OK" : "UNAVAILABLE",
    }),
  ]);
  return updated;
}

// A planned stop that is skipped never gets an actual check-in — recorded as a same-instant,
// zero-duration visit with VisitOutcome.SKIPPED so it still shows up in the day's history/DSR and
// counts toward "planned vs visited" without inventing a parallel "planned retailer" record type.
export async function skipRetailer(
  db: PrismaClient,
  actorId: string,
  input: {
    workSessionId: string;
    retailerId: string;
    reason: string;
    remarks?: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const session = await db.seeraWorkSession.findFirst({
    where: { id: input.workSessionId, employeeId: actorId, status: "ACTIVE" },
  });
  if (!session)
    throw new FoundationError(
      "ACTIVE_WORKDAY_REQUIRED",
      "Start Day before recording a skip",
      409,
    );
  const retailer = await db.seeraRetailer.findFirst({
    where: { id: input.retailerId, salespersonId: actorId, lifecycle: "ACTIVE" },
  });
  if (!retailer)
    throw new FoundationError(
      "RETAILER_SCOPE_DENIED",
      "Retailer is not assigned or active",
      403,
    );
  if (!input.reason.trim())
    throw new FoundationError("SKIP_REASON_REQUIRED", "A skip reason is required", 400);
  const now = new Date();
  return db.seeraVisit.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      workSessionId: session.id,
      retailerId: retailer.id,
      checkedInAt: now,
      checkedOutAt: now,
      outcome: "SKIPPED",
      skipReason: input.reason,
      notes: input.remarks,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

// Executives cannot silently rewrite a Manager-published beat; a deviation from the planned route
// is still allowed operationally but is always attached to the visit and audited.
export async function recordRouteDeviation(
  db: PrismaClient,
  actorId: string,
  input: { visitId: string; reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  const updated = await db.seeraVisit.update({
    where: { id: visit.id },
    data: { routeDeviationReason: input.reason },
  });
  await recordAudit(db, {
    actorId,
    action: "visit.route_deviation",
    entityType: "SeeraVisit",
    entityId: visit.id,
    afterState: { reason: input.reason },
  });
  return updated;
}

const SHOP_TYPES = [
  "KIRANA",
  "GENERAL_STORE",
  "SUPERMARKET",
  "MINI_MART",
  "DEPARTMENTAL_STORE",
  "WHOLESALE_RETAILER",
  "CHEMIST_PHARMACY",
  "INSTITUTIONAL_COUNTER",
  "OTHER",
] as const;

export async function findSimilarRetailers(
  db: PrismaClient,
  input: { businessName: string; mobile?: string },
) {
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  return db.seeraRetailer.findMany({
    where: {
      OR: [
        ...(normalizedMobile ? [{ normalizedMobile, NOT: { normalizedMobile: "" } }] : []),
        { businessName: { equals: input.businessName, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, businessName: true, mobile: true, address: true, lifecycle: true },
    take: 5,
  });
}

// Only Shop/Firm Name and Area/Address are mandatory — every other field is optional, and a new
// retailer must be usable in the current visit/order immediately (lifecycle ACTIVE right away);
// Manager review happens after the fact via the audit trail, it never blocks first use.
const CUSTOMER_TYPES = [
  "RETAILER",
  "WHOLESALER",
  "DISTRIBUTOR_PROSPECT",
  "INSTITUTIONAL_OTHER",
] as const;

export async function createRetailer(
  db: PrismaClient,
  actorId: string,
  input: {
    businessName: string;
    address: Record<string, unknown>;
    ownerName?: string;
    mobile?: string;
    alternateMobile?: string;
    pincode?: string;
    shopType?: (typeof SHOP_TYPES)[number];
    customerType?: (typeof CUSTOMER_TYPES)[number];
    gstin?: string;
    distributorId?: string;
    beatId?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
    confirmDuplicate?: boolean;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  if (!input.businessName.trim())
    throw new FoundationError("SHOP_NAME_REQUIRED", "Shop/Firm name is required", 400);
  if (!input.address || Object.keys(input.address).length === 0)
    throw new FoundationError("AREA_ADDRESS_REQUIRED", "Area/Address is required", 400);
  const normalizedMobile = input.mobile?.replace(/\D/g, "") ?? "";
  if (!input.confirmDuplicate) {
    const similar = await findSimilarRetailers(db, {
      businessName: input.businessName,
      mobile: input.mobile,
    });
    if (similar.length)
      throw new FoundationError(
        "SIMILAR_RETAILER_EXISTS",
        "A similar retailer already exists — confirm to save anyway",
        409,
        { similar },
      );
  }
  let distributorId = input.distributorId;
  if (!distributorId) {
    const anyOwn = await db.seeraRetailer.findFirst({
      where: { salespersonId: actorId, distributorId: { not: null } },
      select: { distributorId: true },
      orderBy: { createdAt: "desc" },
    });
    distributorId = anyOwn?.distributorId ?? undefined;
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.seeraRetailer.findFirst({
      where: { salespersonId: actorId, notes: { contains: input.idempotencyKey } },
    });
    if (existing) return existing;
    const retailer = await tx.seeraRetailer.create({
      data: {
        code: numberFor("RT", input.idempotencyKey),
        businessName: input.businessName.trim(),
        ownerName: input.ownerName,
        mobile: input.mobile,
        alternateMobile: input.alternateMobile,
        pincode: input.pincode,
        normalizedMobile,
        address: input.address as Prisma.InputJsonValue,
        latitude: input.latitude,
        longitude: input.longitude,
        gstin: input.gstin,
        shopType: input.shopType,
        customerType: input.customerType,
        distributorId,
        beatId: input.beatId,
        salespersonId: actorId,
        lifecycle: "ACTIVE",
        source: "UNPLANNED_FIELD_ADDED",
        notes: input.notes,
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "retailer.created_by_executive",
      entityType: "SeeraRetailer",
      entityId: retailer.id,
      afterState: { businessName: retailer.businessName, distributorId, source: "UNPLANNED_FIELD_ADDED" },
    });
    return retailer;
  });
}

export async function retailer360(db: PrismaClient, actorId: string, retailerId: string) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const retailer = await db.seeraRetailer.findFirst({
    where: { id: retailerId, salespersonId: actorId },
  });
  if (!retailer)
    throw new FoundationError("RETAILER_SCOPE_DENIED", "Retailer scope denied", 403);
  const [lastVisit, recentOrders, followUps, photos] = await Promise.all([
    db.seeraVisit.findFirst({
      where: { retailerId },
      orderBy: { checkedInAt: "desc" },
    }),
    db.seeraSalesOrder.findMany({
      where: { retailerId, salespersonId: actorId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { lines: true },
    }),
    db.seeraFollowUp.findMany({
      where: { retailerId, ownerId: actorId, status: "OPEN" },
      orderBy: { dueDate: "asc" },
    }),
    db.seeraVisitPhoto.findMany({
      where: { retailerId, deletedAt: null },
      orderBy: { capturedAt: "desc" },
      take: 12,
    }),
  ]);
  return { retailer, lastVisit, recentOrders, followUps, photos };
}

const PHOTO_TYPES = [
  "SHOPFRONT",
  "COUNTER",
  "PRODUCT_DISPLAY",
  "BANNER_BRANDING",
  "MERCHANDISING",
  "OTHER",
] as const;

export async function capturePhoto(
  db: PrismaClient,
  actorId: string,
  input: {
    visitId: string;
    photoType: (typeof PHOTO_TYPES)[number];
    fileBase64: string;
    mimeType: string;
    originalName: string;
    latitude?: number;
    longitude?: number;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  // Accepts whatever format a phone's native camera actually produces (iPhones default to
  // HEIC/HEIF; some Android camera apps also do) — the client now uses accept="image/*" for the
  // same reason (matches the original phone-camera-first spec). Rejecting real camera output here
  // was a genuine, reproducible cause of "photo added but checkout still says missing": the upload
  // failed server-side while the client-side preview stayed visible, looking like success.
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(input.mimeType))
    throw new FoundationError("UNSUPPORTED_PHOTO_TYPE", "Only JPEG, PNG, WEBP or HEIC photos are accepted", 400);
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > 8_000_000)
    throw new FoundationError("PHOTO_TOO_LARGE", "Photo must be under 8 MB", 400);
  return db.$transaction(async (tx) => {
    const file = await tx.storedFile.create({
      data: {
        provider: "DATABASE",
        storageKey: `visit-photos/${input.idempotencyKey}`,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(bytes.length),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        classification: "FIELD_EVIDENCE",
        entityType: "SeeraVisit",
        entityId: visit.id,
        uploadedById: actorId,
        contentBytes: bytes,
      },
    });
    const photo = await tx.seeraVisitPhoto.create({
      data: {
        visitId: visit.id,
        retailerId: visit.retailerId,
        actorId,
        photoType: input.photoType,
        fileId: file.id,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
    return photo;
  });
}

export async function recordPhotoException(
  db: PrismaClient,
  actorId: string,
  input: { visitId: string; reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const visit = await db.seeraVisit.findFirst({
    where: { id: input.visitId, workSession: { employeeId: actorId } },
  });
  if (!visit)
    throw new FoundationError("VISIT_SCOPE_DENIED", "Visit unavailable", 403);
  return db.seeraVisit.update({
    where: { id: visit.id },
    data: { photoExceptionReason: input.reason },
  });
}

// Deletion is only ever allowed on your own photo, before you've checked out — after that the
// visit's evidence trail is treated as closed history, matching how notes/checkout are immutable.
export async function deleteVisitPhoto(
  db: PrismaClient,
  actorId: string,
  photoId: string,
  input: { reason: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const photo = await db.seeraVisitPhoto.findFirst({
    where: { id: photoId, actorId, deletedAt: null },
    include: { visit: true },
  });
  if (!photo)
    throw new FoundationError("PHOTO_SCOPE_DENIED", "Photo unavailable", 403);
  if (photo.visit.checkedOutAt)
    throw new FoundationError(
      "VISIT_ALREADY_CLOSED",
      "Photos cannot be removed after checkout",
      409,
    );
  const updated = await db.seeraVisitPhoto.update({
    where: { id: photoId },
    data: { deletedAt: new Date(), deletedById: actorId, deleteReason: input.reason },
  });
  await recordAudit(db, {
    actorId,
    action: "visit_photo.deleted",
    entityType: "SeeraVisitPhoto",
    entityId: photoId,
    reason: input.reason,
  });
  return updated;
}

export async function createFollowUp(
  db: PrismaClient,
  actorId: string,
  input: {
    type: string;
    retailerId?: string;
    prospectId?: string;
    visitId?: string;
    dueDate: Date;
    priority?: "NORMAL" | "HIGH";
    note: string;
    idempotencyKey: string;
  },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  if (!input.note.trim())
    throw new FoundationError("FOLLOW_UP_NOTE_REQUIRED", "A note is required", 400);
  return db.seeraFollowUp.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      type: input.type,
      retailerId: input.retailerId,
      prospectId: input.prospectId,
      visitId: input.visitId,
      ownerId: actorId,
      dueDate: input.dueDate,
      priority: input.priority ?? "NORMAL",
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function resolveFollowUp(
  db: PrismaClient,
  actorId: string,
  followUpId: string,
  input: { resolutionNote?: string },
) {
  await authorize(db, { actorId, permission: "retailer:visit" });
  const followUp = await db.seeraFollowUp.findFirst({
    where: { id: followUpId, ownerId: actorId, status: "OPEN" },
  });
  if (!followUp)
    throw new FoundationError("FOLLOW_UP_SCOPE_DENIED", "Follow-up unavailable", 403);
  return db.seeraFollowUp.update({
    where: { id: followUpId },
    data: {
      status: "DONE",
      resolvedAt: new Date(),
      resolvedById: actorId,
      resolutionNote: input.resolutionNote,
    },
  });
}

// "Today" is the executive's own geography for the current day-of-week, resolved from the
// Manager-published SeeraJourneyPlan and matched against the retailer's own beat/market/territory
// field depending on which geography level the plan targets. Executives never edit this — it's a
// read of what the Manager published, plus their normal retailer book for any un-planned day.
export async function executiveBeat(
  db: PrismaClient,
  actorId: string,
  range: "today" | "tomorrow" | "week",
  now = new Date(),
) {
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  const days =
    range === "today"
      ? [now.getDay()]
      : range === "tomorrow"
        ? [(now.getDay() + 1) % 7]
        : [0, 1, 2, 3, 4, 5, 6];
  const plans = await db.seeraJourneyPlan.findMany({
    where: {
      employeeId: actorId,
      dayOfWeek: { in: days },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const geographyIds = [...new Set(plans.map((plan) => plan.geographyId))];
  const [visitsToday, retailers] = await Promise.all([
    db.seeraVisit.findMany({
      where: {
        workSession: { employeeId: actorId },
        checkedInAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
      select: { retailerId: true, outcome: true },
    }),
    geographyIds.length
      ? db.seeraRetailer.findMany({
          where: {
            salespersonId: actorId,
            lifecycle: "ACTIVE",
            OR: [
              { beatId: { in: geographyIds } },
              { marketId: { in: geographyIds } },
              { territoryId: { in: geographyIds } },
            ],
          },
          orderBy: { businessName: "asc" },
        })
      : range === "today"
        ? db.seeraRetailer.findMany({
            where: { salespersonId: actorId, lifecycle: "ACTIVE" },
            orderBy: { businessName: "asc" },
          })
        : Promise.resolve([]),
  ]);
  const visitStatus = new Map(visitsToday.map((v) => [v.retailerId, v.outcome]));
  const openFollowUps = retailers.length
    ? await db.seeraFollowUp.findMany({
        where: { retailerId: { in: retailers.map((r) => r.id) }, ownerId: actorId, status: "OPEN" },
        orderBy: { dueDate: "asc" },
      })
    : [];
  const followUpAt = new Map<string, Date>();
  for (const f of openFollowUps)
    if (f.retailerId && !followUpAt.has(f.retailerId)) followUpAt.set(f.retailerId, f.dueDate);
  return {
    plans,
    hasPublishedPlan: plans.length > 0,
    retailers: retailers.map((retailer) => ({
      ...retailer,
      visitStatus: range === "today" ? (visitStatus.get(retailer.id) ?? "PENDING") : null,
      followUpAt: followUpAt.get(retailer.id) ?? null,
    })),
  };
}

export async function executiveDashboard(db: PrismaClient, actorId: string, now = new Date()) {
  const timing = timeOperation("field_portal.executiveDashboard");
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  timing.stage("authorize");
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Every read below is independent of every other read in this same batch (none of them consume
  // another's result) — only `monthDelivered` and `plannedCount` further down genuinely need
  // `target`/`plannedToday` resolved first. Previously this was 4 sequential round-trip stages
  // (this batch, then newRetailersToday alone, then a second batch, then plannedCount alone) purely
  // because of source-order, not real dependencies — each stage costs a full network round trip to
  // Neon regardless of how many queries run within it, so collapsing to 2 stages here materially
  // cuts this function's latency on every call (and this function reruns on every field-portal
  // router.refresh(), i.e. after every field action).
  const [session, employee, retailers, target, todayVisits, todayOrders, followUpsDue, prospects, newRetailersToday, photosToday, plannedToday] =
    await Promise.all([
      db.seeraWorkSession.findFirst({
        where: { employeeId: actorId, employeeRole: "SALES_EXECUTIVE", status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
      }),
      db.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
      db.seeraRetailer.count({ where: { salespersonId: actorId, lifecycle: "ACTIVE" } }),
      db.seeraTarget.findFirst({
        where: {
          employeeId: actorId,
          periodStart: { lte: now },
          periodEnd: { gte: now },
          metricType: "DELIVERED_VALUE",
        },
        orderBy: { periodStart: "desc" },
      }),
      db.seeraVisit.findMany({
        where: { workSession: { employeeId: actorId }, checkedInAt: { gte: startOfDay } },
      }),
      db.seeraSalesOrder.findMany({
        where: { salespersonId: actorId, createdAt: { gte: startOfDay } },
        select: { total: true },
      }),
      db.seeraFollowUp.count({
        where: { ownerId: actorId, status: "OPEN", dueDate: { lte: new Date(startOfDay.getTime() + 86_400_000) } },
      }),
      db.seeraProspect.count({
        where: { ownerEmployeeId: actorId, prospectType: "DISTRIBUTOR", status: { in: ["PROSPECT", "UNDER_REVIEW"] } },
      }),
      db.seeraRetailer.count({ where: { salespersonId: actorId, createdAt: { gte: startOfDay } } }),
      db.seeraVisitPhoto.count({
        where: { actorId, capturedAt: { gte: startOfDay }, deletedAt: null },
      }),
      db.seeraJourneyPlan.findFirst({
        where: {
          employeeId: actorId,
          dayOfWeek: now.getDay(),
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);
  timing.stage("batch1_independent_reads");
  // Only these two genuinely depend on the batch above (monthDelivered needs target's period;
  // plannedCount needs plannedToday's geography) — they don't depend on each other, so still one
  // round trip, not two.
  const [monthDelivered, plannedCount] = await Promise.all([
    deliveredValueForPeriod(
      db,
      actorId,
      target?.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1),
      target?.periodEnd ?? now,
    ),
    plannedToday
      ? db.seeraRetailer.count({
          where: {
            salespersonId: actorId,
            lifecycle: "ACTIVE",
            OR: [
              { beatId: plannedToday.geographyId },
              { marketId: plannedToday.geographyId },
              { territoryId: plannedToday.geographyId },
            ],
          },
        })
      : Promise.resolve(retailers),
  ]);
  timing.stage("batch2_dependent_reads");
  const targetValue = Number(target?.targetValue ?? 0);
  const achieved = monthDelivered;
  const remaining = Math.max(0, targetValue - achieved);
  const periodEnd = target?.periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
  const dashboardResult = {
    employee,
    dayStatus: session ? "ACTIVE" : "NOT_STARTED",
    session,
    target: target
      ? {
          value: targetValue,
          achieved,
          remaining,
          achievementPct: targetValue > 0 ? Math.round((achieved / targetValue) * 1000) / 10 : 0,
          daysRemaining,
          requiredDailyRunRate: daysRemaining > 0 ? Math.round((remaining / daysRemaining) * 100) / 100 : remaining,
        }
      : null,
    today: {
      planned: plannedCount,
      visited: todayVisits.length,
      productive: todayVisits.filter((v) => v.outcome === "PRODUCTIVE").length,
      skipped: todayVisits.filter((v) => v.outcome === "SKIPPED").length,
      orders: todayOrders.length,
      bookedValue: todayOrders.reduce((sum, o) => sum + Number(o.total), 0),
      followUpsDue,
      newRetailers: newRetailersToday,
      distributorProspects: prospects,
      photos: photosToday,
    },
    retailerCount: retailers,
  };
  timing.finish({ actorId });
  return dashboardResult;
}

export async function deliveredValueForPeriod(db: PrismaClient, actorId: string, from: Date, to: Date) {
  const orders = await db.seeraSalesOrder.findMany({
    where: {
      salespersonId: actorId,
      type: "RETAILER_ORDER",
      createdAt: { gte: from, lte: to },
    },
    include: { lines: true },
  });
  return orders.reduce(
    (sum, order) =>
      sum +
      order.lines.reduce(
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
}

export async function executiveTargetProgress(db: PrismaClient, actorId: string, now = new Date()) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const target = await db.seeraTarget.findFirst({
    where: {
      employeeId: actorId,
      periodStart: { lte: now },
      periodEnd: { gte: now },
      metricType: "DELIVERED_VALUE",
    },
    orderBy: { periodStart: "desc" },
  });
  const periodStart = target?.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = target?.periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const orders = await db.seeraSalesOrder.findMany({
    where: { salespersonId: actorId, type: "RETAILER_ORDER", createdAt: { gte: periodStart, lte: periodEnd } },
    include: { lines: true, retailer: { select: { businessName: true, distributorId: true } } },
  });
  const booked = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const delivered = orders.reduce(
    (sum, order) =>
      sum +
      order.lines.reduce(
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
  const byDistributor = new Map<string, number>();
  for (const order of orders) {
    const key = order.retailer?.distributorId ?? "unmapped";
    const value = order.lines.reduce(
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
    );
    byDistributor.set(key, (byDistributor.get(key) ?? 0) + value);
  }
  const targetValue = Number(target?.targetValue ?? 0);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
  return {
    target: target ? { ...target, targetValue } : null,
    periodStart,
    periodEnd,
    booked,
    delivered,
    remaining: Math.max(0, targetValue - delivered),
    achievementPct: targetValue > 0 ? Math.round((delivered / targetValue) * 1000) / 10 : 0,
    daysRemaining,
    requiredDailyRunRate:
      daysRemaining > 0
        ? Math.round((Math.max(0, targetValue - delivered) / daysRemaining) * 100) / 100
        : Math.max(0, targetValue - delivered),
    distributorContribution: [...byDistributor.entries()].map(([distributorId, value]) => ({ distributorId, value })),
  };
}

export async function executiveDeliveredSales(
  db: PrismaClient,
  actorId: string,
  input: { skip?: number; take?: number } = {},
) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const orders = await db.seeraSalesOrder.findMany({
    where: { salespersonId: actorId, type: "RETAILER_ORDER" },
    include: {
      lines: true,
      retailer: { select: { businessName: true } },
      buyerPartner: { select: { legalName: true, tradeName: true } },
      sellerPartner: { select: { legalName: true, tradeName: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 30,
  });
  return orders.map((order) => {
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
    const deliveredQty = order.lines.reduce((sum, l) => sum + Number(l.deliveredQuantity), 0);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      retailer: order.retailer?.businessName ?? "Retailer",
      distributor: order.sellerPartner?.tradeName ?? order.sellerPartner?.legalName ?? order.buyerPartner?.tradeName ?? order.buyerPartner?.legalName ?? "—",
      status: order.status,
      booked: Number(order.total),
      deliveredQuantity: deliveredQty,
      eligibleCreditedAmount: eligible,
    };
  });
}

export async function executiveDsr(db: PrismaClient, actorId: string, workSessionId: string) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const session = await db.seeraWorkSession.findFirst({
    where: { id: workSessionId, employeeId: actorId },
  });
  if (!session)
    throw new FoundationError("SESSION_SCOPE_DENIED", "Work day unavailable", 403);
  const dayEnd = session.endedAt ?? new Date();
  const [visits, followUps, photos, unplannedAdded, distributorProspects, travelEstimate] = await Promise.all([
    db.seeraVisit.findMany({
      where: { workSessionId: session.id },
      include: {
        retailer: { select: { businessName: true, mobile: true, address: true, distributorId: true } },
      },
      orderBy: { checkedInAt: "asc" },
    }),
    db.seeraFollowUp.findMany({ where: { ownerId: actorId, createdAt: { gte: session.startedAt } } }),
    db.seeraVisitPhoto.count({ where: { actorId, capturedAt: { gte: session.startedAt }, deletedAt: null } }),
    db.seeraRetailer.count({
      where: { salespersonId: actorId, source: "UNPLANNED_FIELD_ADDED", createdAt: { gte: session.startedAt, lte: dayEnd } },
    }),
    db.seeraProspect.count({
      where: { ownerEmployeeId: actorId, prospectType: "DISTRIBUTOR", createdAt: { gte: session.startedAt, lte: dayEnd } },
    }),
    db.seeraTravelEstimate.findUnique({ where: { employeeId_workSessionId: { employeeId: actorId, workSessionId: session.id } } }),
  ]);
  const retailerIds = visits.map((v) => v.retailerId).filter((x): x is string => Boolean(x));
  const orders = retailerIds.length
    ? await db.seeraSalesOrder.findMany({
        where: { retailerId: { in: retailerIds }, salespersonId: actorId, createdAt: { gte: session.startedAt } },
        include: { lines: true },
      })
    : [];
  const rows = visits.map((visit) => {
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
      orderNumber: order?.orderNumber ?? null,
      bookedValue: order ? Number(order.total) : 0,
      outcome: visit.outcome,
      followUpAt: visit.followUpAt,
      linkedDeliveredOutcome: order?.status ?? null,
      linkedEligibleValue: eligible,
    };
  });
  return {
    session,
    planned: rows.length,
    visited: rows.filter((r) => r.outcome !== "SKIPPED").length,
    productive: rows.filter((r) => r.outcome === "PRODUCTIVE").length,
    skipped: rows.filter((r) => r.outcome === "SKIPPED").length,
    unplannedAdded,
    distributorProspects,
    orders: orders.length,
    bookedValue: rows.reduce((s, r) => s + r.bookedValue, 0),
    linkedEligibleValue: rows.reduce((s, r) => s + r.linkedEligibleValue, 0),
    followUps: followUps.length,
    photos,
    distanceTravelledKm: travelEstimate ? Number(travelEstimate.distanceKm) : null,
    gps: {
      startInsideGeofence: session.startInsideGeofence,
      startExceptionReason: session.startExceptionReason,
      returnedToHq: session.returnedToHq,
      endExceptionReason: session.endExceptionReason,
      visitExceptions: visits.filter((v) => v.gpsExceptionReason).length,
    },
    rows,
  };
}

// Date-wise work history (Founder-UAT requirement: Today/Yesterday/This week/This month/custom
// date range, with a per-day summary an Executive can open into full retailer-level detail via
// executiveDsr). Bounded to `take` (default 31, one month of calendar days) so the per-session
// summary aggregation below stays a small, predictable number of extra round trips rather than an
// unbounded N+1 — acceptable at UAT/single-executive scale; would need a real grouped rollup
// query before this is used at multi-year history scale.
export async function executiveDsrHistory(
  db: PrismaClient,
  actorId: string,
  input: { from?: Date; to?: Date; skip?: number; take?: number } = {},
) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const sessions = await db.seeraWorkSession.findMany({
    where: {
      employeeId: actorId,
      employeeRole: "SALES_EXECUTIVE",
      status: { not: "ACTIVE" },
      ...(input.from || input.to
        ? { startedAt: { gte: input.from, lte: input.to } }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    skip: input.skip ?? 0,
    take: input.take ?? 31,
  });
  return Promise.all(
    sessions.map(async (session) => {
      const dayEnd = session.endedAt ?? new Date();
      const [visits, orders, photos, newRetailers] = await Promise.all([
        db.seeraVisit.findMany({ where: { workSessionId: session.id }, select: { outcome: true } }),
        db.seeraSalesOrder.findMany({
          where: { salespersonId: actorId, createdAt: { gte: session.startedAt, lte: dayEnd } },
          select: { total: true },
        }),
        db.seeraVisitPhoto.count({ where: { actorId, capturedAt: { gte: session.startedAt, lte: dayEnd }, deletedAt: null } }),
        db.seeraRetailer.count({ where: { salespersonId: actorId, createdAt: { gte: session.startedAt, lte: dayEnd } } }),
      ]);
      return {
        session,
        visited: visits.filter((v) => v.outcome !== "SKIPPED").length,
        productive: visits.filter((v) => v.outcome === "PRODUCTIVE").length,
        skipped: visits.filter((v) => v.outcome === "SKIPPED").length,
        orders: orders.length,
        bookedValue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        photos,
        newRetailers,
      };
    }),
  );
}

// Read-only Distributor payment-follow-up context for the executive's own mapped Distributor(s) —
// reuses the same canonicalDistributorExposure the Distributor/S.S. Credit pages read from, scoped
// down to only the Distributors that actually supply this executive's own retailer book.
export async function executiveDistributorFollowUp(db: PrismaClient, actorId: string, now = new Date()) {
  await authorize(db, { actorId, permission: "field_reports:view_self" });
  const own = await db.seeraRetailer.findMany({
    where: { salespersonId: actorId, distributorId: { not: null } },
    select: { distributorId: true },
    distinct: ["distributorId"],
  });
  const distributorIds = own.map((r) => r.distributorId).filter((x): x is string => Boolean(x));
  if (!distributorIds.length) return [];
  const distributors = await db.seeraPartner.findMany({
    where: { id: { in: distributorIds } },
    select: { id: true, legalName: true, tradeName: true },
  });
  return Promise.all(
    distributors.map(async (distributor) => {
      const exposure = await canonicalDistributorExposure(db, distributor.id, now);
      const oldest = exposure.openOrders[0];
      const promise = oldest
        ? await db.seeraPaymentPromise.findFirst({
            where: { orderId: oldest.id },
            orderBy: { createdAt: "desc" },
          })
        : null;
      const lastPayment = await db.seeraPaymentRecord.findFirst({
        where: { payerType: "DISTRIBUTOR", payerId: distributor.id, status: { in: ["VERIFIED", "PARTIALLY_MATCHED"] } },
        orderBy: { paymentDate: "desc" },
      });
      return {
        distributor,
        outstanding: exposure.exposure,
        overdue: oldest ? now > oldest.originalDueDate! : false,
        originalDueDate: oldest?.originalDueDate ?? null,
        promiseDate: promise?.promisedPaymentDate ?? null,
        lastPaymentDate: lastPayment?.paymentDate ?? null,
      };
    }),
  );
}

export async function acknowledgeInstruction(db: PrismaClient, actorId: string, instructionId: string) {
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  const instruction = await db.seeraManagerInstruction.findFirst({
    where: { id: instructionId, assignedEmployeeId: actorId },
  });
  if (!instruction)
    throw new FoundationError("INSTRUCTION_SCOPE_DENIED", "Instruction unavailable", 403);
  return db.seeraManagerInstruction.update({
    where: { id: instruction.id },
    data: {
      acknowledgedAt: instruction.acknowledgedAt ?? new Date(),
      status: instruction.status === "ASSIGNED" ? "ACKNOWLEDGED" : instruction.status,
    },
  });
}

export async function completeInstruction(
  db: PrismaClient,
  actorId: string,
  instructionId: string,
  input: { remarks?: string },
) {
  await authorize(db, { actorId, permission: "field_day:manage_self" });
  const instruction = await db.seeraManagerInstruction.findFirst({
    where: { id: instructionId, assignedEmployeeId: actorId },
  });
  if (!instruction)
    throw new FoundationError("INSTRUCTION_SCOPE_DENIED", "Instruction unavailable", 403);
  return db.seeraManagerInstruction.update({
    where: { id: instruction.id },
    data: {
      acknowledgedAt: instruction.acknowledgedAt ?? new Date(),
      completedAt: new Date(),
      status: "COMPLETED",
      remarks: input.remarks,
    },
  });
}
