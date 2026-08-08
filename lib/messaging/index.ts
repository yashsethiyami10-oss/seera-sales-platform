import type { MessagingProvider } from "@/lib/messaging/types";
import { TwilioProvider } from "@/lib/messaging/providers/twilio";
import { Msg91Provider } from "@/lib/messaging/providers/msg91";
import { InteraktProvider } from "@/lib/messaging/providers/interakt";
import { WhatsAppBusinessProvider } from "@/lib/messaging/providers/whatsapp-business";

/**
 * `MESSAGING_PROVIDER` env var picks the active SMS/WhatsApp provider —
 * same single-switch-point pattern as `lib/shipping/index.ts`. Note that
 * Interakt and the direct WhatsApp Business API only implement `sendWhatsApp`
 * (their `sendSms` throws) — if a deployment needs both SMS and WhatsApp
 * and picks one of those two, SMS sends will fail until a second provider
 * instance is wired in for that channel specifically. MSG91 and Twilio are
 * the two options here that cover both channels from one account.
 */
export function getMessagingProvider(): MessagingProvider {
  const provider = process.env.MESSAGING_PROVIDER ?? "MSG91";
  switch (provider) {
    case "TWILIO":
      return new TwilioProvider();
    case "MSG91":
      return new Msg91Provider();
    case "INTERAKT":
      return new InteraktProvider();
    case "WHATSAPP_BUSINESS":
      return new WhatsAppBusinessProvider();
    default:
      throw new Error(`Unknown MESSAGING_PROVIDER: ${provider}`);
  }
}

export * from "@/lib/messaging/types";
