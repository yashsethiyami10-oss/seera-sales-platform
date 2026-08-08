/**
 * Email provider interface. `lib/notify/send.ts` depends only on this
 * shape — swapping Resend for SendGrid or SES means writing one new file
 * implementing `EmailProvider` and changing one line in `getEmailProvider()`
 * below, nothing else in the codebase changes.
 */
export type EmailPayload = { to: string; subject: string; html: string };
export interface EmailProvider {
  send(payload: EmailPayload): Promise<{ id: string }>;
}

/**
 * Resend implementation (https://resend.com) — chosen as the default here
 * because its API is a single REST call with no SDK required, which keeps
 * this file readable as a reference for writing the next provider. Using
 * plain `fetch` rather than the `resend` npm package for the same reason
 * `lib/payments/razorpay.ts` does.
 */
export class ResendEmailProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<{ id: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set — see .env.example");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM_ADDRESS ?? "Muv <orders@muv.co.in>",
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error: any = new Error(`Resend send failed: ${res.status} ${body}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  }
}

export function getEmailProvider(): EmailProvider {
  // Single switch point for provider choice — set EMAIL_PROVIDER in .env
  // once a second provider is actually implemented (SendGridEmailProvider,
  // SesEmailProvider, following the same `EmailProvider` interface).
  return new ResendEmailProvider();
}
