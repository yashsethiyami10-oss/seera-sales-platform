import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { eligibleGpsDistanceKm, nearestHqWithin, type TimedGpsPoint } from "./business-rules";

type Db = PrismaClient | Prisma.TransactionClient;

// A conventional policy key for the standard field policy. Amounts are always read from a dated
// policy row; absence is a first-class "policy not configured" state, never an implicit rupee rate.
const STANDARD_FIELD_VEHICLE_TYPE = "STANDARD_FIELD";

export async function standardFieldTravelPolicy(db: Db, now = new Date()) {
  return db.seeraTravelPolicy.findFirst({
    where: {
      vehicleType: STANDARD_FIELD_VEHICLE_TYPE,
      territoryId: null,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

export async function activeHqConfigurations(db: Db, now = new Date()) {
  const rows = await db.seeraHqConfiguration.findMany({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
  });
  return rows.map((row) => ({
    id: row.id,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    radiusMeters: row.radiusMeters,
    name: row.name,
  }));
}

// Evaluates a start/end GPS point against every currently-active HQ. Returns `null` for hqId
// when no HQ is configured yet (graceful degradation — never blocks Start/End Day on missing
// master data) and always reports the nearest HQ's distance so the UI can show "4.2km from HQ"
// even in the outside/exception case; never silently claims "inside" without a real GPS point.
export async function evaluateHqGeofence(
  db: Db,
  point: { latitude?: number; longitude?: number } | undefined,
  now = new Date(),
) {
  const hqs = await activeHqConfigurations(db, now);
  if (!hqs.length) return { hqId: null as string | null, inside: null as boolean | null, distanceMeters: null as number | null };
  if (point?.latitude == null || point?.longitude == null)
    return { hqId: null, inside: null, distanceMeters: null };
  const result = nearestHqWithin({ lat: point.latitude, lng: point.longitude }, hqs);
  return { hqId: result.hq?.id ?? null, inside: result.inside, distanceMeters: result.distanceMeters };
}

// One GPS sample per field-work event (start day / check-in / check-out / end day) — this is the
// achievable, honest MVP for a mobile-web PWA: continuous background tracking while the tab isn't
// foregrounded is not something a browser reliably grants (see field-travel-service report notes),
// so the governed distance is derived from these discrete, always-explicit-consent samples rather
// than claiming a continuous trail the platform can't actually guarantee.
export async function recordGpsSample(
  db: Db,
  input: {
    employeeId: string;
    workSessionId: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    source: "START_DAY" | "CHECK_IN" | "CHECK_OUT" | "END_DAY";
    trackingStatus: "OK" | "LOW_ACCURACY" | "PERMISSION_DENIED" | "UNAVAILABLE" | "EXCEPTION";
  },
) {
  if (input.latitude == null || input.longitude == null) return null;
  const last = await db.seeraGpsSample.findFirst({
    where: { workSessionId: input.workSessionId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return db.seeraGpsSample.create({
    data: {
      employeeId: input.employeeId,
      workSessionId: input.workSessionId,
      capturedAt: new Date(),
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      source: input.source,
      sequence: (last?.sequence ?? 0) + 1,
      trackingStatus: input.trackingStatus,
    },
  });
}

// Recomputes eligible field distance for a (now-ended) work session from its stored GPS samples,
// filtering noisy/impossible jumps, and upserts the same SeeraTravelEstimate record the rest of
// the codebase already reads — callers never need a second "which distance is real" source.
export async function recomputeSessionDistance(db: Db, employeeId: string, workSessionId: string) {
  const samples = await db.seeraGpsSample.findMany({
    where: { workSessionId },
    orderBy: { sequence: "asc" },
  });
  const points: TimedGpsPoint[] = samples.map((s) => ({
    lat: Number(s.latitude),
    lng: Number(s.longitude),
    capturedAt: s.capturedAt,
    accuracy: s.accuracy != null ? Number(s.accuracy) : null,
  }));
  const quality = eligibleGpsDistanceKm(points);
  const { distanceKm, sampleCount } = quality;
  if (sampleCount < 2) return null;
  const existingEstimate = await db.seeraTravelEstimate.findUnique({
    where: { employeeId_workSessionId: { employeeId, workSessionId } },
    select: { id: true },
  });
  const protectedClaim = existingEstimate ? await db.seeraTaClaim.findFirst({
    where: {
      travelEstimateId: existingEstimate.id,
      status: { in: ["SENT_TO_ACCOUNTS", "MANAGER_VERIFIED", "ACCOUNTS_APPROVED", "PAID", "CLOSED"] },
    },
    select: { id: true },
  }) : null;
  if (protectedClaim) return db.seeraTravelEstimate.findUnique({
    where: { employeeId_workSessionId: { employeeId, workSessionId } },
  });
  return db.seeraTravelEstimate.upsert({
    where: { employeeId_workSessionId: { employeeId, workSessionId } },
    update: {
      distanceKm,
      sourceEvents: quality as Prisma.InputJsonValue,
      calculationVersion: quality.calculationVersion,
    },
    create: {
      employeeId,
      workSessionId,
      estimateDate: new Date(),
      distanceKm,
      sourceEvents: quality as Prisma.InputJsonValue,
      calculationVersion: quality.calculationVersion,
    },
  });
}

// Admin-governed HQ configuration — never hard-codes one person's location. Reuses the existing
// master-data authority (`master:manage`) rather than inventing a new permission for a single
// small config table.
export async function createHqConfiguration(
  db: PrismaClient,
  actorId: string,
  input: { name: string; latitude: number; longitude: number; radiusMeters: number; effectiveFrom: Date },
) {
  await authorize(db, { actorId, permission: "master:manage" });
  if (input.radiusMeters <= 0) throw new FoundationError("INVALID_HQ_RADIUS", "Radius must be positive", 400);
  const hq = await db.seeraHqConfiguration.create({
    data: {
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusMeters: input.radiusMeters,
      status: "ACTIVE",
      effectiveFrom: input.effectiveFrom,
      createdById: actorId,
    },
  });
  await recordAudit(db, {
    actorId,
    action: "hq_configuration.created",
    entityType: "SeeraHqConfiguration",
    entityId: hq.id,
    afterState: { name: hq.name },
  });
  return hq;
}

export async function listHqConfigurations(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "master:manage" });
  return db.seeraHqConfiguration.findMany({ orderBy: { createdAt: "desc" } });
}

// Admin-governed monthly TA/DA read model — never posts/deducts anything; purely a computed view
// over already-derived GPS distance (SeeraTravelEstimate) x the governed rate (SeeraTravelPolicy).
// DA eligibility rule (documented, adjustable later): the field day must have been formally ended
// AND have real activity (a visit or measured distance) — a session started and immediately ended
// with nothing recorded is not an eligible field day.
export async function executiveTaDaMonthlySummary(
  db: PrismaClient,
  actorId: string,
  targetEmployeeId: string,
  monthStart: Date,
  monthEnd: Date,
) {
  const self = actorId === targetEmployeeId;
  await authorize(db, { actorId, permission: self ? "field_reports:view_self" : "manager_team:view" });
  const policy = await standardFieldTravelPolicy(db, monthEnd);
  const ratePerKm = policy ? Number(policy.ratePerKm) : null;
  const dailyAllowance = policy ? Number(policy.dailyAllowance ?? policy.fixedAllowance ?? 0) : null;
  const sessions = await db.seeraWorkSession.findMany({
    where: {
      employeeId: targetEmployeeId,
      startedAt: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { startedAt: "asc" },
    include: {
      visits: { select: { id: true } },
    },
  });
  const estimates = await db.seeraTravelEstimate.findMany({
    where: { workSessionId: { in: sessions.map((s) => s.id) } },
  });
  const claims = await db.seeraTaClaim.findMany({ where: { travelEstimateId: { in: estimates.map((e) => e.id) } } });
  const estimateBySession = new Map(estimates.map((e) => [e.workSessionId, e]));
  const claimByEstimate = new Map(claims.map((claim) => [claim.travelEstimateId, claim]));
  const rows = sessions.map((session) => {
    const estimate = estimateBySession.get(session.id);
    const claim = estimate ? claimByEstimate.get(estimate.id) : undefined;
    const gpsDistanceKm = estimate ? Number(estimate.distanceKm) : 0;
    const hasActivity = session.visits.length > 0 || gpsDistanceKm > 0;
    const dayEnded = session.status === "ENDED";
    const daEligible = dayEnded && hasActivity;
    const taAmount = claim?.policyStatus === "CONFIGURED" ? Number(claim.totalApproved ?? claim.totalClaimed) : null;
    const daAmount = claim?.policyStatus === "CONFIGURED" ? Number(claim.dailyAllowance) : null;
    return {
      sessionId: session.id,
      date: session.startedAt,
      startTime: session.startedAt,
      endTime: session.endedAt,
      visits: session.visits.length,
      hqStart: session.startInsideGeofence,
      hqReturn: session.returnedToHq,
      gpsDistanceKm,
      eligibleDistanceKm: Number(claim?.approvedDistanceKm ?? claim?.claimedDistanceKm ?? gpsDistanceKm),
      ratePerKm,
      taAmount,
      daEligible,
      daAmount,
      totalTaDa: taAmount,
      exceptions: [session.startExceptionReason, session.endExceptionReason].filter(Boolean),
      gpsConfidence: estimate ? "ESTIMATED_FROM_CHECKPOINTS" : "NO_SAMPLES",
      distanceMethod: "CHECKPOINT_HAVERSINE_ESTIMATE",
      policyStatus: claim?.policyStatus ?? (policy ? "CONFIGURED" : "POLICY_NOT_CONFIGURED"),
      status: claim?.status ?? (session.status === "ENDED" ? "FINALIZATION_PENDING" : "IN_PROGRESS"),
      gpsReviewRequired: claim?.gpsReviewRequired ?? false,
      claimId: claim?.id ?? null,
    };
  });
  return {
    employeeId: targetEmployeeId,
    monthStart,
    monthEnd,
    ratePerKm,
    dailyAllowance,
    rows,
    totals: {
      taAmount: rows.some((r) => r.policyStatus === "CONFIGURED") ? rows.reduce((s, r) => s + (r.taAmount ?? 0), 0) : null,
      daAmount: rows.some((r) => r.policyStatus === "CONFIGURED") ? rows.reduce((s, r) => s + (r.daAmount ?? 0), 0) : null,
      totalTaDa: rows.some((r) => r.policyStatus === "CONFIGURED") ? rows.reduce((s, r) => s + (r.totalTaDa ?? 0), 0) : null,
      eligibleDays: rows.filter((r) => r.daEligible).length,
    },
  };
}
