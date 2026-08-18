import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { authorize } from "@/lib/foundation/authorization-service";

/**
 * Founder-only, read-mostly Meta Graph API diagnostics for WhatsApp phone-number registration
 * problems. Exists because Vercel's "Sensitive" env var flag (correctly) makes
 * WHATSAPP_ACCESS_TOKEN unreadable via `vercel env pull`/CLI/dashboard once set — the only place
 * that can ever see the real value again is this app's own server runtime. This route runs the
 * exact same Graph API calls an external diagnostic script would, but from inside that runtime,
 * so the token never has to leave Vercel. It never returns the token or any request PIN in its
 * response or logs.
 *
 * GET  — read-only: discovers EVERY WhatsApp Business Account the configured system-user token
 *        actually has access to (not just the one WABA ID currently sitting in Vercel — a fresh
 *        number added in the Meta UI can live under a different WABA than the one this app was
 *        originally configured for), then lists the phone numbers under each one. Candidate WABA
 *        IDs come from three sources: the env-configured WHATSAPP_BUSINESS_ACCOUNT_ID, an optional
 *        `?wabaId=` query param (for a WABA ID read directly off the Meta UI), and
 *        debug_token's own `granular_scopes[].target_ids` — the exact set of asset IDs Meta
 *        actually granted this token access to for whatsapp_business_management /
 *        whatsapp_business_messaging, which is the authoritative way to find a WABA the token can
 *        see without already knowing its ID. For each candidate: first fetches the node itself
 *        (`GET /<id>?fields=id,name,...`) to distinguish "this ID isn't a WABA at all" from
 *        "it's a WABA but the token lacks phone_numbers access", then fetches the
 *        `/<id>/phone_numbers` edge (the correct, documented way to enumerate numbers under a
 *        WABA — never `?fields=phone_numbers` on the WABA node itself, which is what produced the
 *        earlier "(#100) Tried accessing nonexisting field (phone_numbers)" error: that error is
 *        Graph API's generic response whenever an edge is requested as a field on a node that
 *        doesn't expose it that way, which reliably happens when the ID being queried isn't
 *        actually resolving as a real WABA under this token's access).
 * POST — { phoneNumberId, pin } — calls Meta's official phone-number registration endpoint
 *        (POST /<PHONE_NUMBER_ID>/register) once, does not retry, and returns Meta's own
 *        HTTP status / error.code / error.error_subcode / error.type / fbtrace_id / message
 *        verbatim so the real root cause can be read off directly instead of guessed.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body: any = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    await authorize(prisma, { actorId: user.id, permission: "system:super_admin" });

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const configuredWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken) {
      return NextResponse.json({ error: "WHATSAPP_ACCESS_TOKEN not configured in this environment" }, { status: 503 });
    }

    const searchParams = new URL(request.url).searchParams;
    const lookupDisplayNumber = searchParams.get("displayNumber");
    const explicitWabaId = searchParams.get("wabaId");
    const matchLast10 = lookupDisplayNumber ? digitsOnly(lookupDisplayNumber).slice(-10) : null;

    const tokenDebug = await fetchJson(`${GRAPH_BASE}/debug_token?input_token=${accessToken}`, accessToken);
    const granularScopes: Array<{ scope?: string; target_ids?: string[] }> = Array.isArray(tokenDebug.body?.data?.granular_scopes)
      ? tokenDebug.body.data.granular_scopes
      : [];
    const scopeTargetIds = granularScopes.flatMap((entry) => (Array.isArray(entry.target_ids) ? entry.target_ids : []));

    const candidateWabaIds = Array.from(new Set([configuredWabaId, explicitWabaId, ...scopeTargetIds].filter((id): id is string => Boolean(id))));

    const wabaResults = await Promise.all(
      candidateWabaIds.map(async (candidateId) => {
        const [node, phoneNumbers] = await Promise.all([
          fetchJson(`${GRAPH_BASE}/${candidateId}?fields=id,name,timezone_id,message_template_namespace`, accessToken),
          fetchJson(
            `${GRAPH_BASE}/${candidateId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,status,is_official_business_account`,
            accessToken,
          ),
        ]);
        const phones: any[] = Array.isArray(phoneNumbers.body?.data) ? phoneNumbers.body.data : [];
        return {
          candidateWabaId: candidateId,
          isCurrentlyConfiguredInVercel: candidateId === configuredWabaId,
          discoveredVia: candidateId === configuredWabaId ? "env" : candidateId === explicitWabaId ? "query_param" : "token_granular_scopes",
          nodeFetch: { status: node.status, resolvesAsWaba: node.status === 200 && Boolean(node.body?.id), body: node.status === 200 ? node.body : node.body?.error ?? node.body },
          phoneNumbersFetch: {
            status: phoneNumbers.status,
            error: phoneNumbers.body?.error ?? null,
            phoneNumbers: phones.map((phone) => ({
              ...phone,
              isCurrentlyConfiguredInVercel: phone.id === configuredPhoneNumberId,
              matchesRequestedDisplayNumber: matchLast10 ? digitsOnly(phone.display_phone_number ?? "").slice(-10) === matchLast10 : undefined,
            })),
          },
        };
      }),
    );

    return NextResponse.json({
      // Lets a caller confirm this response actually came from the deployment they think it did
      // — Vercel binds env vars per-deployment at build time, so a stale-looking env value here is
      // diagnostic of "wrong/old deployment serving traffic", not necessarily "env var never
      // updated". Both auto-populated by Vercel at build/runtime, not app-managed.
      servingDeployment: { gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, vercelEnv: process.env.VERCEL_ENV ?? null, deploymentUrl: process.env.VERCEL_URL ?? null },
      configuredWabaIdInVercel: configuredWabaId ?? null,
      configuredPhoneNumberIdInVercel: configuredPhoneNumberId ?? null,
      candidateWabaIdsChecked: candidateWabaIds,
      wabaResults,
      tokenDebug: tokenDebug.body?.data
        ? {
            appId: tokenDebug.body.data.app_id,
            application: tokenDebug.body.data.application,
            isValid: tokenDebug.body.data.is_valid,
            type: tokenDebug.body.data.type,
            scopes: tokenDebug.body.data.scopes,
            granularScopes: tokenDebug.body.data.granular_scopes ?? null,
            expiresAt: tokenDebug.body.data.expires_at,
          }
        : null,
      tokenDebugCallError: tokenDebug.status !== 200 ? tokenDebug.body?.error ?? tokenDebug.body : null,
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    await authorize(prisma, { actorId: user.id, permission: "system:super_admin" });

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return NextResponse.json({ error: "WHATSAPP_ACCESS_TOKEN not configured in this environment" }, { status: 503 });

    const body: any = await request.json().catch(() => ({}));
    const phoneNumberId: string | undefined = body?.phoneNumberId;
    const pin: string | undefined = body?.pin;
    if (!phoneNumberId || typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: "Body must be { phoneNumberId: string, pin: 6-digit string }" }, { status: 400 });
    }

    const registerRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    // `pin` and `accessToken` are never logged or echoed anywhere below — only Meta's own
    // response body is read back, and Meta's error payloads never contain the caller's credentials.
    const registerBody: any = await registerRes.json().catch(() => null);

    return NextResponse.json({
      httpStatus: registerRes.status,
      success: registerRes.ok,
      metaErrorCode: registerBody?.error?.code ?? null,
      metaErrorSubcode: registerBody?.error?.error_subcode ?? null,
      metaErrorType: registerBody?.error?.type ?? null,
      metaErrorMessage: registerBody?.error?.message ?? null,
      fbtraceId: registerBody?.error?.fbtrace_id ?? null,
      rawResponseOnSuccess: registerRes.ok ? registerBody : undefined,
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
