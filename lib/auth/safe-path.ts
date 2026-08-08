/**
 * MUV Enterprise UI — Stage 1 (Authentication and Role-Aware Entry).
 *
 * Deliberately its own file with zero imports: `redirect-policy.ts`
 * (server-only — imports `@/lib/auth`/`@/lib/prisma`) needs this same
 * check, and so does `login-form.tsx` (a Client Component) — importing
 * `redirect-policy.ts` directly from a Client Component would pull
 * Node-only code (bcryptjs, the Prisma adapter) into the browser bundle.
 * This file is safe for both.
 */

/**
 * Shape-only validation — "is this even a same-origin, internal path,"
 * never "is the user allowed to go there" (that authorization check
 * lives in `redirect-policy.ts`, server-only). Rejects: anything that
 * isn't a string; empty strings; absolute URLs (`https://…`,
 * `mailto:…`); protocol-relative URLs (`//evil.com`, which the browser
 * resolves as `https://evil.com`); backslash tricks some browsers still
 * normalize to protocol-relative (`/\evil.com`, `\\evil.com`); and
 * control characters, including newline/CR (header-injection
 * defense-in-depth). A bare `/` or `/admin/orders` passes.
 */
export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(value)) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\") || value.startsWith("\\")) return false;
  return true;
}
