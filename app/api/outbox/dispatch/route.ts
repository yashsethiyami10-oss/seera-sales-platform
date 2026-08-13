import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { dispatchRetailerCommunications } from "@/lib/sales-distribution/retailer-communication-service";
import { getMessagingProvider } from "@/lib/messaging";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";

// Pre-launch Pass 0B: the real trigger point for the outbox worker (dispatchRetailerCommunications
// — see that function's own header comment for the full retry/backoff/dead-letter/stale-lock
// design). This route deliberately does NOT sit behind the normal cookie-session auth used by every
// other route in this app — it's meant to be called by an external scheduler (cron, systemd timer,
// a platform's scheduled-function feature, etc.), which has no browser session to present. Instead
// it's gated by a shared secret that only the deployment operator and the scheduler know.
//
// Fails CLOSED: if SEERA_OUTBOX_WORKER_SECRET isn't configured at all, every request is denied —
// the alternative (allow unauthenticated access when unconfigured) would let any anonymous caller
// drain/manipulate the outbox, exactly what this gate exists to prevent.
//
// Deployment note (not yet active in any environment): the application side of "drain PENDING
// outbox rows on a schedule" ends here. Actually invoking this endpoint periodically requires
// deployment-side scheduler configuration (e.g. a platform cron job POSTing here with the secret
// header) — that configuration does not exist yet in this repository and is not claimed to.
export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.SEERA_OUTBOX_WORKER_SECRET;
    if (!configuredSecret) throw new FoundationError("OUTBOX_WORKER_NOT_CONFIGURED", "SEERA_OUTBOX_WORKER_SECRET is not set — worker trigger is disabled until configured", 503);
    const presentedSecret = request.headers.get("x-outbox-worker-secret");
    if (!presentedSecret || presentedSecret !== configuredSecret) throw new FoundationError("ACCESS_DENIED", "Invalid or missing worker secret", 403);

    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    enforceRateLimit(`outbox-dispatch:${ip}`, 30, 60_000);

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(100, Math.max(1, Number(body?.limit) || 20));

    const results = await dispatchRetailerCommunications(prisma, getMessagingProvider, { limit });
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    // Only counts/ids returned — never the recipient mobile number or message body, even to this
    // authenticated internal caller (data minimization; the scheduler only needs to know it ran).
    return NextResponse.json({ processed: results.length, summary, ids: results.map((r) => r.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
