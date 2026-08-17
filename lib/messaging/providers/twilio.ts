import { retryWithBackoff } from "@/lib/retry";
import type { MessagingProvider } from "@/lib/messaging/types";
import { DocumentSendUnsupportedError } from "@/lib/messaging/types";

/** Twilio (https://www.twilio.com/docs/sms and /whatsapp). Both SMS and
 * WhatsApp go through the same Messages API, just with a `whatsapp:` prefix
 * on the number for WhatsApp sends. */
export class TwilioProvider implements MessagingProvider {
  readonly name = "TWILIO" as const;

  private async send(to: string, body: string, from: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set");

    return retryWithBackoff(async () => {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const error: any = new Error(`Twilio send failed: ${res.status} ${errBody}`);
        error.status = res.status;
        throw error;
      }
      const data = await res.json();
      return { id: data.sid };
    });
  }

  async sendSms(to: string, message: string) {
    const from = process.env.TWILIO_SMS_FROM;
    if (!from) throw new Error("TWILIO_SMS_FROM is not set");
    return this.send(to, message, from);
  }

  async sendWhatsApp(to: string, templateName: string, params: string[]) {
    // Twilio's WhatsApp templates are configured in their console, referenced
    // by content SID rather than a plain name — `templateName` here is
    // expected to be that content SID once templates are set up.
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!from) throw new Error("TWILIO_WHATSAPP_FROM is not set");
    const body = `Template ${templateName} params: ${params.join(", ")}`; // replace with Twilio Content API call once templates are approved
    return this.send(`whatsapp:${to}`, body, `whatsapp:${from}`);
  }

  // Twilio's Messages API accepts media only via a publicly reachable MediaUrl, not a
  // raw-bytes upload endpoint — this app's document routes require an authenticated
  // Seera session to fetch, so they cannot be handed to Twilio as a MediaUrl. Throws
  // honestly rather than silently degrading to a link-only send.
  async sendDocument(): Promise<{ id: string }> {
    throw new DocumentSendUnsupportedError("Twilio only accepts media by public MediaUrl — this app's document routes require login and cannot be used as a MediaUrl");
  }
}
