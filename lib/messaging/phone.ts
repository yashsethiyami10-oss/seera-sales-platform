/**
 * Canonical WhatsApp/Meta Cloud API recipient phone normalization for India.
 *
 * Meta's Cloud API `to` field expects a country-code-prefixed, digit-only string —
 * no leading `+`, no spaces/dashes, no leading zero. For an Indian mobile number that
 * is exactly `91` followed by the 10-digit subscriber number: `91XXXXXXXXXX` (12 digits
 * total). This app's own stored numbers (SeeraRetailer.mobile/whatsapp,
 * SeeraPartner.primaryContact.mobile) are plain 10-digit Indian mobiles (validated
 * elsewhere against /^[6-9]\d{9}$/, see lib/validations/*.ts) with no country code — so
 * every WhatsApp send site must add the `91` prefix exactly once here, never inline.
 *
 * Returns null (never throws) for anything that isn't confidently a normalizable Indian
 * mobile number — callers must treat null as a governed "cannot send" outcome (e.g. mark
 * the outbox row FAILED with a clear reason), never fall back to sending a malformed
 * recipient to Meta.
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  // Already 91-prefixed (12 digits, e.g. copied from a WhatsApp-format field) — never
  // double-prefix by adding another "91" on top of one that's already there.
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) return digits;
  // Leading trunk "0" occasionally present in manually-entered numbers (e.g. "09876543210").
  if (digits.length === 11 && digits.startsWith("0") && /^0[6-9]/.test(digits)) return `91${digits.slice(1)}`;
  return null;
}

/** True only for a string already in the canonical `91XXXXXXXXXX` (12-digit) send format. */
export function isCanonicalIndianMobile(value: string): boolean {
  return /^91[6-9]\d{9}$/.test(value);
}
