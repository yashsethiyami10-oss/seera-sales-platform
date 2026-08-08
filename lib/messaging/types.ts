/**
 * One interface for both SMS and WhatsApp, since most Indian providers
 * (MSG91, Interakt) offer both from the same account, and the call sites in
 * this app (order/shipping/delivery updates) don't care which channel
 * carries the message — that's a provider/account configuration choice,
 * not something the order-lifecycle code should hardcode.
 */
export interface MessagingProvider {
  readonly name: "TWILIO" | "MSG91" | "INTERAKT" | "WHATSAPP_BUSINESS";
  sendSms(to: string, message: string): Promise<{ id: string }>;
  sendWhatsApp(to: string, templateName: string, params: string[]): Promise<{ id: string }>;
}
