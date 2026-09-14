import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { runDailyAttendanceMarking } from "@/lib/sales-distribution/attendance-service";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";

// Attendance Intelligence add-on — the scheduled entry point for runDailyAttendanceMarking().
// Deliberately copies /api/outbox/dispatch's dual-auth shape verbatim (see that route's header
// comment for the full reasoning): a POST path for any external scheduler via a shared secret, and
// a GET path for Vercel's native Cron feature. Both fail CLOSED if unconfigured — no anonymous
// caller can ever trigger this. This is the SAME reuse-the-existing-pattern instruction Section 14
// asked for; no new scheduler mechanism was invented.
//
// PRODUCTION CONFIGURATION STILL REQUIRED, DOCUMENTED HERE, NOT DONE SILENTLY:
//   1. Set SEERA_ATTENDANCE_WORKER_SECRET (or CRON_SECRET, already used by outbox-dispatch) in the
//      deployment environment.
//   2. Add a cron entry to vercel.json pointing at this route, timed at/after
//      ATTENDANCE_END_CUTOFF_IST_HOUR (21:00 IST = 15:30 UTC) — e.g. "30 15 * * *". This project's
//      Vercel account is confirmed Hobby-tier (see outbox/dispatch's comment), which only allows
//      one cron schedule total in some Vercel plan configurations depending on account state —
//      verify both crons are actually accepted before relying on this, or trigger this route from
//      the SAME external scheduler already recommended for outbox dispatch instead.
//   3. Known, stated gap (see attendance-service.ts's top comment): this job can only ever produce
//      PRESENT/LATE/ABSENT — there is no leave/holiday/week-off data source in this codebase yet,
//      so it WILL mark an employee ABSENT on their real weekly off unless a Founder/Manager
//      corrects it first. Do not enable a real recurring schedule until that gap is closed.
async function runJob(request: Request, rateLimitKey: string) {
  enforceRateLimit(rateLimitKey, 5, 60_000);
  const isGet = request.method === "GET";
  const url = new URL(request.url);
  const dateParam = isGet ? url.searchParams.get("date") : (await request.json().catch(() => ({})))?.date;
  const forceParam = isGet ? url.searchParams.get("force") : (await request.json().catch(() => ({})))?.force;
  const result = await runDailyAttendanceMarking(prisma, {
    date: dateParam ? new Date(dateParam) : undefined,
    force: forceParam === "true" || forceParam === true,
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.SEERA_ATTENDANCE_WORKER_SECRET;
    if (!configuredSecret) throw new FoundationError("ATTENDANCE_WORKER_NOT_CONFIGURED", "SEERA_ATTENDANCE_WORKER_SECRET is not set — automatic attendance marking is disabled until configured", 503);
    const presented = request.headers.get("x-attendance-worker-secret");
    if (!presented || presented !== configuredSecret) throw new FoundationError("ACCESS_DENIED", "Invalid or missing worker secret", 403);
    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    return await runJob(request, `attendance-auto-mark:${ip}`);
  } catch (error) {
    return apiFailure(error, request);
  }
}

/** Vercel Cron entry point — see the shared header comment above. */
export async function GET(request: Request) {
  try {
    const configuredSecret = process.env.CRON_SECRET;
    if (!configuredSecret) throw new FoundationError("ATTENDANCE_CRON_NOT_CONFIGURED", "CRON_SECRET is not set — scheduled attendance marking is disabled until configured", 503);
    const presented = request.headers.get("authorization");
    if (presented !== `Bearer ${configuredSecret}`) throw new FoundationError("ACCESS_DENIED", "Invalid or missing cron authorization", 403);
    return await runJob(request, "attendance-auto-mark:cron");
  } catch (error) {
    return apiFailure(error, request);
  }
}
