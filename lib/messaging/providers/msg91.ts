import { retryWithBackoff } from "@/lib/retry";
import type { MessagingProvider } from "@/lib/messaging/types";

/** MSG91 (https://docs.msg91.com) — widely used by Indian D2C brands for
 * SMS, OTP, and WhatsApp from one account. */
export class Msg91Provider implements MessagingProvider {
  readonly name = "MSG91" as const;

  private authKey() {
    const key = process.env.MSG91_AUTH_KEY;
    if (!key) throw new Error("MSG91_AUTH_KEY is not set");
    return key;
  }

  async sendSms(to: string, message: string) {
    const senderId = process.env.MSG91_SENDER_ID;
    if (!senderId) throw new Error("MSG91_SENDER_ID is not set");

    return retryWithBackoff(async () => {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { authkey: this.authKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderId, mobiles: to, message }),
      });
      if (!res.ok) {
        const error: any = new Error(`MSG91 SMS send failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
      const data = await res.json();
      return { id: data.request_id ?? "" };
    });
  }

  async sendWhatsApp(to: string, templateName: string, params: string[]) {
    return retryWithBackoff(async () => {
      const res = await fetch("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/", {
        method: "POST",
        headers: { authkey: this.authKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          integrated_number: process.env.MSG91_WHATSAPP_NUMBER,
          content_type: "template",
          payload: { to, type: "template", template: { name: templateName, language: { code: "en" }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] } },
        }),
      });
      if (!res.ok) {
        const error: any = new Error(`MSG91 WhatsApp send failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
      const data = await res.json();
      return { id: data.message_id ?? "" };
    });
  }
}
