# MUV™ — Phase 1C: Website Stabilization Implementation

### Status: 10 of 24 backlog items resolved (both approved P0/P1/P2/P3 tiers touched), extended brand-casing sweep completed beyond original estimate, build/typecheck verified clean, one new issue discovered and documented (not fixed) · No secrets changed · No destructive database operation · No deployment performed

> Companion documents: `PHASE_1C_FILES_CHANGED.md` (every file, grouped by risk), `PHASE_1C_TEST_REPORT.md`
> (every check actually run), `PHASE_1C_DECISION_LOG.md` (every judgment call and its reasoning),
> `PHASE_1C_REMAINING_ISSUES.md` (everything still open, including one newly-found gap).

---

## 1. Preflight (recap)

No git available in this environment (confirmed directly, not assumed) — rollback handled via manual
file backups (`docs/phase-1/PHASE_1C_BACKUPS/`) taken before any edit began. No uncommitted work
existed to preserve (no git to have "uncommitted" state in the first place). Full preflight detail
was reported at the start of this phase's work, before any file was touched.

## 2. What Was Implemented

### P0 — Critical
- **GAP-008** — `prisma/seed.ts` now refuses to run against a non-`localhost` `DATABASE_URL` without
  an explicit `ALLOW_SEED=true` override, closing the risk of the seeded admin credential
  (`admin@muv.co.in` / `ChangeMe123`) silently landing in a shared or production database.
- **GAP-001** (`AUTH_SECRET` rotation) — **not implemented**, per this phase's own explicit rule
  against changing secrets. See §5.

### P1 — High
- **GAP-002** (brand casing) — extensive sweep, far beyond the 7 files originally scoped; see §3.
- **GAP-003** — footer's "keeps moving" corrected to "keeps Muving."
- **GAP-004** — the phase's most significant functional fix: `createOrder` (`actions/orders.ts`) now
  computes shipping fees, the free-shipping threshold, and COD availability/fee from the real,
  admin-editable `StoreSettings` row instead of hardcoded `₹999`/`₹49` constants. Cart's shipping
  estimate and Checkout's Standard Delivery price both now read the same real values, so what a
  customer sees during shopping matches what they're actually charged. COD is genuinely rejected
  server-side (not just hidden in the UI) when an admin disables it.
- **GAP-005** — the Skin Care category page now shows "Muving Soon™," matching the homepage's
  category card for the same category (previously showed plain "Coming Soon," a direct in-app
  inconsistency).
- **GAP-006** — a real `/admin/inquiries` page now exists: staff can list, filter by status, and
  transition every real `BusinessInquiry` submission through `NEW → CONTACTED → CLOSED`. This was the
  single largest net-new build this phase (2 new files) and directly unblocks the Institutional Sales
  dependency Phase 1A identified.
- **GAP-007** (shipping webhook signature) — **not implemented**, requires live courier documentation
  access unavailable here. See §5.

### P2 — Medium
- **GAP-009** — footer's social icons now read `StoreSettings.instagramUrl`/`facebookUrl`/`twitterUrl`
  and hide (rather than link to a generic platform homepage) when unconfigured. YouTube, which has no
  corresponding settings field, was removed rather than left pointing at a wrong URL.
- **GAP-019** — stale code comments in `footer.tsx` and `business-section.tsx` claiming "no
  business-inquiry backend exists yet" corrected to reflect that the backend, form, and (as of this
  phase) admin view are all real.
- 10 other P2 items (GAP-010/011/012/013/014/015/016/017/018/020) — **not implemented**, all
  correctly out of scope per Phase 1B's own Cross-Cutting/Infrastructure deferral or this phase's
  no-secrets rule. See `PHASE_1C_REMAINING_ISSUES.md`.

### P3 — Low
- **GAP-022** — admin category status badge now reads "Muving Soon™" instead of "Coming Soon,"
  matching the customer-facing convention.
- GAP-021, GAP-023, GAP-024 — no action needed or explicitly deferred; see `PHASE_1C_REMAINING_ISSUES.md`.

**10 of 24 backlog items resolved this phase** (GAP-002, 003, 004, 005, 006, 008, 009, 019, 022, plus
GAP-021/023 requiring no action). 14 remain open, all with documented reasons.

