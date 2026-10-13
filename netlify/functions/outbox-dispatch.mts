// Netlify Scheduled Function: triggers the Seera WhatsApp outbox worker every 5 minutes by calling the
// existing, secret-gated POST /api/outbox/dispatch route (app/api/outbox/dispatch/route.ts). It does not
// send anything itself and never touches the database — the route claims and sends queued rows.
//
// Safety:
// - Disabled unless SEERA_OUTBOX_DISPATCH_ENABLED is exactly "true" (default: does nothing).
// - The secret is read only from process.env and sent only in the request header; it is never logged
//   or returned. No response body, phone number or message text is logged — only status and counts.
// - One attempt per run, bounded by a 20 s timeout (Netlify stops scheduled functions at 30 s). A failed
//   run is not retried here; the next scheduled run (5 minutes later) simply tries again.
// - Netlify runs scheduled functions only on the published production deploy, never on drafts,
//   deploy previews, branch deploys or local builds/tests.

// Must be the primary (www) host, which serves the route directly. The apex redirects (observed 308 for a
// POST on 2026-10-13) - a needless extra hop that a host change could turn into a 301, which fetch would
// replay as a GET (answered only with the CRON_SECRET check). The request below also refuses redirects, so
// any such change fails loudly in the logs instead of silently never dispatching.
export const DISPATCH_URL = "https://www.seeradetergent.in/api/outbox/dispatch";
export const REQUEST_TIMEOUT_MS = 20_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function runOutboxDispatch(env: Record<string, string | undefined> = process.env, fetchImpl: FetchLike = fetch) {
  if (env.SEERA_OUTBOX_DISPATCH_ENABLED !== "true") {
    console.log("outbox_dispatch.skipped", { reason: "disabled" });
    return { ran: false as const, reason: "disabled" as const };
  }
  const secret = env.SEERA_OUTBOX_WORKER_SECRET;
  if (!secret) {
    console.error("outbox_dispatch.skipped", { reason: "secret_not_configured" });
    return { ran: false as const, reason: "secret_not_configured" as const };
  }
  try {
    const response = await fetchImpl(DISPATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-outbox-worker-secret": secret },
      body: JSON.stringify({ limit: 20 }),
      // Never follow a redirect: the worker secret must only ever reach DISPATCH_URL itself.
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Only the governed error code (e.g. ACCESS_DENIED, OUTBOX_WORKER_NOT_CONFIGURED) — never the body.
      const code = await response
        .json()
        .then((b: { error?: { code?: unknown } }) => (typeof b?.error?.code === "string" ? b.error.code : undefined))
        .catch(() => undefined);
      console.error("outbox_dispatch.failed", { status: response.status, code });
      return { ran: true as const, ok: false as const, status: response.status };
    }
    const body = (await response.json().catch(() => ({}))) as { processed?: unknown; retailer?: unknown; partner?: unknown; summary?: unknown };
    const counts = {
      processed: typeof body.processed === "number" ? body.processed : undefined,
      retailer: typeof body.retailer === "number" ? body.retailer : undefined,
      partner: typeof body.partner === "number" ? body.partner : undefined,
      summary:
        body.summary && typeof body.summary === "object"
          ? Object.fromEntries(Object.entries(body.summary as Record<string, unknown>).filter(([, v]) => typeof v === "number"))
          : undefined,
    };
    console.log("outbox_dispatch.ok", { status: response.status, ...counts });
    return { ran: true as const, ok: true as const, status: response.status, ...counts };
  } catch (error) {
    const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "network_error";
    console.error("outbox_dispatch.failed", { reason });
    return { ran: true as const, ok: false as const, reason };
  }
}

export default async () => {
  await runOutboxDispatch();
};

export const config = { schedule: "*/5 * * * *" };
