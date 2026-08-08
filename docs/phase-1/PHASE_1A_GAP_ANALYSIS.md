# Phase 1A — MUV Website Gap Analysis

### Status: Analysis complete · No website code, business logic, or database modified · Cross-checked against the MUV Knowledge Book and the verified Phase 0 audit

> Companion documents: `PHASE_1A_PAGE_MATRIX.md` (all 30 scope areas), `PHASE_1A_PRIORITY_BACKLOG.md`
> (24 issues, full evidence/acceptance-criteria detail), `PHASE_1A_KNOWLEDGE_REFERENCES.md` (every
> Knowledge Book citation used, with exact file/heading).

---

## 1. Executive Summary

The MUV website is a mature, substantially-complete Next.js 15 commerce platform (confirmed clean
build and RBAC coverage in Phase 0) that implements the Knowledge Book's Website Architecture (Part
II, Ch.7–8) and Website & Customer Technology System (Part XII, Ch.60) requirements correctly in
almost every structural respect: real journeys from discovery through checkout, a genuinely separate
institutional-inquiry pathway (not mixed into consumer purchase, exactly as Ch.7 requires), a real
approved/draft content-governance pattern across products/reviews/blog, and full admin CRUD.

This pass found **24 gaps**, none of which are broken checkout, broken auth logic, or data-loss risks.
The two most important findings are:

1. **A real, already-partially-self-documented pricing gap** (GAP-004): checkout's shipping fee and
   COD availability are hardcoded in `actions/orders.ts`, completely bypassing the admin-editable
   `StoreSettings` fields built for exactly this purpose. An admin changing shipping pricing in
   `/admin/settings` today has zero effect on what a customer actually pays.
