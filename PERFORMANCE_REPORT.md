# MUV Digital Flagship™ — Performance Report

Companion to `WEBSITE_COMPLETION_AUDIT.md`. Grounded in a direct, independent code-reading pass
plus this repository's own `PRODUCTION_READY.md` (a real, driven `next build`/`next start`
verification pass) — not assumed from any single document.

---

## 1. Images — Completed

Every product/content image on the storefront goes through `next/image` with a shared
`cloudinaryUrl()` helper injecting `f_auto,q_auto,dpr_auto` plus context-appropriate crop presets.
No raw `<img>` tag was found anywhere in `app/**` page code; the handful that exist in
`components/` are individually justified exceptions (external QR code, client-side upload
previews, small logo icons), confirmed not to represent a missed optimization on customer-facing
content. `PRODUCTION_READY.md` independently confirms zero raw `<img>` usage as of its own pass.

## 2. Fonts — Completed

`next/font/google` self-hosts all three brand typefaces (Fraunces, Inter, Cormorant Garamond) at
build time with `display: "swap"` — no runtime Google Fonts request. `PRODUCTION_READY.md`
confirms this was a deliberate upgrade over an earlier runtime font-loading hook.

## 3. Bundle size & code-splitting — Partially Complete

- `recharts` — a dependency `PRODUCTION_READY.md`'s own earlier pass flagged as needing a
  dynamic-import check — **is no longer a dependency at all**. The admin analytics page uses a
  hand-rolled chart component instead, avoiding the heavy library entirely. This concern from
  earlier documents is fully resolved, not just mitigated.
- Next.js's automatic per-route code-splitting means the large internal Sales OS/Founder OS/
  Enterprise surface (~125 route segments) does not bloat the public storefront's bundle,
  regardless of its own size.
- **Gap**: only one `next/dynamic` usage exists in the entire codebase (the AI widget loader). No
  explicit dynamic imports were found for modals or other heavy client components (e.g. the
  checkout/cart client bundles, the review-submission modal) — a real, if modest, missed
  optimization opportunity. Not blocking; worth a follow-up pass.

## 4. Caching — Completed

`lib/cache.ts` implements tagged `unstable_cache` + `revalidateTag`/`revalidatePath`, actually
wired into `/api/products` and CMS mutations (verified specifically for homepage/CMS edits — the
static homepage correctly regenerates on an admin edit, not just on a timer). The known caveat
(this cache store is per-instance, and would need a custom Redis-backed `cacheHandler` for a true
multi-region deployment) is already documented in the code's own comments — appropriate for the
current single-region Vercel deployment.

## 5. Server-side correctness affecting perceived performance — Completed

`PRODUCTION_READY.md`'s real, driven verification pass (a genuine `next build`/`next start`
against a real database, not a stub) found and fixed several bugs that would otherwise have made
the site *feel* broken rather than merely slow: a font-configuration bug that 500'd every page, a
TypeScript-widening bug that silently broke every Server Action's success/failure check across 60
call sites, a missing Suspense boundary that failed the entire production build, and an
Edge-Runtime bundling bug that broke every authenticated route. `npm audit` was brought from 3
moderate vulnerabilities to 0. All of this is confirmed fixed and has remained fixed through every
subsequent sprint's own clean `tsc --noEmit`/`npm run build` checks.

## 6. A newly-surfaced concern: in-memory rate limiting on a serverless deployment target

`lib/rate-limit.ts`'s counters live in process memory. Every prior document frames this as "fine
for one server instance, revisit before horizontal scaling" — written against an assumed
persistent single-VPS deployment. **The actual live deployment target is Vercel serverless
functions**, where invocations are not guaranteed to share memory or even land on the same
instance. This means the login/signup/coupon rate limiters may already be materially less
effective in production today than every prior document's risk framing assumed — see
`LAUNCH_BLOCKER_REPORT.md` #7 for the full finding. This is a correctness/security concern more
than a "performance" one in the traditional sense, but is recorded here because the underlying
mechanism (`checkRateLimit`) is a performance-oriented primitive whose behavior changed when the
deployment target changed.

## 7. Loading states as a perceived-performance factor — Partially Complete

11 `loading.tsx` files give the customer-facing storefront (home, shop, collections, PDP,
checkout, cart, journal) and the account/admin roots real Suspense-boundary loading UI, so slow
data fetches don't render blank. The ~125 internal Sales OS/Founder OS route segments have none of
their own (see `MOBILE_UX_REPORT.md` §4) — a real but internal-tool-only perceived-performance
gap, not customer-facing.

## 8. What this report cannot verify

No real Core Web Vitals numbers exist because no analytics/RUM tooling is wired in at all (see
`LAUNCH_BLOCKER_REPORT.md` #5) — LCP/CLS/INP claims in this report are all inferred from code
patterns (fixed-height galleries, `next/image`, self-hosted fonts, tagged caching), not measured
against real traffic. Recommend adding Vercel Analytics or `next/web-vitals` reporting immediately
after launch specifically so real numbers exist to evaluate against.

## 9. Recommendation

Performance work here is in genuinely good shape at the code level — no rewrite or redesign is
warranted. The two concrete follow-ups are: (1) resolve the rate-limiter/serverless mismatch
(§6, elevated priority — it's a security-adjacent correctness question, not a nice-to-have), and
(2) add real measurement (Vercel Analytics/Web Vitals) so future performance claims can be
verified against real data rather than code inspection alone.
