# Security Architecture

Where each security requirement actually lives in this codebase, and what's
still a placeholder versus load-bearing.

## Input validation
Every Server Action and API route parses its input through a Zod schema
(`lib/validations/*.ts`) before touching the database — nothing reaches
Prisma unvalidated. Validation failures return a structured
`{ fieldErrors }` shape (see `lib/errors.ts`) rather than a raw exception, so
the frontend can highlight the specific field.

## CSRF protection
**Server Actions are CSRF-protected automatically** by Next.js 15 itself — it
checks the request's `Origin` header against the deployment's own host
before a Server Action is allowed to run, rejecting cross-origin POSTs
outright. This is why this project pushes almost all mutations through
Server Actions (`app/actions/*.ts`) rather than hand-rolled API routes: it's
not just cleaner code, it's a security default this codebase gets for free.

The few REST API routes that exist (`app/api/products`, `/categories`,
`/blog`, `/homepage`) are all **read-only GETs** — CSRF is a non-issue for
them by definition, since CSRF attacks exploit state-changing requests. If a
future mutation-performing API route is ever added (rather than a Server
Action), it must manually verify the `Origin`/`Referer` header the way
Server Actions do automatically — don't assume NextAuth's session cookie
alone is sufficient protection for a POST route.

## Webhook verification
Two inbound webhook endpoints exist, both HMAC-signature-gated before any
payload field is trusted:

- **`app/api/webhooks/razorpay/route.ts`** — verifies `x-razorpay-signature`
  against the raw request body using `RAZORPAY_WEBHOOK_SECRET` (a
  *different* secret from the API key pair, configured separately in
  Razorpay's dashboard when registering the webhook URL). This is the real
  source of truth for payment status in production — see the comment at
  the top of that file for why the client-side `verifyPayment` call alone
  isn't sufficient.
- **`app/api/webhooks/shipping/[provider]/route.ts`** — one URL per courier
  (`/shiprocket`, `/delhivery`, `/bluedart`, `/dtdc`), each still HMAC-gated,
  but the actual signature *scheme* varies by provider in reality and the
  generic HMAC-SHA256 check here is a reasonable default rather than a
  confirmed match for all four — verify each provider's actual webhook
  signing method against their current docs before relying on it.

Both handlers read the raw text body (`req.text()`) before verifying,
never `req.json()` first — signature verification requires the exact byte
sequence that was signed; parsing and re-serializing JSON can silently
change whitespace/key order and break a legitimate signature check.

Both also return HTTP 200 even when internal processing throws (after
signature verification succeeds) — returning an error status would make the
provider retry-storm a webhook whose failure was on this app's side, not
theirs. Failures are logged for manual follow-up instead.

## Rate limiting
`lib/rate-limit.ts` implements the interface (`checkRateLimit(key, limit,
windowMs)`) and, as of this audit pass, **is actually called** from:
- `lib/auth.ts` `authorize()` — 5 attempts/5min, keyed by email (not
  email+IP — NextAuth's `authorize` callback signature doesn't expose the
  request object to read an IP from; revisit if that becomes available)
- `app/actions/auth.ts` `signup()` — 5/hour, keyed by IP via
  `headers().get("x-forwarded-for")`
- `app/actions/coupons.ts` `validateCoupon()` — 20/min, keyed by IP

**What's still a placeholder, unchanged from before:** the limiter itself
stores counters in process memory — correct for a single instance, silently
ineffective across multiple. Swap for Upstash Redis (`@upstash/ratelimit`)
before deploying to more than one server instance, keeping the same
`checkRateLimit(key, limit, windowMs)` signature so the three call sites
above don't need to change.

## Password hashing
`bcryptjs` at cost factor 12 (`app/actions/auth.ts`, `lib/auth.ts`). Login
and signup return identical generic failure messages regardless of whether
the email exists or the password is wrong — deliberate, to prevent user
enumeration.

## Authentication & authorization
JWT sessions (Auth.js v5) with `role` embedded in the token. Every
Server Action calls `requireStaff()`/`requireAdmin()`/`requireCustomer()`
(`lib/rbac.ts`) itself — `middleware.ts` also gates `/admin` and `/account`
at the edge, but that's a UX fast-path, not the security boundary. A request
that reaches a Server Action through any other path still can't do anything
its role doesn't allow.

**Every function exported from a `"use server"` file is independently
callable as its own RPC endpoint** — not just by the component that happens
to import it. This app hit that exact issue while wiring payments:
`processRefund` (in `app/actions/payments.ts`) was originally written to
trust that `refundOrder` (in `app/actions/orders.ts`) had already checked
`requireStaff()` before calling it. But because `processRefund` is itself
exported from a `"use server"` file, a client could call it directly and
skip `refundOrder`'s check entirely. The fix — `processRefund` now calls
`requireStaff()` itself, redundantly with its callers, on purpose. **The
rule going forward: every exported function in any `app/actions/*.ts` file
must enforce its own auth, even if every current caller already checked.**
Never assume a Server Action is "internal" just because it happens to only
be called from other server code today.

## Error handling
`lib/errors.ts` normalizes every thrown value — Zod errors, known `AppError`
subclasses, Prisma constraint violations, anything unexpected — into one
consistent `{ success: false, error: { message, code } }` shape. Unrecognized
errors are logged with full detail server-side (see Logging below) and
returned to the client as a generic "something went wrong" message —
database/stack-trace internals are never leaked to a response body.

## Logging
`lib/logger.ts` — structured JSON lines to stdout, plus a `withLogging()`
wrapper (used on the blog actions as an example) that logs every Server
Action call with its duration and success/failure. This is explicitly a
placeholder for a real pipeline: pipe stdout to your log aggregator, and
route `logger.error` calls to an exception tracker (Sentry) as well — stdout
alone gets lost more often than teams expect.

## Environment variables
`.env.example` lists every required variable with a comment on each.
`NEXT_PUBLIC_RAZORPAY_KEY_ID` is the one deliberate exception marked safe to
expose client-side; everything else (`DATABASE_URL`, `AUTH_SECRET`, Razorpay
secret, Google OAuth secret) is server-only and must never be prefixed
`NEXT_PUBLIC_`.
