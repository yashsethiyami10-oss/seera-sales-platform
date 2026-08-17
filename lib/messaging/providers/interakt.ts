import { retryWithBackoff } from "@/lib/retry";
import type { MessagingProvider } from "@/lib/messaging/types";
import { DocumentSendUnsupportedError } from "@/lib/messaging/types";

/**
 * Interakt (https://www.interakt.shop) is WhatsApp-only — a common choice
 * specifically for order/shipping notifications on WhatsApp, layered on
 * top of Meta's Cloud API with easier template management. It has no SMS
 * product, so `sendSms` here deliberately throws rather than silently doing
 * nothing — pick a different provider (or a hybrid setup with two provider
 * instances, one per channel) if SMS is also required alongside Interakt.
 */
export class InteraktProvider implements MessagingProvider {
  readonly name = "INTERAKT" as const;

  async sendSms(): Promise<{ id: string }> {
    throw new Error("Interakt does not support SMS — configure a separate SMS provider for that channel");
  }

  async sendWhatsApp(to: string, templateName: string, params: string[]) {
    const apiKey = process.env.INTERAKT_API_KEY;
    if (!apiKey) throw new Error("INTERAKT_API_KEY is not set");

    return retryWithBackoff(async () => {
      const res = await fetch("https://api.interakt.ai/v1/public/message/", {
        method: "POST",
        headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: "+91",
          phoneNumber: to.replace(/^\+?91/, ""),
          type: "Template",
          template: { name: templateName, languageCode: "en", bodyValues: params },
        }),
      });
      if (!res.ok) {
        const error: any = new Error(`Interakt send failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
      const data = await res.json();
      return { id: data.id ?? "" };
    });
  }

  // Interakt's public Message API only accepts media by publicly reachable URL
  // (mediaUrl), not a raw-bytes upload endpoint — this app's document routes require
  // an authenticated Seera session to fetch, so they cannot be handed to Interakt as
  // a mediaUrl. Throws honestly rather than silently degrading to a link-only send.
  async sendDocument(): Promise<{ id: string }> {
    throw new DocumentSendUnsupportedError("Interakt only accepts documents by public media URL — this app's document routes require login and cannot be used as a mediaUrl");
  }
}
