/**
 * Classifies a WhatsApp/Meta Cloud API send failure as TRANSIENT (worth a bounded retry —
 * network blip, rate limit, momentary 5xx) or PERMANENT (retrying changes nothing — bad
 * token, unapproved/misconfigured template, invalid recipient) so the outbox dispatcher
 * (lib/messaging/outbox-dispatch.ts) never burns its retry budget hammering a call that
 * will fail identically every time, per the Founder directive: "the system must not
 * repeatedly attempt a template known to be unavailable" / "never continuously retry
 * invalid numbers/templates."
 *
 * Reads `.status` (HTTP status) and `.metaCode` (Meta's `error.code` from the response
 * body) if present — both are attached by lib/messaging/providers/whatsapp-business.ts
 * when it throws. Falls back to TRANSIENT for anything unrecognized, matching this
 * repo's existing lib/retry.ts default-retry posture (never assume "permanent" without
 * a clear signal).
 */
export type WhatsAppFailureClass = "TRANSIENT" | "PERMANENT";

// Meta error codes that are configuration/authorization problems, not per-message flukes —
// see https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes.
const PERMANENT_META_CODES = new Set([
  190, // invalid/expired access token
  10, // permission denied
  200, // permission error
  131030, // recipient not in allowed list (unverified sender / dev mode)
  131026, // message undeliverable (invalid/unreachable number)
  131047, // re-engagement window / 24h session expired without an approved template
  132000, // template param count mismatch
  132001, // template does not exist for this language/name
  132005, // template is paused
  132007, // template format mismatch
  133010, // account not registered / not a WhatsApp Business account
  135000, // generic permanently-invalid-parameter class
]);

export function classifyWhatsAppError(error: unknown): WhatsAppFailureClass {
  if (error && typeof error === "object") {
    const err = error as { status?: number; metaCode?: number };
    if (typeof err.metaCode === "number" && PERMANENT_META_CODES.has(err.metaCode)) return "PERMANENT";
    if (typeof err.status === "number") {
      if (err.status === 401 || err.status === 403) return "PERMANENT";
      if (err.status === 400) return "PERMANENT"; // Cloud API 400s are near-universally malformed request/template/recipient, not transient
      if (err.status === 429 || err.status >= 500) return "TRANSIENT";
    }
  }
  return "TRANSIENT";
}