2. **A cluster of site-wide, Knowledge-Book-explicit brand-language violations** (GAP-002, GAP-003,
   GAP-005, GAP-009): the brand name renders as all-caps "MUV" instead of the mandated "Muv" in
   customer-facing running text (title tag, meta description, footer, nav), the footer uses "moving"
   instead of the mandated "Muving" spelling, the Skin Care category page shows "Coming Soon" instead
   of "Muving Soon™" (contradicting the homepage's own correct badge for the same category), and the
   footer's social icons link to generic platform homepages instead of MUV's real profiles.

Two items are P0 (security/deployment blockers, both credential-hygiene, not application-logic
defects): the placeholder `AUTH_SECRET` and the seeded admin password, both already known from Phase
0 and now formally tracked as backlog items.

**No P0-severity application bug, data-loss risk, or broken customer journey was found.**

---

## 2. Current Strengths

- **Institutional/consumer journey separation is correct** — Chapter 7's explicit "Common Mistakes"
  warning against mixing business enquiry into the ordinary purchase flow is honored: `BusinessInquiry`
  is a fully separate model/form/action from `Order`/checkout.
- **Content governance matches the Knowledge Book's approved-vs-draft principle** exactly:
  `Product.status` (DRAFT/ACTIVE/ARCHIVED), `Review.status` (PENDING/APPROVED/REJECTED),
  `BlogPost.status` (DRAFT/SCHEDULED/PUBLISHED) all enforce the "content systems must preserve the
  difference between approved information and draft material" rule (Ch.7 "Content Control").
- **Approved category list matches exactly**: Home Care, Fabric Care, Body Care, Personal Care, Car
  Care (all live), Skin Care (correctly flagged `comingSoon`) — verified directly against
  `prisma/seed.ts`.
- **"Magic in Muv" correctly does not appear anywhere in website content** — full-codebase search
  found zero matches outside the Knowledge Book files themselves, correctly honoring Ch.13's rule that
  new use must follow the current identity decision (Keep Muving) while historical label use elsewhere
  is left undisturbed.
- **"Keep Muving™" tagline treatment is consistent and correct** across nav, footer, homepage, About,
  page titles, transactional emails, and order-success — the one tagline instance genuinely done right
  almost everywhere it appears.
- **RBAC/security architecture has no logic gaps** — every Server Action independently enforces
  `requireStaff`/`requireAdmin`/`requireCustomer` (re-confirmed Phase 0); the real risks found are
  credential hygiene (GAP-001, GAP-008), not authorization logic.
- **Backend/automation discipline matches Chapter 8's "labelled as planned or deferred" rule** — every
  not-yet-live capability found (WhatsApp templates, CSP header, Apple Sign-In) is already correctly
  gated behind a toggle or absent UI, never presented as live when it isn't.

---

## 3. Critical Gaps

No P0 application-logic gap was found. The two P0 items are both credential/config hygiene, not
broken functionality:

- **GAP-001** — `AUTH_SECRET` is still the literal placeholder string.
- **GAP-008** — Seeded admin credential (`admin@muv.co.in` / `ChangeMe123`) has no guard against
  reaching a production database.

Both are deployment blockers per the priority definitions ("security issue," "deployment blocker")
and should be resolved before any real deployment, but neither reflects a defect in the application
itself — both are config/process gaps already flagged in the project's own `CLAUDE.md`.

---

## 4. Brand and Content Gaps

The single largest cluster of findings this pass, all traced to Part III (Brand System):

| Gap | What | Where |
|---|---|---|
| GAP-002 | All-caps "MUV" in customer-facing running text instead of "Muv" | Page title, SEO meta description, footer, nav, About/Brand Story copy |
| GAP-003 | "moving" instead of "Muving" | Footer |
| GAP-005 | "Coming Soon" instead of "Muving Soon™," inconsistent with the homepage's own correct badge | Skin Care category landing page |
| GAP-009 | Footer social icons link to generic platform homepages, not MUV's real profiles, despite `StoreSettings` fields existing for this | Footer |
| GAP-019 | Stale comments claiming the business-inquiry backend doesn't exist (it does) | `business-section.tsx`, `footer.tsx` |
| GAP-022 | Admin-internal "Coming Soon" badge wording (low customer impact) | `/admin/cms/categories` |

All six are text/copy-only changes with very low regression risk — no business logic, pricing, or
database change is implied by any of them.

**One item explicitly checked and found compliant, not a gap:** the legacy project doc
`PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` instructs "never the word 'premium'" — the Knowledge Book
(Part III, Ch.11–12, 20+ occurrences) treats "Premium" as a core, approved brand trait. Per the
constitution rules in `CLAUDE.md`, the Knowledge Book supersedes the legacy doc here; current code
following the Knowledge Book's "premium" usage is correct, not a violation, even though it contradicts
an old project doc's stricter rule. See `PHASE_1A_KNOWLEDGE_REFERENCES.md` §"Conflicts."

---

## 5. Customer Experience Gaps

- **GAP-004** (shared with Admin/Commerce below) surfaces on the customer side as a cart-page shipping
  estimate that can silently disagree with what checkout actually charges, since both currently read
  the same hardcoded constants rather than a single settings-driven source.
- **GAP-014** — WhatsApp order-status messages depend on provider-side template approval that hasn't
  happened yet; correctly gated (nothing sends falsely), but customers on the configured messaging
  provider won't receive these messages until that approval step completes.
- **GAP-024** — no customer-facing "Your Shopping Profile" view of the real preference data the site
  already computes; a genuine future enhancement, not a defect.

No broken or missing core customer journey (browse → cart → checkout → order → account) was found.

---

## 6. Admin and Commerce Gaps

- **GAP-006** — no admin UI for `BusinessInquiry` management; the single most operationally consequential
  gap found this pass, since it leaves institutional leads with no durable staff-side record beyond a
  one-time email alert.
- **GAP-004** — admin-configured shipping/COD settings are captured by the CMS but not consumed by
  checkout; the admin panel is honest about what it stores, but a store owner would reasonably (and
  incorrectly) assume changing it changes what customers pay.
- **GAP-015** — no unified marketing-campaign system (banners + coupons independently managed); a real
  future scope item, not a current defect.
- **GAP-016** — the Phase 14A personalization rail isn't admin-toggleable; also a future scope item.

---

## 7. Technical Gaps

- **GAP-010** — no automated test suite at all.
- **GAP-011** — no ESLint configuration.
- **GAP-018** — no background job scheduler (affects scheduled blog publishing precision and abandoned-
  payment cleanup, both currently handled by on-request self-correction rather than a real cron).
- **GAP-017** — no cross-device `Cart` table (deliberate, documented deferral — not a gap requiring
  action unless the Founder changes the requirement).

---

## 8. Security and Permission Gaps

- **GAP-001, GAP-008** — see Critical Gaps above.
- **GAP-012** — in-process-memory rate limiting won't survive horizontal scaling (a real gap only once
  the app is deployed across more than one server instance).
- **GAP-013** — no Content-Security-Policy header, deliberately deferred pending a safe way to test it
  against live Razorpay/Cloudinary integrations.
- **GAP-007** — shipping webhook signature verification uses an unconfirmed generic scheme across all
  four courier providers.
- **GAP-020** — live-looking Cloudinary credentials present in the checked-in `.env`, provenance
  unconfirmed.
- **RBAC/authorization logic itself: no gap found.** Every Server Action independently enforces its own
  role check (re-confirmed this pass by re-reading `lib/rbac.ts`/`middleware.ts` unchanged since Phase
  0's direct read).

---

## 9. Mobile Gaps

**Not independently verified this pass** — no browser or device automation tooling is available in
this environment. Every component read during this analysis consistently used Tailwind's responsive
breakpoint classes (`sm:`/`md:`/`lg:`), matching the pattern Phase 16 already established, and Chapter
7's "Responsive Review" seven-point checklist appears structurally addressed by the codebase's
conventions — but this is an inference from code patterns, not a click-tested confirmation. Recorded
honestly as a verification gap, not a confirmed defect.

---

## 10. SEO and Performance Gaps

- **SEO:** sitemap, robots, and JSON-LD structured data are real and complete (confirmed Phase 0/16);
  the one SEO-surface-specific finding is GAP-002 (all-caps "MUV" in the default meta description).
- **Performance:** Phase 16's indexing and bundle-splitting hardening is real and verified (clean
  production build, confirmed again in Phase 0 validation); no new performance regression found this
  pass. GAP-010/011/012 are engineering-quality/scaling gaps, not measured performance problems today.

