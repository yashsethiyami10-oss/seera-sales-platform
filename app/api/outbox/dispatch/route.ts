import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { dispatchRetailerCommunications } from "@/lib/sales-distribution/retailer-communication-service";
import { dispatchPartnerCommunications } from "@/lib/sales-distribution/partner-communication-service";
import { getMessagingProvider } from "@/lib/messaging";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";

// Pre-launch Pass 0B: the real trigger point for the outbox worker (dispatchRetailerCommunications
// / dispatchPartnerCommunications — see lib/messaging/outbox-dispatch.ts's header comment for the
// full retry/backoff/dead-letter/stale-lock design shared by both). This route deliberately does
// NOT sit behind the normal cookie-session auth used by every other route in this app — it's meant
// to be called by a scheduler with no browser session to present. Two independent, equally-gated
// entry points exist for that:
//   POST, header `x-outbox-worker-secret` — for any external scheduler (systemd timer, a different
//     platform's scheduled-function feature, manual operator trigger).
//   GET, header `Authorization: Bearer <CRON_SECRET>` — Vercel's own native Cron Jobs feature only
//     issues GET requests and automatically attaches this exact header/scheme when `CRON_SECRET` is
//     set as a project env var (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
//     — see vercel.json for the schedule this project declares.
// Both fail CLOSED: if the relevant secret isn't configured at all, every request on that entry
// point is denied — the alternative (allow unauthenticated access when unconfigured) would let any
// anonymous caller drain/manipulate the outbox, exactly what this gate exists to prevent.
async function runDispatch(request: Request, rateLimitKey: string) {
  enforceRateLimit(rateLimitKey, 30, 60_000);
  const url = new URL(request.url);
  const limitParam = request.method === "GET" ? url.searchParams.get("limit") : (await request.json().catch(() => ({})))?.limit;
  const limit = Math.min(100, Math.max(1, Number(limitParam) || 20));

  const [retailerResults, partnerResults] = await Promise.all([
    dispatchRetailerCommunications(prisma, getMessagingProvider, { limit }),
    dispatchPartnerCommunications(prisma, getMessagingProvider, { limit }),
  ]);
  const results = [...retailerResults, ...partnerResults];
  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  // Only counts/ids returned — never the recipient mobile number or message body, even to this
  // authenticated internal caller (data minimization; the scheduler only needs to know it ran).
  return NextResponse.json(
    { processed: results.length, retailer: retailerResults.length, partner: partnerResults.length, summary, ids: results.map((r) => r.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.SEERA_OUTBOX_WORKER_SECRET;
    if (!configuredSecret) throw new FoundationError("OUTBOX_WORKER_NOT_CONFIGURED", "SEERA_OUTBOX_WORKER_SECRET is not set — worker trigger is disabled until configured", 503);
    const presentedSecret = request.headers.get("x-outbox-worker-secret");
    if (!presentedSecret || presentedSecret !== configuredSecret) throw new FoundationError("ACCESS_DENIED", "Invalid or missing worker secret", 403);

    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    return await runDispatch(request, `outbox-dispatch:${ip}`);
  } catch (error) {
    return apiFailure(error, request);
  }
}

/** Vercel Cron entry point — see the shared header comment above. */
export async function GET(request: Request) {
  try {
    const configuredSecret = process.env.CRON_SECRET;
    if (!configuredSecret) throw new FoundationError("OUTBOX_CRON_NOT_CONFIGURED", "CRON_SECRET is not set — scheduled dispatch is disabled until configured", 503);
    const presented = request.headers.get("authorization");
    if (presented !== `Bearer ${configuredSecret}`) throw new FoundationError("ACCESS_DENIED", "Invalid or missing cron authorization", 403);

    return await runDispatch(request, "outbox-dispatch:cron");
  } catch (error) {
    return apiFailure(error, request);
  }
}