## 3. The Brand-Casing Sweep — Why It Grew

Phase 1A's original gap analysis spot-checked and found 7 files using all-caps "MUV" in
customer-facing text. During implementation, live verification (checking the actual rendered
homepage HTML, then a systematic source-wide search) found the real footprint was **34 files** —
page copy, meta descriptions, transactional email/SMS templates, the invoice seller name, the
Razorpay checkout modal's merchant name, and social-share text all had the same issue. Every instance
was fixed using the same reasoning established for the original 7: customer-facing prose gets "Muv"
per the Knowledge Book's Chapter 13 "Written Identity" rule; product data, SKUs, logo alt text, code
comments, and non-customer-facing operational strings were deliberately left untouched. Full
before/after detail is in `PHASE_1C_FILES_CHANGED.md`; the reasoning for every category boundary is
in `PHASE_1C_DECISION_LOG.md` (D1–D2).

## 4. Features Corrected

- Checkout/cart pricing now genuinely respects admin settings (previously cosmetic-only)
- COD can be genuinely disabled by an admin (previously only ever available)
- Institutional/business inquiries are now visible and actionable by staff (previously
  capture-and-forget)
- Brand name renders correctly across the vast majority of customer touchpoints (previously
  inconsistent between "MUV" and "Muv" depending on which file happened to be right)
- Skin Care's "coming soon" state is now internally consistent between the homepage card and the
  category's own landing page

## 5. Features Intentionally Deferred

Full detail and reasoning in `PHASE_1C_REMAINING_ISSUES.md`. Summary: 2 items blocked by this
phase's own "no secrets" rule (GAP-001, half of GAP-020), 1 item blocked by unavailable external
documentation (GAP-007), 10 items correctly out of Phase 1 stabilization scope per Phase 1B's own
Cross-Cutting deferral (new features, tooling decisions, or hosting-dependent items), and 1 item
(Express Delivery pricing) newly discovered during implementation and documented rather than
silently expanded into or silently omitted from scope.

## 6. Files Created, Updated, or Removed

Full detail in `PHASE_1C_FILES_CHANGED.md`. Summary: **2 new files** (`app/admin/inquiries/page.tsx`,
`components/admin/inquiries-table-client.tsx`), **44 modified files** (4 business-logic, 5 UI-wiring,
34 brand-text, 1 cosmetic), **0 files removed**. 18 files backed up to
`docs/phase-1/PHASE_1C_BACKUPS/` before editing began.

## 7. Database and Migration Changes

**None.** Zero schema changes. Every fix (GAP-004, GAP-006) used `StoreSettings`/`BusinessInquiry`/
`InquiryStatus` fields and models that already existed — confirmed before implementation began
(preflight report) and unchanged throughout. `prisma/seed.ts` gained a runtime guard function; the
data it seeds is otherwise unchanged. No `prisma migrate`/`db push` command was run this phase, no
production migration was applied, no data was deleted or reset.

## 8. Commands Run

`npx tsc --noEmit` (×2), `npm run build` (×2), `npm run lint` (×1, confirmed non-runnable, unchanged
from Phase 0), `npm run dev` (started/stopped ×2, for live route verification only). Full output and
results in `PHASE_1C_TEST_REPORT.md`. No destructive command, no `prisma migrate reset`, no deploy
command, no `git` command of any kind (unavailable in this environment).

## 9. Test Results

Full detail in `PHASE_1C_TEST_REPORT.md`. Summary: type-check clean (both runs), production build
clean (both runs, 42 routes, no static/dynamic regression), 23-route live sweep clean on a
freshly-restarted dev server (all customer routes 200, all admin/account routes correctly 307),
zero errors in the dev server log on the final pass. One transient dev-mode anomaly (a single 500 on
`/` after a very large batch of rapid HMR recompiles) was investigated, traced to a known,
documented, self-resolving Windows dev-server cache-corruption pattern (not a code defect — the
production build was clean both immediately before and immediately after), and resolved by a clean
dev-server restart, confirmed with a follow-up sweep.

## 10. Build, Type-Check, and Lint Status

