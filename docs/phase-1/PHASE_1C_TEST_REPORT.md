# Phase 1C — Test Report

All checks below were actually run against the live codebase this phase, not assumed. Two dev-server
restarts happened mid-phase — both are reported honestly, including the one real anomaly encountered
and its resolution.

---

## 1. Type-check (`npx tsc --noEmit`)

Run twice: once immediately after the initial batch of edits (Stage 0–GAP-006 fixes), once again
after the extended brand-casing sweep (34 files). **Both runs: clean, zero errors.**

One real issue found and fixed along the way: the first run failed with 3 errors, all inside
`docs/phase-1/PHASE_1C_BACKUPS/**` — the pre-edit backup copies (kept for manual rollback, see
`PHASE_1C_DECISION_LOG.md`) were being picked up by TypeScript as live source files because they
still had `.ts`/`.tsx` extensions, and naturally failed to type-check against the new component
prop shapes. Fixed by renaming every file in that folder to `.bak`, which removed them from
TypeScript's default include glob. Re-ran clean afterward. This was a backup-mechanism bug, not a
source-code bug.

## 2. Production build (`npm run build`)

Run twice, same two checkpoints as the type-check. **Both runs: clean.** 42 routes generated both
times (41 pre-Phase-1C + 1 new: `/admin/inquiries`). No route changed its static (`○`) vs. dynamic
(`ƒ`) classification between the two runs or relative to the pre-Phase-1C baseline — confirms no
accidental new `auth()`/dynamic-data call leaked into a previously-static page (the exact regression
class Phase 14A's own report warned about and had to catch by hand).

## 3. Lint (`npm run lint`)

**Not runnable** — same finding as Phase 0: no ESLint configuration exists in this project
(`next lint` attempts an interactive setup wizard this environment can't drive). Unchanged from
before this phase; tracked as GAP-011, explicitly out of Phase 1C's approved scope (a
new-devDependency decision left to the Founder). Not a regression.

## 4. Live route/response verification (dev server)

Two full passes with a real `next dev` server, `Invoke-WebRequest` against `localhost:3000`:

**First pass** (immediately after the code changes, before the extended brand sweep): all core
routes 200/307 as expected — `/`, `/shop`, `/cart`, `/checkout`, `/collections/skin-care`,
`/collections/home-care`, `/contact` → 200; `/admin`, `/admin/inquiries`, `/account` → 307
(unauthenticated, correctly gated — confirms the brand-new `/admin/inquiries` route inherited RBAC
protection from `app/admin/layout.tsx` exactly like every existing admin page).

**Anomaly encountered and resolved:** after the extended brand-text sweep (dozens of rapid
successive edits triggering many HMR recompiles), a single request to `/` returned a **500**. Dev
server log showed `Error: Could not find the module "...segment-explorer-node.js#SegmentViewNode" in
the React Client Manifest. This is probably a bug in the React Server Components bundler` and a
`TypeError: Cannot read properties of undefined (reading 'call')` — this is the same class of
Windows dev-mode webpack/HMR-cache corruption already documented as a known, self-resolving issue in
the Phase 0 platform audit (`MUV_PHASE0_PLATFORM_AUDIT.md` §12/§14, item 4), not a defect in the
code. Confirmed by: (a) `npm run build` had already succeeded cleanly moments before this occurred,
and succeeded cleanly again immediately after, and (b) stopping and cleanly restarting `npm run dev`
(zero code changes) resolved it — the homepage returned **200** on every subsequent request,
confirmed twice deliberately, then across a full 23-route sweep with zero further errors.

**Second, final pass** (clean dev-server restart, after the full extended sweep) — every route
checked, one request each:

| Route | Result |
|---|---|
| `/`, `/shop`, `/cart`, `/checkout` | 200 |
| `/collections/skin-care`, `/collections/home-care` | 200 |
| `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/shipping`, `/returns` | 200 |
| `/login`, `/signup`, `/journal` | 200 |
| `/admin`, `/admin/inquiries`, `/admin/settings`, `/admin/customers`, `/admin/products`, `/admin/orders` | 307 (unauthenticated, correctly gated) |
| `/account` | 307 (unauthenticated, correctly gated) |

Dev server log for this final pass: **zero errors, zero warnings beyond routine compile messages.**

## 5. Content verification (not just status codes)

- `/collections/skin-care`'s rendered HTML confirmed to contain "Muving Soon" (GAP-005 fix live, not
  just present in source).
