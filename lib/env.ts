/**
 * Boot-time environment sanity check (Phase 16). This app has a large set of
 * genuinely *optional* env vars — pluggable shipping/messaging providers
 * (lib/shipping/index.ts, lib/messaging/index.ts), Google OAuth, Cloudinary,
 * Razorpay, Resend — each already fails gracefully at its own call site
 * (see e.g. lib/auth.ts's Google provider conditional, actions/media.ts's
 * own "Missing Cloudinary configuration" error). Re-validating every one of
 * those here would either duplicate that logic or wrongly demand vars a
 * given deployment never intends to configure.
 *
 * What this DOES check: the small set of vars that are unconditionally
 * required for the app to function at all — a missing `DATABASE_URL` or
 * `AUTH_SECRET` doesn't fail gracefully anywhere, it just breaks every page.
 * `validateEnv()` only warns (never throws) — it's a diagnostic surfaced in
 * server logs at startup, not a hard gate that could turn a recoverable
 * misconfiguration into a crashed deploy.
 */

const REQUIRED = ["DATABASE_URL"] as const;

export function validateEnv(): { ok: boolean; missing: string[] } {
  const missing: string[] = REQUIRED.filter((key) => !process.env[key]);

  // NextAuth's own boot check already throws on a missing secret in
  // production (see lib/auth.ts's comment) — checked here too so it shows
  // up in the same startup diagnostic rather than a separate crash later.
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) missing.push("AUTH_SECRET (or NEXTAUTH_SECRET)");

  return { ok: missing.length === 0, missing };
}
