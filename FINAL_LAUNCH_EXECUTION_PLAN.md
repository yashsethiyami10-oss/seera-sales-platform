# MUV Digital Flagship™ — Final Launch Execution Plan

Companion to the seven other Phase 1 audit reports. This is a **planning document only** — a
recommended sequence for a future, separately-authorized execution phase. Nothing in this
document has been executed. No code has been written, no runtime changed, no deployment
performed, as required by the Founder's explicit Phase 1 constraints.

---

## Why this sequencing, not another

The findings across all seven companion reports fall into four different *kinds* of work, and
they don't compete for the same time or the same person — they should run in parallel where
possible:

1. **External account/business actions** (Razorpay keys, GSTIN, domain DNS, Google Console) —
   these have real lead time and depend on people outside engineering. Start these first, in
   parallel with everything else, precisely because they're not on the engineering critical path.
2. **Small, concrete code/asset fixes** — favicon, OG image, analytics wiring, `/inquire` metadata
   — genuinely fast, no architectural risk, can be done any time.
3. **One irreplaceable step that has never actually happened**: a real human on a real device
   walking the full customer journey. This cannot be parallelized away or substituted with more
   code review — it is the one QA method that has ever actually found a real defect in this
   codebase's history (Phase 1D).
4. **Founder decisions that block nothing else but need to be made deliberately**: Founder OS
   activation, dedicated search page, notification-center scope, contrast/opacity trade-off.

---

## Step 1 — Start now, in parallel (no engineering dependency)

Founder/business-side, start immediately since these have real lead time:

- [ ] Add real live-mode Razorpay keys (`RAZORPAY_KEY_ID`/`SECRET`/`NEXT_PUBLIC_RAZORPAY_KEY_ID`)
      to Vercel Production; register the webhook URL in the Razorpay dashboard once the domain
      question (below) is settled. (`LAUNCH_BLOCKER_REPORT.md` #1)
- [ ] Decide: keep launching on `muv-platform.vercel.app`, or attach `muvcare.in` as the real
      custom domain? If the latter: DNS, Vercel domain attachment, re-point `NEXTAUTH_URL`/
      `NEXT_PUBLIC_SITE_URL`, update the Google OAuth redirect URI to match. (`LAUNCH_BLOCKER_REPORT.md` #2)
- [ ] Fix the Google OAuth `error=Configuration` issue in Google Cloud Console (Authorized
      redirect URIs). (`LAUNCH_BLOCKER_REPORT.md` #8)
- [ ] Confirm real `MUV_GSTIN` and the correct `SELLER_STATE` value; set both in production.
      (`LAUNCH_BLOCKER_REPORT.md` #6)
- [ ] Rule on the open Cloudinary credential-provenance question (dev sandbox vs. rotate).
      (`IMAGE_COMPLETION_REPORT.md` §5)
- [ ] Confirm `AUTH_SECRET` in Vercel Production is a real rotated value, not the repo's
      checked-in placeholder. (`LAUNCH_BLOCKER_REPORT.md` Tier 3)
- [ ] Confirm `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` are actually set in Production — code is real
      and fails gracefully, but silently, if unset.

## Step 2 — Small, fast, no-risk engineering fixes (can run alongside Step 1)

- [ ] Add a real favicon (`app/icon.png` or `public/favicon.ico`).
- [ ] Add a real 1200×630 `public/og-default.png` social-share image.
- [ ] Add `metadata`/`generateMetadata` to `/inquire/[channel]` so it stops inheriting the
      homepage's canonical URL.
- [ ] Wire in GA4 or Vercel Analytics (zero-cost, currently entirely absent).
- [ ] Add Sentry (free tier) for error tracking and UptimeRobot (free tier) for uptime monitoring
      on the homepage and both webhook endpoints.
- [ ] Resolve the current uncommitted working-directory state (`WEBSITE_COMPLETION_AUDIT.md` §0)
      — commit, stash, or deliberately discard, so nothing is silently lost and nothing
      half-finished ships by accident on the next deploy.

## Step 3 — The one step that cannot be skipped or substituted

- [ ] **A real person, on a real phone and a real desktop browser**, walks the complete customer
      journey end to end: browse → search/filter → add to cart → full checkout (Standard **and**
      Express delivery) → COD order placement → (once Step 1's Razorpay keys are live) one real
      small online payment, refunded immediately → order tracking → a return/replacement request
      with real photo evidence upload → account address management → a product review submission.
      Test at real device widths, not just in a resized desktop browser window.
      (`LAUNCH_BLOCKER_REPORT.md` #3, `MOBILE_UX_REPORT.md` §1)
- [ ] While doing the above, specifically re-check the WCAG contrast question flagged in
      `MOBILE_UX_REPORT.md` §3 (secondary text opacity) against the current, evolved design system.
- [ ] Run one restore drill against a scratch database at the Neon host level — confirm the app
      can actually read from a restored copy. (`LAUNCH_BLOCKER_REPORT.md` #9)

## Step 4 — Founder decisions that don't block Steps 1–3 but shouldn't be left open

- [ ] Founder OS: activate (`ENTERPRISE_FOUNDER_OS_ENABLED`) and consolidate the two conflicting
      `getFounderDashboard()` implementations, or explicitly leave disabled for now.
      (`WEBSITE_COMPLETION_AUDIT.md`, Founder OS row)
- [ ] Decide whether a dedicated `/search` page is wanted for launch, or whether the existing
      embedded Shop/Collections filtering is sufficient. (`CONTENT_COMPLETION_REPORT.md` §4)
- [ ] Decide the intended scope of "Notifications" — internal delivery log only (already
      Completed) vs. a real in-app customer notification inbox (not yet built).
- [ ] Prioritize the CMS blog admin UI build (`app/admin/cms/blog/` is currently empty) relative
      to other post-launch engineering work — not launch-blocking for the storefront itself.

## Step 5 — Go-live mechanics (already fully documented, re-run once Steps 1–4 close)

`LAUNCH_CHECKLIST.md` and `DEPLOYMENT_READINESS.md` already contain a complete, valid,
step-by-step sequence for webhook registration, final environment-variable confirmation, and
post-deploy verification (order-confirmation email arrives, a webhook actually reaches the
deployed endpoint, `/sitemap.xml`/`/robots.txt` reference the real domain, 6 failed logins trigger
the rate limiter). Re-run that checklist's Step 8 (Verification) in full once Steps 1–4 above are
closed — do not treat this plan as a replacement for it, only as the missing context for *why*
each item on it matters right now.

## What this plan deliberately does not include

- Any new feature, redesign, or architectural change — none of the seven companion reports found
  a defect that requires one.
- Any change to the MUV AI subsystem — Founder-frozen, correctly out of scope for this launch.
- A firm time estimate in days/weeks — Step 1's items depend on external account access this audit
  has no visibility into (Razorpay dashboard turnaround, Google Console access, DNS propagation
  time); Step 3 depends on scheduling a real person's time, not engineering throughput. What can
  be said with confidence: Steps 2 and the code portions of Step 3's prep are each hours, not
  days, of engineering work — the actual gating factor for a real launch date is Step 1's external
  dependencies and Step 3's human QA pass, not remaining code.

---

**Recommended execution order, restated simply:** Steps 1 and 2 in parallel, starting immediately.
Step 3 (the real device QA pass) as soon as Step 1's Razorpay keys land, so the online-payment
path can be tested for real during the same pass rather than twice. Step 4 whenever the Founder
has time — none of it blocks the others. Step 5 last, as the final go/no-go gate.
