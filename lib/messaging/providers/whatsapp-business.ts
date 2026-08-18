import { retryWithBackoff } from "@/lib/retry";
import type { MessagingProvider } from "@/lib/messaging/types";
import { DocumentSendUnsupportedError } from "@/lib/messaging/types";
import { normalizeIndianMobile } from "@/lib/messaging/phone";

/**
 * Single governed source for the Graph API version this whole provider talks to — was
 * previously hardcoded as the literal string "v19.0" in two separate places (send +
 * media upload), which is exactly the "multiple hardcoded guesses" the integration audit
 * flagged. `WHATSAPP_GRAPH_VERSION` lets an operator bump this centrally (e.g. after a
 * Meta deprecation) without a code change; defaults to the same v19.0 this provider has
 * always used, so unset behaves identically to before.
 */
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Fallback ONLY for callers outside Seera's own governed template registry
 * (lib/messaging/whatsapp-templates.ts) that don't pass a `languageCode` — this provider is
 * shared with the separate, unrelated Institutional Sales module (actions/inst-quotations.ts,
 * lib/notify/send-messaging.ts), which is out of scope for this reconciliation and must keep
 * working exactly as before. Seera's own call sites (lib/sales-distribution/
 * retailer-communication-service.ts, partner-communication-service.ts) always pass their
 * template's own Meta-approved language explicitly now and never rely on this default — see
 * the per-template `languageCode` field in whatsapp-templates.ts, which replaced this as
 * Seera's actual source of truth after a Hindi-approved template was found being sent as
 * "en_US" by the old single-global-default design.
 */
const LEGACY_DEFAULT_TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

/** Builds an Error carrying `.status` (HTTP status) and, when Meta's JSON error body was
 * parseable, `.metaCode`/`.metaMessage` — read by lib/messaging/error-classification.ts to
 * tell a permanent misconfiguration (bad token, unapproved template, invalid recipient)
 * apart from a transient blip worth retrying. Never includes the access token. */
async function graphApiError(prefix: string, res: Response): Promise<Error> {
  const error: any = new Error(`${prefix}: ${res.status}`);
  error.status = res.status;
  try {
    const body = await res.json();
    if (body?.error?.code !== undefined) error.metaCode = body.error.code;
    if (body?.error?.message) error.metaMessage = String(body.error.message).slice(0, 500);
  } catch {
    // Non-JSON error body — status code alone still drives classification.
  }
  return error;
}

/**
 * Meta's WhatsApp Business Cloud API directly (https://developers.facebook.com/docs/whatsapp/cloud-api)
 * — no third-party layer (Twilio/MSG91/Interakt) in between. Requires your
 * own approved WhatsApp Business Account and phone number ID; more setup
 * than a managed provider, but no per-message markup on top of Meta's own
 * conversation pricing. SMS has no equivalent in this API — same
 * restriction as Interakt, and for the same underlying reason (this is a
 * WhatsApp-only surface).
 */
export class WhatsAppBusinessProvider implements MessagingProvider {
  readonly name = "WHATSAPP_BUSINESS" as const;

  async sendSms(): Promise<{ id: string }> {
    throw new Error("WhatsApp Business Cloud API does not support SMS — configure a separate SMS provider");
  }

  async sendWhatsApp(to: string, templateName: string, params: string[], languageCode?: string) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) throw new Error("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are not set");
    // Seera's own governed call sites always pass their template's specific language explicitly
    // (see lib/messaging/whatsapp-templates.ts) — this default only exists for the unrelated,
    // out-of-scope Institutional Sales call sites that don't pass one.
    const resolvedLanguageCode = languageCode ?? LEGACY_DEFAULT_TEMPLATE_LANGUAGE;
    // Canonical India send format is enforced here, at the actual Meta call boundary, so no
    // caller mistake upstream (double `+91`, dashes, a raw 10-digit number) can reach Meta
    // malformed — see lib/messaging/phone.ts. `to` may already be pre-normalized by the
    // caller; re-normalizing an already-canonical `91XXXXXXXXXX` value is a no-op.
    const recipient = normalizeIndianMobile(to) ?? to.replace(/\D/g, "");
    if (!/^91[6-9]\d{9}$/.test(recipient)) {
      const error: any = new Error(`Recipient is not a valid Indian mobile number for WhatsApp send`);
      error.status = 400;
      error.metaCode = "INVALID_RECIPIENT_FORMAT";
      throw error;
    }

    return retryWithBackoff(async () => {
      const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: { name: templateName, language: { code: resolvedLanguageCode }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] },
        }),
      });
      if (!res.ok) throw await graphApiError("WhatsApp Cloud API send failed", res);
      const data = await res.json();
      return { id: data.messages?.[0]?.id ?? "" };
    });
  }

  /**
   * Real document send, not a link: uploads the raw PDF bytes to Meta's Media endpoint
   * (multipart form-data — no publicly reachable URL required, unlike the `link` form
   * of a document message), then references the returned media id in a `type:
   * "document"` message. This is the standard, documented WhatsApp Cloud API flow for
   * sending a file the sender's own server holds rather than one already hosted at a
   * public URL — see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media.
   */
  async sendDocument(to: string, document: { bytes: Uint8Array; filename: string; mimeType: string; caption?: string }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) throw new DocumentSendUnsupportedError("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are not set");
    const recipient = normalizeIndianMobile(to) ?? to.replace(/\D/g, "");
    if (!/^91[6-9]\d{9}$/.test(recipient)) throw new DocumentSendUnsupportedError("Recipient is not a valid Indian mobile number for WhatsApp document send");

    return retryWithBackoff(async () => {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("file", new Blob([Buffer.from(document.bytes)], { type: document.mimeType }), document.filename);
      form.append("type", document.mimeType);
      const uploadRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!uploadRes.ok) throw await graphApiError("WhatsApp Cloud API media upload failed", uploadRes);
      const uploaded = await uploadRes.json();
      const mediaId = uploaded.id;
      if (!mediaId) throw new Error("WhatsApp Cloud API media upload did not return a media id");

      const sendRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "document",
          document: { id: mediaId, filename: document.filename, caption: document.caption },
        }),
      });
      if (!sendRes.ok) throw await graphApiError("WhatsApp Cloud API document send failed", sendRes);
      const sent = await sendRes.json();
      return { id: sent.messages?.[0]?.id ?? "" };
    });
  }
}
