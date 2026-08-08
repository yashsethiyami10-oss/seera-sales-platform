# Deployment Validator

`lib/production/deployment-validator.ts` — `validateDeployment()`.

## "Do not deploy automatically."

Every check is read-only observation of the *currently running* process and environment. Nothing here
triggers `npm run build`, a Prisma migration, or an actual deploy — this validates readiness, it does not
act on it.

## The 6 checks

| Area | What's checked | Failure condition |
|---|---|---|
| `ENVIRONMENT_CONFIGURATION` | Which of 6 optional integration vars (`GOOGLE_CLIENT_ID`, `CLOUDINARY_URL`, `RAZORPAY_KEY_ID`, `RESEND_API_KEY`, `SHIPPING_PROVIDER`, `MESSAGING_PROVIDER`) are set | Never fails — reports configured/not-configured only, per `CLAUDE.md`'s own documented "each fails gracefully at its own call site" reasoning |
| `REQUIRED_VARIABLES` | Reuses `lib/env.ts`'s `validateEnv()` | `DATABASE_URL` or `AUTH_SECRET`/`NEXTAUTH_SECRET` missing |
| `REQUIRED_SERVICES` | `SELECT 1` against the database | Connection fails |
| `DATABASE_READINESS` | `prisma.user.count()` | Query fails (schema not applied, not just "DB unreachable") |
| `BUILD_READINESS` | Always passes — see below | Never fails |
| `STARTUP_VALIDATION` | `validateEnv()` again, framed as the boot-time check | Same as `REQUIRED_VARIABLES` |

## Why `BUILD_READINESS` always passes

There is no way to check "did the build succeed" from inside a Server Action running *after* that build
already succeeded — Next.js would not be serving requests at all if it hadn't. This check is honest about
that: it always reports `passed: true` with a detail explaining build/typecheck validation happens via
`npm run build`/`tsc --noEmit` (see [testing.md](./testing.md) for this module's own actual results), not
as a live runtime check. This is not a rubber-stamp masquerading as a real check — it's a deliberately
honest non-check, documented as such.

## `ready`

`true` only when every one of the 6 checks passes. Since `ENVIRONMENT_CONFIGURATION` and
`BUILD_READINESS` always pass, `ready` in practice tracks `REQUIRED_VARIABLES`/`REQUIRED_SERVICES`/
`DATABASE_READINESS`/`STARTUP_VALIDATION` — the 4 that can genuinely fail.
