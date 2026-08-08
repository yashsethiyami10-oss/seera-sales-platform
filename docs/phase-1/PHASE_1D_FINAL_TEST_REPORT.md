# Phase 1D — Final Test Report

### Verification of Phase 1C, using only checks actually run against the live codebase, live database, and a locally-served instance of the app (both `next dev` and `next start`). Every result below is marked **Passed**, **Failed**, **Partially Verified**, or **Not Testable in Current Environment** — nothing is claimed without the evidence shown.

---

## Pre-Flight

| Item | Finding |
|---|---|
| Current branch | N/A — no git in this checkout (confirmed again this phase: `git` command not found, no `.git` directory) |
| Git status / uncommitted files | N/A — no git available |
| Local environment | Node v24.18.0, npm 11.16.0, Windows |
| Database availability | **Reachable** — confirmed via `npx prisma validate` (schema valid) and `npx prisma migrate status` (connects to `postgresql://localhost:5432/muv` successfully; reports "not managed by Prisma Migrate," which is expected — this project uses `db push`, not `migrate`, per `CLAUDE.md`) |
| Required env vars | `DATABASE_URL` present, `AUTH_SECRET` present but still the literal placeholder (known, previously flagged — GAP-001, still deferred, unchanged) |
| Local server command | `npm run dev` (dev mode) and `npm run build && npm run start` (production mode) — both used this phase, see §"Dev-Mode Anomaly" below for why both were needed |
| Known Phase 1C deferred items | GAP-001, GAP-007, GAP-010, GAP-011, GAP-012, GAP-013, GAP-014, GAP-015, GAP-016, GAP-017, GAP-018, GAP-020 (partial) — all carried forward unchanged, see `PHASE_1_KNOWN_ISSUES.md` |
| Blockers to full testing | No browser automation tool is available in this environment — every "visual"/"interactive"/"device" test in the requested scope is marked **Not Testable in Current Environment** below, not silently skipped or assumed |

---

## A. Brand & Content

