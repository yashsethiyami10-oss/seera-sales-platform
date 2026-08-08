# Phase 1 — Release Notes

### Website Stabilization (Phases 1A–1D) · 2026-07-26

Plain-language summary of what changed in Phase 1, for anyone who wasn't following the individual
phase reports.

---

## What This Release Is

A stabilization pass over the existing Muv website — no redesign, no new pages, no new business
lines. The goal was to find and fix real, concrete gaps between the live site and the approved MUV
Knowledge Book, verify everything still works, and prepare the ground (not yet build) for
Institutional Sales and MUV AI work later.

## What Changed

- **Pricing is now trustworthy.** Checkout's shipping fee, free-shipping threshold, and
  Cash-on-Delivery availability now genuinely come from what's configured in `/admin/settings` —
  previously, changing those settings had no real effect on what a customer was charged.
- **Institutional/bulk inquiries are now visible to staff.** A new `/admin/inquiries` page lets staff
  see, filter, and update the status of every business enquiry submitted through the Contact page —
  previously these only triggered a one-time email with no lasting record.
- **The brand name reads correctly almost everywhere.** "Muv" now appears correctly across ~34 files
  of page copy, emails, SMS messages, and the checkout payment screen — previously it inconsistently
  showed as all-caps "MUV" in most customer-facing text.
- **The Skin Care page is now consistent.** It correctly says "Muving Soon™" everywhere, matching the
  homepage — previously the category's own page said plain "Coming Soon."
- **A few smaller correctness fixes:** footer social media icons now link to real Muv profiles (or
  don't show at all) instead of generic platform homepages; a few stale code comments were corrected;
  an admin status badge now matches customer-facing wording; the database seed script now refuses to
  run against anything that doesn't look like a local development database.

## What Did Not Change

- No page was redesigned.
- No new feature, product line, or business capability was added.
- No product name, brand label, or packaging was altered.
- No database schema changed.
- No secret or credential was touched.

## What Was Verified, Not Just Claimed

Every change above was checked against a clean production build, a clean type-check, and a full
43-route live sweep against a real running instance of the app connected to a real database — not
assumed correct because it compiled. Full evidence is in `PHASE_1D_FINAL_TEST_REPORT.md`.

## What Still Needs a Human

This phase's testing was thorough at the code, build, database, and HTTP level, but this environment
has no browser automation — so real click-through testing (adding to cart, completing a test
checkout, using the site on an actual phone, keyboard-only navigation) still needs a person in a real
browser. See `PHASE_1D_FOUNDER_ACCEPTANCE_CHECKLIST.md` for a short, guided way to do exactly that.

## One Thing Worth Knowing Before Phase 2

While fixing checkout pricing, a **pre-existing** issue was found (not caused by this phase): selecting
"Express Delivery" at checkout shows an extra ₹99 on screen, but that choice was never actually sent
to or charged by the server — the server always charges the Standard Delivery rate regardless of which
option is picked. This has been true since checkout was first built; Phase 1 fixed Standard Delivery's
pricing to be real, but did not build the missing wiring for Express (that's new work, not a
correction). Full detail in `PHASE_1_KNOWN_ISSUES.md`.