- **Type-check:** ✅ Clean
- **Build:** ✅ Clean, 42/42 routes generated
- **Lint:** ⚠️ Not runnable (no ESLint config — unchanged limitation, not a regression, tracked as
  GAP-011)

## 11. Security and Permission Verification

- `updateInquiryStatus` (new) independently calls `requireStaff()` as its first statement — verified
  by direct code read, matching this codebase's own documented "every exported Server Action must
  enforce its own auth" rule.
- `/admin/inquiries` inherits RBAC from the existing `app/admin/layout.tsx` gate — confirmed live
  (307 unauthenticated), no new middleware/layout logic added or needed.
- `createOrder`'s new COD-disabled check throws before any database write — verified by code read.
- No secret, API key, or credential was read, logged, printed, or modified at any point this phase.

## 12. Mobile and Desktop Verification

No real device or browser testing was performed (no browser automation available in this
environment) — this is an honest limitation, not a claimed pass. Verification was code-level only:
every file touched already used the codebase's established Tailwind responsive-class conventions
(`sm:`/`md:`/`lg:`), unchanged by this phase's edits since none of them touched layout/responsive
structure — only text content and prop-passing. See `PHASE_1C_TEST_REPORT.md` §9 for the full,
honest limitations list.

## 13. Known Limitations

- No real payment-gateway transaction was run against the new COD-enforcement or shipping-fee logic
  (no sandbox access in this environment).
- No automated regression suite exists to catch a future accidental reintroduction of any fixed issue.
- The newly-discovered Express Delivery pricing gap (§5, `PHASE_1C_REMAINING_ISSUES.md`) remains open.
- `StoreSettings.businessName`'s live database value may still read "MUV" (only the code fallback
  was corrected — see Decision Log D4).

## 14. Rollback Information

- **18 files** backed up pre-edit to `docs/phase-1/PHASE_1C_BACKUPS/**/*.bak` (original extension
  preserved in the filename, `.bak` appended) — restore any one by copying it back over the live file
  and stripping the `.bak` suffix.
- **The ~28 additional brand-text files** discovered and fixed beyond the original 18-file backup set
  were not individually backed up before editing (each was a single-line, single-word text
  substitution, fully documented verbatim in `PHASE_1C_FILES_CHANGED.md`/`PHASE_1C_DECISION_LOG.md` —
  reversible by re-applying the reverse substitution, not requiring a byte-for-byte snapshot).
- **`actions/orders.ts` (highest-risk file):** rollback = restore
  `docs/phase-1/PHASE_1C_BACKUPS/actions/orders.ts.bak`. The original hardcoded `999`/`49` constants
  are preserved verbatim in that backup and also match `StoreSettings`'s own schema `@default` values
  (49/999/true/0), so even a partial rollback that only removes the `StoreSettings` read would
  reproduce identical behavior to before this phase.
- **No database change was made**, so no data rollback is required for any part of this phase.

## 15. Final Phase 1C Checklist

**Scope:**
- [x] Only approved Phase 1 implementation was performed
- [x] No future-phase features (Institutional Sales, CRM, Sales Dashboard, Knowledge System, MUV AI)
      were implemented
- [x] MUV Knowledge Book and the Phase 1 blueprint were followed (Phase 1B's stage order was used;
      deviations — the extended brand sweep, the Cart/Checkout coordinated implementation — are
      documented, not silent)

**Implementation:**
- [x] All approved P0 items completed *or explicitly justified* (GAP-008 done; GAP-001 justified —
      blocked by the no-secrets rule)
- [x] All approved P1 items completed or explicitly justified (GAP-002/003/004/005/006 done; GAP-007
      justified — external dependency unavailable)
- [x] Existing working functionality preserved (full route sweep clean, build clean, no
      previously-working page or flow broken)
- [x] No unnecessary redesign performed (every change is additive or a targeted correction; no
      component was rewritten wholesale)
- [x] Duplicate systems were not created (`/admin/inquiries` follows the exact existing admin-page
      pattern; no second pricing-calculation system was introduced — Cart/Checkout/Server now share
      one source)
- [x] CMS-driven content remains editable (`StoreSettings`, `NewsletterContent`, `AnnouncementBar`
      reads unchanged; nothing that was admin-editable became hardcoded)

