# Phase 1C — Decision Log

Every judgment call made during implementation that wasn't a mechanical application of the Phase 1B
blueprint, with the reasoning, so it can be revisited rather than silently assumed correct.

---

## D1 — GAP-002's real scope was ~5x larger than Phase 1A/1B estimated

**Decision:** Complete the full sweep (34 files) rather than stopping at the 7 files named in the
original backlog.

**Why:** Phase 1A's spot-check found representative instances but wasn't exhaustive. Once live
verification (checking rendered homepage HTML, then a systematic `Grep` across `app/`/`components/`/
`lib/`) surfaced the true scope, stopping partway would have left the task's own explicit Brand
Requirement ("Brand name: Muv") visibly, inconsistently unmet across most of the site — arguably
worse than not starting, since a half-fixed brand rule reads as inattention rather than a boundary.
Every instance fixed is the same trivial, independently-verified, zero-logic-risk text substitution
as the originally-scoped ones — the risk profile didn't change, only the count.

## D2 — What counts as "customer-facing text" vs. what doesn't

**Decision:** Fixed: page copy, meta descriptions, email/SMS subject lines and body text, the
Razorpay checkout modal's merchant name, share-to-social text, invoice seller name, form labels/
headings a customer sees. **Left alone:** `Product.name`/`Product.brand` database values and their
code-level defaults, SKU strings, the coupon-code example placeholder, the logo image's `alt` text,
code comments, the Delhivery courier API's warehouse-name parameter, and the `MUV_GSTIN` environment
variable's name.

**Why:** The task's own core rules say "Do not alter approved product labels or packaging artwork"
and "Preserve current product, customer, order, and admin data." Product names/brand/SKU are exactly
that — catalog data, not website prose, and almost certainly correspond to real physical packaging.
The logo's `alt` text mirrors an actual visual wordmark asset (a Chapter 12 "Logo & Mark System"
question per the Knowledge Book, not Chapter 13's "Written Identity" prose rule). Courier-facing data
and env var names are never seen by a customer at all. The coupon-code placeholder represents an
uppercase-by-convention code format, unrelated to brand-name casing.

## D3 — `actions/orders.ts`'s order-number prefix (`MUV123456`) was left unchanged

**Decision:** Did not change the `generateOrderNumber()` prefix, even though order numbers are
genuinely customer-facing (emails, SMS, invoices, account pages).

**Why:** Treated as a business identifier/ID format, not prose — the same category as a SKU or
coupon code, both already excluded (D2). Changing an ID-generation format is a more consequential,
harder-to-cleanly-scope decision than a text substitution (though it wouldn't affect existing order
numbers, which are already-generated strings, not a pattern re-applied retroactively) — flagged here
rather than silently decided either way. If the Founder wants this changed, it's a one-line fix in
`actions/orders.ts:23`.

## D4 — `StoreSettings.businessName`'s actual database value was not updated

**Decision:** Fixed the JS fallback default (`?? "MUV"` → `?? "Muv"`) in `app/admin/settings/page.tsx`,
but did not run a data update against the live `StoreSettings` row, whose `businessName` column may
still literally contain `"MUV"` (the Prisma schema's own `@default("MUV")`, applied when the
singleton row was first created).

**Why:** This is stored admin-editable data, not static UI text — updating it crosses from a code fix
into a data mutation, which this phase's rules treat with more caution ("preserve current... admin
data"). Confirmed via `Grep` that `businessName` has no other downstream consumer today (only the
admin settings form itself reads it) — so nothing customer-facing is currently affected either way.
The Founder can correct it in one click via the very form this field powers (`/admin/settings`),
which is exactly the self-service mechanism it exists for.

## D5 — Footer's fourth social icon (YouTube) was removed rather than left hardcoded or newly wired

**Decision:** `StoreSettings` has `instagramUrl`/`facebookUrl`/`twitterUrl`/`whatsappNumber` — no
YouTube field. Instagram/Facebook/X now read real settings and hide if unconfigured (GAP-009's core
fix). YouTube, which has no corresponding settings field, is removed from the footer entirely rather
than left pointing at `youtube.com`'s generic homepage.

**Why:** GAP-009's own definition was "hide an icon whose URL isn't configured rather than link to a
generic homepage" — YouTube is permanently "unconfigured" since no field backs it, so permanently
hidden is the correct application of the same rule, not a new decision. Adding a *new* `youtubeUrl`
schema field was considered and rejected — that would be a schema change to solve a problem the
approved backlog never asked to solve (Phase 1A never flagged "add YouTube support," only "fix the
wrong/hardcoded links").

## D6 — `StoreSettings.whatsappNumber` was not turned into a new fifth footer icon

**Decision:** Considered adding a WhatsApp icon/link to the footer, since `whatsappNumber` exists,
is admin-editable, and currently has zero footer presence. Decided against it.

**Why:** Not named in GAP-009's original scope (which covered the four *existing* icons only — adding
a fifth is a UI-composition change, not a fix to something broken). Recorded here as a legitimate,
low-effort future enhancement rather than silently added or silently forgotten.

## D7 — Checkout's Express Delivery price remains display-only (a pre-existing bug, not fixed)

**Decision:** `createOrder`'s schema (`createOrderSchema`) has no field for which delivery-speed tier
was selected at checkout — Express Delivery's ₹99 has never been sent to or charged by the server,
even before this phase (confirmed by reading the pre-Phase-1C `checkout-client.tsx`). Standard
Delivery's price is now correctly wired to the real `StoreSettings` values the server actually
charges (this phase's core GAP-004 fix); Express's flat ₹99 remains exactly as functionally
disconnected as it was before.

**Why:** Fixing this properly would require adding a new field to `createOrderSchema`, threading a
delivery-tier choice through `createOrder`, and deciding new business logic (is Express a flat
surcharge? per-order or per-item?) — a genuinely new capability, not "wire an existing hardcoded
value to an existing settings field" the way the rest of GAP-004 was. Documented in
`PHASE_1C_REMAINING_ISSUES.md` as a newly-discovered, pre-existing gap rather than silently left
unmentioned or silently expanded into new scope.

## D8 — Backup files renamed to `.bak` mid-implementation

**Decision:** After discovering `tsc --noEmit` was failing against the pre-edit backup copies (still
`.ts`/`.tsx` files sitting under `docs/phase-1/PHASE_1C_BACKUPS/`), renamed every backup file to
append `.bak`, removing them from TypeScript's default compilation scope.

**Why:** The alternative (editing `tsconfig.json` to add an `exclude` entry) would have touched a
shared project configuration file for a problem entirely of my own backup mechanism's making — renaming
files inside a directory I created myself is fully self-contained and has zero effect on the actual
project. See `PHASE_1C_TEST_REPORT.md` §1 for the concrete errors this fixed.

## D9 — GAP-001 (`AUTH_SECRET` rotation) and the live-value half of GAP-020 (Cloudinary credential
rotation) were not performed

**Decision:** Both left exactly as found.

**Why:** This phase's core rules explicitly state "Do not change secrets or production credentials."
`AUTH_SECRET` and Cloudinary's API key/secret are unambiguously credentials. Flagged in
`PHASE_1C_REMAINING_ISSUES.md` as pre-flight items requiring the Founder's direct action, consistent
with how Phase 0 and Phase 1B already treated them.

## D10 — GAP-007 (shipping webhook signature) was not resolved

**Decision:** Left the existing generic HMAC-SHA256 verification unchanged.

**Why:** Confirming or correcting the real signature scheme requires live courier account
documentation access this environment doesn't have — exactly the dependency Phase 1B's own
Dependency Graph already named for this item. Not attempted, not guessed at.