- Homepage's `<title>` confirmed to start with `Muv` (not `MUV`) in rendered HTML.
- A full-text scan of the rendered homepage HTML for standalone `MUV` tokens found the remaining
  instances to be exactly the categories deliberately left unchanged (logo `alt` text, `Product.name`/
  `Product.brand`/SKU catalog data, JSON-LD `brand` field) — no leftover customer-facing prose
  instance found on the homepage specifically. The broader source-file sweep (§6 below) is the
  authoritative check for the rest of the site.

## 6. Source-level brand-text sweep verification

After every edit batch, `Grep` was re-run across `app/`, `components/`, and `lib/` for the literal
string `MUV`. The final state (documented in full in `PHASE_1C_FILES_CHANGED.md` and
`PHASE_1C_DECISION_LOG.md`) contains only the deliberately-excluded categories: image `alt` text for
the logo (4 instances), JSX/code comments (non-customer-facing), the coupon-code example placeholder
(`"MUV10"`, matching the convention that coupon codes are uppercase), `Product.brand`/`z.default`
values matching the Prisma schema's own default, the Delhivery courier API's warehouse name (not
customer-facing), the `MUV_GSTIN` environment variable's *name* (not its value or any display text),
and `actions/orders.ts`'s order-number generator prefix (treated as a business identifier, not prose
— see `PHASE_1C_DECISION_LOG.md`).

## 7. RBAC / permission verification

- **New `updateInquiryStatus` action:** confirmed to call `requireStaff()` as its first statement,
  before parsing input or touching the database — matches the codebase's own established pattern
  (verified by direct code read, not just route-level testing, since a Server Action is independently
  callable regardless of which page calls it — the exact rule `SECURITY.md` documents).
- **`/admin/inquiries` route-level gate:** confirmed live — 307 redirect when unauthenticated,
  inherited automatically from `app/admin/layout.tsx`'s existing session/role check (no new
  middleware or layout logic was needed or added).
- **`createOrder`'s new COD enforcement:** confirmed by code read — `codEnabled === false` throws an
  `AppError` before any order row is created, not merely hidden in the UI. Not independently
  click-tested against a real Razorpay/COD flow end-to-end in this pass (see Known Limitations in
  `PHASE_1C_IMPLEMENTATION_REPORT.md` — no payment-gateway sandbox available in this environment,
  same limitation every prior phase touching payments has honestly disclosed).

## 8. Regression checks

- Cart, checkout, product, category, account, and every admin list page rendered with 200/307 as
  expected in the final route sweep — no page that worked before this phase now fails to load.
- `ALLOWED_TRANSITIONS` order-status logic, coupon-discount computation, and GST calculation in
  `actions/orders.ts` were read in full before and after the edit to confirm the shipping-fee change
  was inserted without altering any of that surrounding logic (verified by diff-equivalent re-read,
  not just "it compiled").

## 9. What was NOT tested (honest limitations)

- **No real payment gateway transaction** was run (Razorpay test-mode checkout, a real COD order
  through to fulfillment) — this environment has no browser automation or payment sandbox access,
  the same limitation Phase 18's own report disclosed for guest checkout.
- **No real device/browser testing for mobile or accessibility** — verified only via consistent
  Tailwind responsive class usage (code-level) and the existing aria-label/aria-pressed patterns
  already present in every file touched; no click-through on an actual phone or with a screen reader.
- **No test suite exists to run** (GAP-010, out of scope) — all verification above is manual/tooling-
  based, not automated regression coverage.
