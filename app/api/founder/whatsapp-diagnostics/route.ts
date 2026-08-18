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
 * GET  — read-only: lists every phone number under the configured WABA (so a freshly-added
 *        number's Phone Number ID can be identified) plus a debug_token check of the configured
 *        system-user token's scopes/app/validity.
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

export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    await authorize(prisma, { actorId: user.id, permission: "system:super_admin" });

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !wabaId) {
      return NextResponse.json({ error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID not configured in this environment" }, { status: 503 });
    }

    const lookupDisplayNumber = new URL(request.url).searchParams.get("displayNumber");
    const matchLast10 = lookupDisplayNumber ? digitsOnly(lookupDisplayNumber).slice(-10) : null;

    const [phonesRes, tokenDebugRes] = await Promise.all([
      fetch(
        `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,status,is_official_business_account`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
      fetch(`${GRAPH_BASE}/debug_token?input_token=${accessToken}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);

    const phonesBody: any = await phonesRes.json().catch(() => null);
    const tokenDebugBody: any = await tokenDebugRes.json().catch(() => null);
    const phones: any[] = Array.isArray(phonesBody?.data) ? phonesBody.data : [];

    return NextResponse.json({
      httpStatusPhoneNumbersCall: phonesRes.status,
      httpStatusTokenDebugCall: tokenDebugRes.status,
      wabaId,
      configuredPhoneNumberIdInVercel: configuredPhoneNumberId ?? null,
      phoneNumbers: phones.map((phone) => ({
        ...phone,
        isCurrentlyConfiguredInVercel: phone.id === configuredPhoneNumberId,
        matchesRequestedDisplayNumber: matchLast10 ? digitsOnly(phone.display_phone_number ?? "").slice(-10) === matchLast10 : undefined,
      })),
      tokenDebug: tokenDebugBody?.data
        ? {
            appId: tokenDebugBody.data.app_id,
            application: tokenDebugBody.data.application,
            isValid: tokenDebugBody.data.is_valid,
            scopes: tokenDebugBody.data.scopes,
            expiresAt: tokenDebugBody.data.expires_at,
            type: tokenDebugBody.data.type,
          }
        : null,
      phonesCallError: phonesBody?.error ?? null,
      tokenDebugCallError: tokenDebugBody?.error ?? null,
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