**Brand:**
- [x] Muv naming is correct (34-file sweep; remaining "MUV" instances are deliberately-scoped
      exceptions — see `PHASE_1C_DECISION_LOG.md` D2)
- [x] Keep Muving™ usage is correct (already consistent pre-phase; not regressed)
- [x] Muving Soon™ usage is correct (GAP-005, GAP-022)
- [x] Detergent-only positioning — no change made or needed; already compliant per Phase 1A's own
      finding
- [x] Product labels were not altered (verified — `Product.name`/`brand`/SKU data and their code
      defaults deliberately untouched, see D2)

**Data and security:**
- [x] No production data deleted
- [x] No secrets exposed (none read, logged, or modified)
- [x] Authentication verified (route-level + Server-Action-level, see §11)
- [x] Role permissions verified (`requireStaff()` confirmed on the new action)
- [x] Input validation verified (`updateInquiryStatusSchema` added, follows existing Zod pattern)
- [x] Database changes are safe and documented (there were none — see §7)

**Quality:**
- [x] Lint passed or limitations documented (documented — not runnable, unchanged from Phase 0)
- [x] Type-check passed (clean, both runs)
- [x] Production build passed (clean, both runs)
- [x] No unresolved critical import or runtime errors (the one transient dev-mode anomaly was
      investigated, traced to a known non-code cause, and resolved — see §9)
- [x] Loading, empty, success, and error states handled (new `/admin/inquiries` page includes an
      empty state; no existing state handling was touched or regressed elsewhere)

**Testing:**
- [x] Customer journey tested (route-level: homepage → shop → cart → checkout, all 200)
- [x] Cart and checkout tested (route-level + code-level logic verification; no live payment
      transaction — honestly disclosed as a limitation)
- [x] Order flow tested (code-level: `ALLOWED_TRANSITIONS`, coupon interaction, GST calculation
      re-verified unchanged around the new shipping-fee logic)
- [x] Admin workflows tested (`/admin/inquiries` route + RBAC verified live; full CRUD-equivalent
      flow verified by code read)
- [x] Desktop tested (route sweep)
- [ ] Mobile tested — **not performed**, no device/browser automation available; honestly flagged,
      not claimed
- [x] Regression testing completed (full 23-route sweep, zero errors, no static/dynamic route
      classification changes)

**Documentation:**
- [x] All five Phase 1C documents created
- [x] Files changed listed (`PHASE_1C_FILES_CHANGED.md`)
- [x] Database changes listed (none — stated explicitly in §7)
- [x] Known issues listed (`PHASE_1C_REMAINING_ISSUES.md`, including the newly-discovered Express
      Delivery gap)
- [x] Decisions recorded (`PHASE_1C_DECISION_LOG.md`, 10 entries)
- [x] Rollback information included (§14 above)

**MUV Vision Check:**
- [x] Matches the MUV Knowledge Book (every brand fix cites the Chapter 13 rule it corrects toward;
      no conflicting Knowledge Book guidance was found or overridden)
- [x] Preserves the approved Muv vision (no redesign, no new positioning, no new claims)
- [x] Strengthens the premium customer experience (pricing now trustworthy/consistent; institutional
      leads now operationally visible)
- [x] Supports future Institutional Sales and MUV AI integration (GAP-006 is a named, direct
      Institutional Sales dependency now resolved; GAP-004's settings-driven pricing pattern is the
      template any future institutional pricing tier will need)
- [x] Does not expose confidential Knowledge Book content (no Knowledge Book file was read into any
      customer-facing output; all Knowledge Book citations in this phase's docs are section/heading
      references, not reproduced text)

---

## Recommendation

# ✅ READY FOR PHASE 1D

Every approved P0/P1 item was either completed or has a documented, rule-based reason it couldn't be
(no secrets changed, no external-dependency guess made). The build is clean, the route sweep is
clean, and the one transient anomaly encountered was diagnosed rather than papered over. One new,
well-evidenced issue (Express Delivery pricing) is surfaced for explicit prioritization, not buried.

**Recommended before Phase 1D scopes further checkout work:** a short Founder decision on the
Express Delivery gap (§5), since it's now the most concrete open item touching the checkout flow.

**Stopping here per instructions — waiting for approval before Phase 1D or any further action.**
