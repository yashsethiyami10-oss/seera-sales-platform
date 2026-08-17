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
  /**
   * Sends an actual file as a WhatsApp document message (not a text/template message
   * carrying a link) — used for real PDF sharing (Quotation/GST Invoice) so the
   * recipient receives the document itself in-chat, matching what a Founder means by
   * "share the PDF" as distinct from "share a link to the PDF".
   *
   * Deliberately takes raw bytes, not a URL: this app's document routes
   * (/api/documents/[id]/download, /api/document-shares/[token]) require an
   * authenticated Seera session to fetch, so they are not fetchable by a provider's
   * own servers the way a public media URL would be. A provider that can only accept
   * documents by public URL (no raw-bytes upload endpoint) cannot honestly support
   * this method — it should throw a clear, typed error rather than silently degrade
   * to a link, exactly like sendSms already does on WhatsApp-only providers.
   */
  sendDocument(
    to: string,
    document: { bytes: Uint8Array; filename: string; mimeType: string; caption?: string },
  ): Promise<{ id: string }>;
}

/** Thrown by a provider's sendDocument when it genuinely cannot send a raw file
 * (no media-upload capability, or not configured) — callers use this to distinguish
 * "provider doesn't support real document sending, fall back to a link" from a
 * transient send failure that should surface as an error instead. */
export class DocumentSendUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentSendUnsupportedError";
  }
}