---

## 11. Dependencies for Institutional Sales

Directly blocking, per this pass's findings:
- **GAP-006** — an admin inbox/workflow for `BusinessInquiry` must exist before institutional leads can
  be operationally managed at any real volume.
- **GAP-004** — the settings-driven pricing pattern this gap exposes (admin-configured value → real
  checkout behavior) is the same pattern any future institutional/bulk pricing tier will need; fixing
  it now establishes the correct wiring pattern rather than compounding a second hardcoded-pricing
  surface later.

Not yet designed at all (named by Part VIII's own table of contents, not read in depth this pass since
implementation is out of scope for Phase 1A):
- No CRM concept exists anywhere in the schema — `Customer` has no institutional/B2B distinction from
  a retail customer.
- No bulk-pricing, tiered-pricing, or credit-terms model exists.
- No distinct institutional account type or role (`Role` enum is `ADMIN`/`STAFF`/`CUSTOMER` only).

---

## 12. Dependencies for MUV AI

- **The unresolved Part XII / Muv AI Sutra™ relationship** (carried forward from Phase 0, not
  re-litigated here — see `CLAUDE.md`'s "Known conflict" note) remains the first thing that needs
  Founder clarification before any MUV AI work begins, since it determines which document actually
  governs AI-domain decisions.
- **No knowledge-retrieval infrastructure exists in code at all.** The Muv AI Sutra™ (Ch.4–5) requires
  "AI searches canonical knowledge before any external source" and defines a full Knowledge
  Object/Lifecycle model — none of this has any counterpart in the current codebase. `lib/recommendations.ts`
  and `lib/preferences.ts` (the site's only "AI-shaped" code) are plain Prisma queries with zero
  connection to either Knowledge Book file; they are commerce personalization, not knowledge-grounded
  intelligence in the Sutra's sense.
- **GAP-016** (personalized homepage rail) is the most natural existing extension point for future MUV
  AI personalization work — it's real, live, and already the closest thing in the codebase to
  AI-driven customer experience.
- **GAP-024** (no customer-facing shopping-profile view) is a plausible future MUV AI–surfaced feature,
  currently only a backend computation.

**Nothing in this pass suggests MUV AI implementation is close to ready to begin** — the gap is
architectural (no retrieval/knowledge-object layer exists), not a matter of wiring up a few missing
pieces.

---

## 13. Recommended Phase 1B Planning Scope

Based strictly on what this pass found, not speculative feature ideas:

1. **Fix the P1 brand/content cluster** (GAP-002, GAP-003, GAP-005, GAP-009, GAP-019) — low-risk,
   high-visibility, purely additive text changes; a natural, fast Phase 1B opening batch.
2. **Wire `StoreSettings` pricing into checkout** (GAP-004) — the single highest-value functional fix
   found; establishes the settings-driven pattern Institutional Sales will also need.
3. **Build the `BusinessInquiry` admin view** (GAP-006) — directly unblocks Institutional Sales
   groundwork without requiring any new schema.
4. **Resolve the two P0 credential items** (GAP-001, GAP-008) as a pre-launch gate, independent of
   feature work.
5. **Get explicit Founder clarification on the Part XII / Muv AI Sutra™ relationship** before any MUV
   AI-domain Phase 1B scope is defined — this is a decision dependency, not an engineering task.
6. **Defer P2/P3 items** (testing, ESLint, CSP, marketing-campaign unification, personalization
   admin-toggle, shopping-profile UI) to a later phase or an explicit Founder prioritization call —
   none of them block a functioning, brand-correct storefront.

---

## Conflicts and Ambiguities (summary — full detail in `PHASE_1A_KNOWLEDGE_REFERENCES.md`)

1. Legacy `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`'s "never use 'premium'" rule is superseded by the
   Knowledge Book's explicit, repeated use of "premium" as an approved brand trait — not an unresolved
   conflict, but flagged so future brand-copy work doesn't follow the superseded rule.
2. "Muving Soon™" (named in this task's own brand-validation brief) was not independently located
   anywhere in the Knowledge Book's searchable text, despite thorough, repeated searching — very
   likely an already-settled Founder decision not yet transcribed into the Knowledge Book, not a
   conflict requiring resolution, but worth adding to the Knowledge Book for future traceability.
3. Volume IX (Customer Experience)'s table of contents is substantially food-service/outlet-oriented,
   implying a physical-retail dimension with no current website counterpart — not read in depth this
   pass (out of scope), flagged in case a future phase assumes it already covers e-commerce CX.

No conflict found this pass required guessing — every ambiguity above is recorded rather than
silently resolved, per the Knowledge Book Method rules.
