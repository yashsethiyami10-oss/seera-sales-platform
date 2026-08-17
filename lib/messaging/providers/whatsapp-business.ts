import { retryWithBackoff } from "@/lib/retry";
import type { MessagingProvider } from "@/lib/messaging/types";
import { DocumentSendUnsupportedError } from "@/lib/messaging/types";

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

  async sendWhatsApp(to: string, templateName: string, params: string[]) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) throw new Error("WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are not set");

    return retryWithBackoff(async () => {
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: templateName, language: { code: "en_US" }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] },
        }),
      });
      if (!res.ok) {
        const error: any = new Error(`WhatsApp Cloud API send failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
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

    return retryWithBackoff(async () => {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("file", new Blob([Buffer.from(document.bytes)], { type: document.mimeType }), document.filename);
      form.append("type", document.mimeType);
      const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!uploadRes.ok) {
        const error: any = new Error(`WhatsApp Cloud API media upload failed: ${uploadRes.status}`);
        error.status = uploadRes.status;
        throw error;
      }
      const uploaded = await uploadRes.json();
      const mediaId = uploaded.id;
      if (!mediaId) throw new Error("WhatsApp Cloud API media upload did not return a media id");

      const sendRes = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "document",
          document: { id: mediaId, filename: document.filename, caption: document.caption },
        }),
      });
      if (!sendRes.ok) {
        const error: any = new Error(`WhatsApp Cloud API document send failed: ${sendRes.status}`);
        error.status = sendRes.status;
        throw error;
      }
      const sent = await sendRes.json();
      return { id: sent.messages?.[0]?.id ?? "" };
    });
  }
}
