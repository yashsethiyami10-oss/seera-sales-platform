# MUV Digital Flagship™ — Mobile UX Report

Companion to `WEBSITE_COMPLETION_AUDIT.md`. Covers Mobile UX, Desktop UX, and Accessibility
together, since the same underlying evidence and the same central caveat apply to all three.
Grounded in a direct, independent code-reading pass plus this repository's own dated mobile/
accessibility QA passes — not assumed from any single document.

---

## 1. The one finding that reframes everything else in this report

**Every mobile, touch, and accessibility claim in this codebase's history — across every dated
sprint report reviewed for this audit — was verified at the code level only.** The exact same
sentence appears, independently, in `PHASE_1D_RELEASE_READINESS.md`, `PHASE_1_KNOWN_ISSUES.md`,
`FOUNDER_FREEZE_SPRINT_2_REPORT.md`, and `FOUNDER_FINAL_POLISH_REPORT.md`: *no browser automation
and no physical device was available in the environment that did this work.* This is not a gap in
this audit — it is a real, repeated, disclosed limitation of every engineering pass that has ever
touched this codebase.

This matters because the one time a real Founder click-through pass *did* happen (Phase 1D), it
found genuine defects that no code review had caught: unreliable cart quantity controls, a mobile
overlap bug that was silently swallowing taps on Cart and Checkout, and a coupon that vanished
between pages. All three were fixed — but their discovery method (a real person, a real phone)
has not been repeated since. Treat every "Completed" verdict below as **"correct by code
inspection,"** not as "confirmed on a real device."

## 2. Mobile UX / Desktop UX — Partially Complete

- Responsive Tailwind breakpoint prefixes (`sm:`/`md:`/`lg:`/`xl:`) are used pervasively — 180+
  occurrences across `app/` and `components/`, present consistently in every sampled storefront
  surface (homepage, shop, PDP, nav, footer, checkout, cart) and in the internal admin/Sales OS
  surfaces as well.
- A skip-to-content link exists (`app/(storefront)/layout.tsx`, `.muv-skip-link`).
- Viewport meta is correctly present via Next.js 15's default auto-injection (`width=device-width`
  etc.) — confirmed directly against the framework's own default-metadata source, not assumed.
- Mobile-first was specifically verified as actually followed in the original build (390px
  viewport tested before desktop, 44–48px touch targets, sticky bottom action bars) per `AUDIT.md`'s
  own UX section, and cart/checkout mobile-specific bugs (sticky-card touch interception, cart
  quantity floor guard) were found and fixed in the one real Founder-driven pass.
- **One concrete touch-target gap found this pass**: an inline "remove evidence" icon button in
  `components/account/return-request-client.tsx` is hard-coded to 20×20px, below the WCAG 24×24px
  minimum. The shared `.muv-icon-circle` base class used elsewhere is 36×36px (acceptable, though
  below the 44/48px ideal) — this one instance doesn't use it. Spot-check finding, not an
  exhaustive sweep of all 161 route segments.
- Checkout was recently reduced from 5 steps to 4 (`MUV_FINAL_CUSTOMER_EXPERIENCE_REPORT.md` Phase
  7) with scroll-to-top on every step transition and a three-tier progress indicator — both
  code-verified, neither device-verified.

## 3. Accessibility — Partially Complete

Strong signal from a direct source-wide count: 173 `aria-label`, 104 `aria-hidden`, 22
`aria-pressed`, 14 `aria-invalid`, 8 `aria-modal`/`aria-expanded` occurrences, plus `aria-current`/
`aria-live`/`aria-describedby` in active use. 231 `<label>` elements with 71 explicit `htmlFor`
associations. A global `:focus-visible` outline rule applies broadly across interactive elements,
with additional component-specific overrides. Semantic landmarks (`<header>`, `<nav aria-label="Primary">`,
`<main id="main-content">`, `<Footer>`) are present in the storefront layout. `next/image`'s `alt`
prop is a required TypeScript prop, giving build-level enforcement that product imagery always
has *some* alt text.

An earlier, dedicated accessibility pass (`AUDIT.md`) found and fixed three specific icon-button
labeling gaps (product-detail share buttons, the CMS rich-text toolbar, admin stock +/− buttons)
via a **complete pass over all files at the time**, not a sample — no other mismatch was found
then, and none was found in this pass's spot-checks either.

**Not fully verified by this or any prior pass:**
- Alt-text *quality* (does the text meaningfully describe the image) versus mere *presence* —
  presence is enforced, quality was not exhaustively audited.
- Real screen-reader behavior (VoiceOver/TalkBack/NVDA) — no such tool was available in any
  environment that has worked on this codebase to date.
- The specific WCAG AA text-contrast finding from `AUDIT.md` (secondary text at 0.4 opacity on the
  ink background measured at 3.78:1, failing the 4.5:1 normal-text threshold) was **identified and
  explicitly not applied** as a fix at the time, flagged as a deliberate design decision (visual
  weight vs. compliance) requiring Founder input rather than a silent edit. This audit did not
  re-measure current contrast values against the current design system to confirm whether that
  finding still applies unchanged — recommend a fresh contrast check as part of the real-device QA
  pass in item 1 above, since the design system has evolved since that finding was recorded.

## 4. Loading & Error States (mobile-adjacent, included here for completeness)

- 11 `loading.tsx` files cover the customer-facing storefront comprehensively (homepage, shop,
  collections, PDP, checkout + success, cart, journal + detail) plus account and admin root
  segments (which cascade to their nested routes).
- Root, account, and admin error boundaries exist with branded, on-message fallback UI (not a raw
  stack trace or generic Next.js error page), plus branded 404 pages for both the storefront and
  the site root.
- **Gap, internal-tool-only**: the ~125 route segments under `app/os`, `app/sales`, `app/dashboard`,
  `app/enterprise`, `app/finance`, `app/network` (Sales OS / Founder OS / Institutional) have no
  per-segment `loading.tsx` or `error.tsx` of their own — they function correctly but fall back to
  the generic root boundary rather than a contextual one. Zero customer-facing impact; a real but
  low-priority polish item for the internal ops tool.

## 5. Recommendation

The single highest-leverage action for this entire report is not a code change: it is the real
device/browser QA pass described in `LAUNCH_BLOCKER_REPORT.md` #3. Every other finding here is
either already fixed, a small concrete fix (the one 20×20px touch target), or a Founder decision
(the deferred contrast question) — none require new architecture or redesign.