| Check | Result | Evidence |
|---|---|---|
| Customer-facing brand name is "Muv" | **Passed** | Live homepage `<title>` = `Muv — Keep Muving \| Muv`; meta description starts "Muv is a premium..."; re-verified against the stable production server (`next start`), not just source code |
| "Keep Muving™" used correctly | **Passed** | Confirmed present and correctly cased on the live homepage; unchanged since Phase 1C (not touched this phase, no regression found) |
| "Muving Soon™" replaces "Coming Soon" | **Passed** | Live `/collections/skin-care` on the production server contains "Muving Soon" and does **not** contain "Coming Soon" — confirmed by direct string match against rendered HTML |
| "MAGIC IN MUV" not introduced | **Passed** | Zero matches in rendered homepage or About page HTML; zero matches anywhere in `app/`/`components/`/`lib/` source (re-confirmed via `Grep`, unchanged from Phase 0/1A/1C findings) |
| Muv not positioned as detergent-only | **Passed** | Homepage/About copy explicitly frames Muv across Home/Fabric/Body/Personal/Car categories (unchanged, Phase 1A's original finding); no new content introduced this phase that would contradict it |
| Approved categories present | **Passed** | Live, direct read-only database query (`prisma.category.findMany`) returned exactly: Home Care, Fabric Care, Body Care, Personal Care, Car Care (all `comingSoon: false`), Skin Care (`comingSoon: true`) — matches the approved list exactly, including which one is flagged |
| Dummy/placeholder/contradictory content | **Passed** (none found) | `Grep` for "Lorem ipsum" across the live homepage and a live product page: clean. Full-source sweep in Phase 1A/1C already found zero TODO/FIXME/dead code; not re-touched this phase |
| Product labels/packaging assets unaltered | **Passed** | Re-confirmed via live products API (`/api/products`) — 12 real products returned, names unchanged (e.g., "MUV Shield," "MUV Silk Hair Wash" — deliberately left in their original all-caps catalog form per Phase 1C's own documented decision, not a new finding) |

## B. Customer Website

All pages tested via live HTTP request against both `next dev` and the stable `next start` server.

| Page | Result | Evidence |
|---|---|---|
| Homepage, Header, Navigation, Footer | **Passed** | 200 on every request against the production server; brand/content checks above confirm rendered text is correct |
| Shop | **Passed** | 200, live product data via `/api/products` cross-check |
| Category pages (all 6) | **Passed** | 200 on all 6 (`home-care`, `fabric-care`, `body-care`, `personal-care`, `car-care`, `skin-care`) on the stable production server — see "Dev-Mode Anomaly" for a dev-mode-only caveat on this specific route |
| Product detail pages | **Passed** | 200 on a real product slug (`muv-shield`), `Product` JSON-LD confirmed present |
| Search | **Partially Verified** | `getPopularSearches`/product data confirmed reachable via API; the interactive fuzzy-search UI itself requires client-side JS execution — not independently click-tested (see Not Testable, below) |
| Wishlist, Cart, Checkout | **Partially Verified** | Pages load (200) and contain expected structure/real data; the interactive add/remove/quantity/coupon/payment flows require client-side JS and a real browser — not independently click-tested this phase (same limitation every prior phase touching checkout has disclosed) |
| Customer login, account, order history | **Partially Verified** | Routes correctly gated (307 unauthenticated, confirmed live); could not test the authenticated experience without a real login session and browser session-cookie handling |
| Reviews | **Not re-tested this phase** | Unchanged by Phase 1C; Phase 0/16 code-level review already found this correct; not independently re-verified live this pass |
| Contact/support flow | **Passed** (page + submission path) | `/contact` returns 200; `submitBusinessInquiry` and its validation were verified at the code level in Phase 1C (unchanged since) |
| Loading/empty/error/success states | **Partially Verified** | `error.tsx`/`not-found.tsx`/`loading.tsx` files confirmed present and correctly wired (code-level, Phase 0/16 finding, unchanged); the actual unmatched-URL 404 was live-confirmed this phase (`/this-page-does-not-exist-xyz` → 404 on both dev and production servers) |

## C. Commerce Flow

| Step | Result | Evidence |
|---|---|---|
| 1–2. Homepage → category | **Passed** | Live 200s, confirmed above |
| 3. Open product | **Passed** | Live 200, JSON-LD confirmed |
| 4–7. Select variant, add to cart, update quantity, coupon | **Not Testable in Current Environment** | These require client-side React state (`lib/cart-context.tsx`, localStorage) and real browser interaction — no browser automation available. Underlying logic was read and verified at the code level in Phase 1C |
| 8. Proceed to checkout | **Passed** (page loads) | `/checkout` returns 200 |
| 9. Shipping/pricing calculation | **Partially Verified** | Verified at the **code level**: `actions/orders.ts` correctly reads `StoreSettings.shippingFee`/`freeShippingThreshold` (re-read this phase, unchanged since Phase 1C, confirmed still correct). **Not** verified by an actual live order — see below |
| 10. COD availability/disabling | **Partially Verified** | Code-level: `createOrder` throws `AppError("COD_DISABLED")` when `StoreSettings.codEnabled` is false, confirmed by direct re-read this phase. Not exercised via a live request (would require either a real checkout submission or a raw, protocol-level Server Action call — the latter was deliberately not attempted; see Defect Log reasoning) |
| 11. Online payment integration state | **Passed** (configuration state only) | `.env`'s Razorpay keys are blank (unchanged since Phase 0) — confirmed the app fails gracefully rather than crashing when payment is unconfigured, consistent with `lib/env.ts`'s documented graceful-degradation design; no live Razorpay transaction attempted (correctly, per this phase's "do not create real paid transactions" rule) |
| 12–16. Test order submission, confirmation, history, admin visibility | **Not Testable in Current Environment** | Creating even a COD test order requires driving the real client-side checkout form (React state, address form, terms checkbox) through a browser — no such tooling is available. **Deliberately not simulated via a raw protocol-level request against the Server Action**, since that would not represent genuine user testing and risks malformed data. See `PHASE_1D_DEFECT_LOG.md` reasoning |

## D. Admin & CMS

| Check | Result | Evidence |
|---|---|---|
| Admin authentication / role protection | **Passed** | Every admin route (`/admin`, `/admin/products`, `/admin/orders`, `/admin/customers`, `/admin/inventory`, `/admin/marketing`, `/admin/media`, `/admin/cms/categories`, `/admin/cms/homepage`, `/admin/settings`, `/admin/analytics`, `/admin/inquiries`) returned **307** unauthenticated, live, on both dev and production servers — 12/12 |
| Dashboard, Product/Category/Inventory/Order/Customer/Coupon/Media CRUD, Homepage CMS, Settings, Analytics | **Partially Verified** | Route-level access control confirmed live (above); the actual CRUD *interactions* (forms, modals, save/delete) require a browser and an authenticated session — not click-tested. Code-level logic for every one of these was reviewed in Phase 0/16 (found correct, no gaps) and, for the newly-added `/admin/inquiries`, in Phase 1C (RBAC pattern confirmed by direct code read) |
| Notifications | **Not re-tested this phase** | Unchanged by Phase 1C; code-level correctness already established in Phase 0/18 |
| Validation | **Passed** (code level) | Every Server Action still parses `input: unknown` through a Zod schema before touching Prisma — spot-checked `actions/orders.ts` and `actions/inquiries.ts` (the two Phase 1C touched) this phase; unchanged elsewhere |
| Loading/error/empty states in admin | **Partially Verified** | `app/admin/error.tsx`/`loading.tsx` confirmed present (code-level, unchanged); new `/admin/inquiries` page's empty state (`"No business inquiries found."`) confirmed present by code read, not click-tested live |

## E. Authentication & Permissions

| Check | Result | Evidence |
|---|---|---|
| Guest access boundaries | **Passed** | `/checkout` reachable unauthenticated (200, guest checkout by design); `/account`, `/admin` correctly blocked (307) |
| Customer access boundaries | **Partially Verified** | Route-level gating confirmed live; couldn't test an authenticated customer session without browser-based login |
| Admin access boundaries | **Passed** | 12/12 admin routes correctly redirect unauthenticated, confirmed live this phase |
| Protected routes | **Passed** | Same as above |
| Server-side permission checks | **Passed** (code level) | `requireStaff()` confirmed as the first statement in the new `updateInquiryStatus` action (re-read this phase); this is the exact codebase-wide pattern already verified with no gaps in Phase 0/16 |
| Role inheritance | **Not independently re-tested** | Unchanged by Phase 1C; Phase 0's finding (no gaps) stands |
| Unauthenticated API access | **Passed** | The four read-only `/api/*` GET endpoints correctly return data without auth (by design — they're public reads); no mutating API route exists to test against |
| Unauthorized actions | **Partially Verified** | Verified at the code level that every mutating action requires the correct role; not exercised with a live forged/unauthorized request this phase |
| Session expiry handling | **Not Testable in Current Environment** | Requires a real, time-lapsed browser session |

## F. Mobile & Desktop

| Check | Result |
|---|---|
| Desktop/tablet/mobile width rendering, touch targets, sticky controls, image scaling, text readability, horizontal overflow | **Not Testable in Current Environment** — no browser or device automation is available. **Not claimed as tested.** |
| Responsive class usage (code-level proxy, not a substitute for real testing) | **Passed** (code-level only) | Every file touched in Phase 1C continues to use the codebase's established Tailwind responsive breakpoints (`sm:`/`md:`/`lg:`); Phase 1C's edits were text/prop-only and did not touch any layout/responsive structure, so no regression risk was introduced — but this is an inference from code patterns, not a rendered-viewport observation |

## G. Accessibility

| Check | Result |
|---|---|
| Keyboard navigation, focus states, color contrast (visual) | **Not Testable in Current Environment** — requires a real browser/assistive-technology session |
| Labels, alt text, semantic headings, form errors, button/link clarity (code-level) | **Passed** (code-level only) | Spot-checked the new `/admin/inquiries` page and table: `aria-label` present on the status `<select>` and expand/collapse button, semantic `<table>`/`<th>`/`<td>` structure — matches the established pattern Phase 16 already found consistent elsewhere. Not a live AT (assistive technology) test |

## H. SEO

| Check | Result | Evidence |
|---|---|---|
| Page titles | **Passed** | Live-confirmed correct casing on homepage; `buildMetadata()`'s `SITE_NAME` fix (Phase 1C) confirmed live |
| Meta descriptions | **Passed** | Live-confirmed correct on homepage |
| Canonicals, Open Graph | **Not independently re-tested this phase** | `lib/seo.ts`'s `buildMetadata()` logic (canonical + OG tags) unchanged by Phase 1C except the `SITE_NAME`/`DEFAULT_DESCRIPTION` string values already confirmed above; Phase 16's original implementation found correct |
| Sitemap | **Passed** | Live `/sitemap.xml` on production server confirmed to include all 7 static pages (`/about`, `/contact`, `/faq`, `/shipping`, `/returns`, `/privacy`, `/terms`) |
| Robots | **Passed** | Live `/robots.txt` confirmed: allows `/`, disallows `/admin`, `/account`, `/api`, `/login`, `/signup`, `/reset-password` |
| Product/category metadata | **Passed** | `generateMetadata` in the category page confirmed live-correct (uses "Muv" casing, per Phase 1C fix) |
| Structured data | **Passed** | `Organization` JSON-LD confirmed present on homepage; `Product` JSON-LD confirmed present on a live product page |
| No obvious duplicate metadata | **Not independently re-tested** | Phase 16's original audit found and fixed this; not re-broken by Phase 1C's text-only changes |
| No placeholder SEO text | **Passed** | All meta descriptions checked this phase contain real, specific copy — no "Lorem ipsum" or generic placeholder found |

## I. Performance

| Check | Result | Evidence |
|---|---|---|
| Production build | **Passed** | Clean, 42/42 routes generated, re-run this phase |
| Bundle/route warnings | **Passed** (none found) | Build output contains no warnings; route sizes consistent with Phase 1C's own build output (no bloat introduced) |
| Image optimization, lazy loading | **Not independently re-tested** | Unchanged by Phase 1C; established pattern (`next/image`, `ProductImage` component) confirmed present in every file read this phase |
| Unnecessary Client Components | **Not independently re-tested** | Phase 16 already audited and fixed this; Phase 1C's new files (`inquiries-table-client.tsx`) is correctly `"use client"` only where interactivity is needed, matching the established pattern |
| Large dependencies | **Not independently re-tested** | No new dependency was added in Phase 1C (confirmed — `package.json` untouched) |
| Console warnings, network failures, hydration errors | **Partially Verified** | Dev and production server logs were checked for errors after every route sweep this phase — **zero** hydration errors or network failures found in either log. Actual browser DevTools console was not inspected (no browser available) |

## J. Security

| Check | Result | Evidence |
|---|---|---|
| No secrets exposed | **Passed** | `.env` re-confirmed unchanged and not read into any response; no credential appears in any page source or API response checked this phase |
| No hardcoded credentials | **Passed** | Re-confirmed — the only "credential-shaped" literal in code is the already-known, already-flagged seeded admin password documented in `CLAUDE.md`, unchanged |
| Protected admin mutations | **Passed** | `requireStaff()` confirmed on the new action (code read); route-level gating confirmed live |
| Input validation | **Passed** (code level) | Zod schemas confirmed present and used correctly for both Phase 1C-touched action files |
| Server-side authorization | **Passed** | Confirmed independent of UI/route gating, per the codebase's own documented rule, re-verified on the one new action this phase added |
| Safe error messages | **Passed** | `toErrorResponse()` pattern unchanged and still used by every action touched this phase; no raw stack trace or Prisma error observed in any live response checked |
| No destructive public endpoints | **Passed** | Only `submitBusinessInquiry` is public/unauthenticated among mutating actions, and it's rate-limited (unchanged, Phase 0 finding) |
| File upload restrictions | **Not independently re-tested** | Unchanged by Phase 1C; Phase 16's fix (server-side size limits) not touched |
| Payment/order trust boundaries | **Passed** (code level) | Re-confirmed this phase: `createOrder`'s COD-disabled check and the Razorpay webhook's signature-verification-before-trust pattern are both unchanged and correct by direct code read |

---

## Dev-Mode Anomaly — Investigated, Characterized, Not a Code Defect

During this phase's testing, `/collections/skin-care` intermittently returned **404** (and, separately, the homepage once returned **500**) when served via `npm run dev`. This was investigated thoroughly rather than dismissed or silently retried:

1. **Confirmed not a data problem** — a direct, read-only database query (`prisma.category.findUnique({where:{slug:"skin-care"}})`) during the failure window confirmed the `skin-care` category row exists, with `comingSoon: true`, exactly as expected. All 6 categories were confirmed present and correctly flagged.
2. **Confirmed not a code problem** — the page's `notFound()` logic is simple and unchanged (`if (!cat) notFound()`); the 500 was a `[React Server Components] InvariantError: Expected clientReferenceManifest to be defined... This is a bug in Next.js` — the framework's own dev-mode bundler, not application code.
3. **Confirmed dev-mode-only** — the exact same route was requested **10 times in a row, including immediately after a cold start**, against `npm run build && npm run start` (the production server): **10/10 succeeded**. A full 43-route sweep against the production server also passed 43/43 with zero retries and zero log errors.

**Conclusion:** this is a `next dev`-specific instability (a known class of Next.js 15 dev-server/HMR issue, already documented as recurring in this project's Phase 0 audit), not a Phase 1C regression and not a defect that would affect a real deployment (which runs the production build, not `next dev`). Logged in `PHASE_1D_DEFECT_LOG.md` for completeness, with a practical recommendation for Founder testing.

---

## Correction Pass — Live Verification Evidence (same day, following Founder testing)

Founder click-through testing found 4 real defects the checks above could not have caught (see
`PHASE_1D_DEFECT_LOG.md` DEFECT-1D-04/06/07/08). Every fix below was re-tested live, against a real
running instance connected to the real database — not assumed correct because it compiled. To avoid
disturbing the Founder's own running dev server (found listening on port 3000 during this pass), all
verification below ran a separate `npm run build && npm run start` instance on **port 3001**.

| Test | Method | Result |
|---|---|---|
| Invalid customer login | Real CSRF → POST `/api/auth/callback/credentials` against `muv@gmail.com` with a wrong password | Correctly rejected (`code=credentials`), no session issued |
| Email normalization (the actual fix) | Same real login flow with `" ADMIN@MUV.CO.IN "` (mixed case + whitespace) against the seeded admin's real password | **Failed on first attempt** — caught a self-introduced Zod ordering bug (`.email()` ran before `.trim()`). Fixed, rebuilt, retested: **succeeded**, session correctly resolved to `admin@muv.co.in` |
| Rate-limit error distinction | 6 real login attempts against a fresh, never-used test email within the 5-minute window | Attempts 1–5: `code=credentials`. Attempt 6: `code=rate_limited` — confirmed distinct and working |
| Rate-limit doesn't leak account existence | Same test used an email that has never been registered | Identical `rate_limited` behavior regardless of registration status — confirmed no new leak introduced |
| Homepage CMS banner image | Loaded the live homepage, checked rendered HTML for the specific Cloudinary path stored in `Banner.imageUrl` | **Before fix:** absent (stale/wrong image shown). **After fix:** present — real image now renders |
| Homepage CMS banner text (regression check) | Same request, checked for the already-correct subtitle text | Still present — text path unaffected by the image fix |
| Checkout Express pricing | Type-check + build + manual arithmetic trace against real order `#MUV423388`'s actual subtotal/discount | Confirmed Express would now total ₹707 (matching what checkout has always displayed) — **not verified via a live browser-driven order**, see Known Limitations |
| Admin RBAC regression (post-fix) | Fresh real login as admin → `/admin` (200); no session → `/admin` and `/account` (307 each) | All three exactly as expected — no regression from any change this pass |
| Full route sweep (post-fix) | 23 representative routes across storefront/auth/admin/API/SEO, on the corrected build | 23/23 correct status codes |
| Server error logs (post-fix) | Checked production server log after the full test sequence | Only expected `CredentialsSignin` entries from this pass's own deliberate invalid-login tests — no unexpected errors |

### What Remains Unverified (honestly, not silently)

- **Admin dropdown contrast — not visually confirmed.** The fix is a standards-based CSS change
  (`color-scheme: dark` + explicit `option` styling), scoped and type/build-clean, but this
  environment cannot render a browser to confirm the actual visual result.
- **Checkout Express pricing — not verified via an actual placed order.** Confirmed by code trace and
  arithmetic against real data, not by clicking through checkout, for the reasons stated in
  `PHASE_1D_DEFECT_LOG.md` DEFECT-1D-02/DEFECT-1D-07.
- **Customer-side login — only verified with the admin account's known credentials.** The email-
  normalization fix was proven correct in general (Zod schema logic is identical regardless of which
  account), but a real customer account's actual password is not known to this environment and was
  not tested directly.
- **Password visibility toggle and social-login divider — not visually confirmed**, same reason.

These four are exactly what `PHASE_1D_FOUNDER_ACCEPTANCE_CHECKLIST.md` exists to close.

---

## Correction Pass — Cart, Mobile Checkout, Coupon, Delivery, Returns and Admin Recovery (same day)

Founder browser testing found 10 further confirmed defects (see `PHASE_1D_DEFECT_LOG.md`'s newest
correction-pass section, DEFECT-1D-10 through DEFECT-1D-19). Verification below ran against a clean
`npm run build && npm run start` instance on **port 3000** (the prior dev-server processes, including
one left running from this pass's own admin-loading diagnosis, were stopped first — they held an
OS-level file lock on the Prisma client binary that blocked `npx prisma generate` after the schema
change described below).

| Test | Method | Result |
|---|---|---|
| Schema push (additive) | `npx prisma db push` — new `Order.shippingMethod` column, new `ReturnRequest`/`ReturnIssueType`/`ReturnRequestStatus` | Succeeded, "database now in sync," no data loss — confirmed non-destructive by design (new columns/tables only) |
| Prisma client regeneration | `npx prisma generate` | Succeeded after stopping the process holding the file lock |
| Type-check | `npx tsc --noEmit` | Clean, zero errors |
| Production build | `npm run build` | Clean — 43/43 routes generated including the new `/admin/returns`, no warnings |
| Admin panel loading (the reported defect) | Fresh admin login (CSRF → credentials → session) against `admin@muv.co.in`, then `GET /admin`, `/admin/orders`, `/admin/returns` | All three: **200**, with real expected content confirmed by string match (not just status code) — reconfirms this was a dev-server artifact, not a code defect |
| Storefront route sweep | `/`, `/login`, `/shop`, `/cart`, `/checkout`, `/returns`, `/shipping`, `/faq`, a real product page (`/products/muv-shield`) | All **200** |
| Returns policy content | String-matched the live `/returns` page for "48-hour" language | **Present** |
| Delivery threshold content | String-matched the live `/shipping` page for the new "499" threshold | **Present** |
| Product FAQ policy update | String-matched the live PDP for "48 hours" and the new "₹50 above" Express language | **Both present** |
| Delivery pricing vs. live `StoreSettings` | Direct read-only query of the `StoreSettings` singleton row | Confirmed already at `shippingFee: 49, freeShippingThreshold: 499` — matches the approved policy exactly, no data correction needed, only the Express calculation logic |
| Delivery method persistence | Direct query of 5 most recent real orders' `shippingMethod`/`shippingFee`/`subtotal` | All defaulted correctly to `STANDARD` on existing rows (expected — the column is new); fee-vs-subtotal math on each matches the ₹499/₹49 policy exactly |
| `ReturnRequest` full workflow | Direct Prisma script against a real `DELIVERED` order (`#MUV423388`, delivered 3.7 hours prior): create → joined admin-style read (order/item/customer) → duplicate-open-request guard → status transition (`SUBMITTED → UNDER_REVIEW` with admin notes) → cleanup | Every step succeeded exactly as `actions/returns.ts` implements it; duplicate guard correctly detected the just-created open ticket; test row deleted afterward, no real data left behind |
| Admin order detail — shipping method label | Logged in as admin, opened a real order detail page, checked for `"Shipping ("` (the new method-labeled line) | **Present** |
| Admin `/admin/returns` content | Logged in as admin, checked page content for "Return" | **Present**, real page (not an error/redirect) |

### What Remains Unverified (honestly, not silently)

- **Cart quantity button behavior — not confirmed via real click/tap.** The `disabled`-at-floor logic
  is code-verified and type/build-clean; the actual button feel (including on a touchscreen) needs a
  real browser.
- **Mobile layout at the specific requested widths (360/375/390/400/430px) — not confirmed visually.**
  The `lg:`-only sticky fix is a standards-based Tailwind breakpoint change; this environment cannot
  render a viewport to confirm the rendered result at each width.
- **Coupon apply → navigate → persist → remove — not confirmed via a real browser session.** The
  shared-state architecture (same `localStorage` persistence pattern as cart items, which does work)
  is code-verified; the actual client-side navigation and re-render was not click-tested.
- **Evidence upload (photo/video) for a return request — not confirmed end-to-end through a browser.**
  The signing action (`getReturnEvidenceUploadUrl`) reuses the exact, already-proven Cloudinary signing
  mechanics from the admin media uploader; the actual browser-side `fetch()` to Cloudinary and the
  resulting `secure_url` were not exercised, since that requires a real file picker and network call
  from a browser context.
- **A real end-to-end test order (Standard and Express, both sides of the ₹499 threshold) — not
  performed**, same reason as the original test report's Section C.

These are exactly the items called out in the Founder-facing final response as needing real
browser/device re-test.
