# Phase 1C — Remaining Issues

Everything from the approved Phase 1A/1B backlog not resolved this phase, plus one issue discovered
during implementation itself, each with why it's still open and what unblocks it.

---

## Carried forward from the approved backlog (deliberately not attempted)

| Gap | Status | Why still open | Unblocked by |
|---|---|---|---|
| GAP-001 — `AUTH_SECRET` placeholder | Not touched | This phase's core rules forbid changing secrets/credentials | A deliberate, separate Founder action: `npx auth secret` + deploy-environment update |
| GAP-007 — shipping webhook signature scheme unconfirmed | Not touched | Requires live courier account documentation this environment can't access | Founder/ops access to the configured `SHIPPING_PROVIDER`'s real webhook-signing docs |
| GAP-010 — no test suite | Not touched | Explicitly Cross-Cutting/deferred per Phase 1B — new devDependency decision | Founder scope call on test framework |
| GAP-011 — no ESLint config | Not touched | Same as above; `next lint`'s interactive setup can't run in this environment | Founder scope call + one interactive setup session |
| GAP-012 — in-process rate limiting | Not touched | Only a real gap once deployed beyond one server instance | Hosting/scaling decision + Upstash Redis (or equivalent) integration |
| GAP-013 — no CSP header | Not touched | Deliberately deferred since Phase 16 pending a safe way to test against live Razorpay/Cloudinary | A real staging environment to test against before shipping |
| GAP-014 — WhatsApp templates unapproved | Not touched (code already correct) | Template approval is a messaging-provider dashboard action, not code | Founder/ops approving `payment_confirmed`/`order_delivered`/`order_shipped` in the live provider |
| GAP-015 — no unified marketing-campaign system | Not touched | A new feature, not a stabilization fix | Explicit Founder scoping for a future phase |
| GAP-016 — personalization rail not admin-toggleable | Not touched | Same — new feature | Explicit Founder scoping |
| GAP-017 — no cross-device `Cart` table | Not touched | Deliberate design choice, unchanged | Only if cross-device cart recovery becomes a real requirement |
| GAP-018 — no background job scheduler | Not touched | Depends on a hosting-platform decision | Founder/ops choice of scheduler (platform cron, hosted job runner) |
| GAP-020 — Cloudinary credential provenance | Half-open — see below | Rotating a credential is forbidden by this phase's core rules | Founder confirms whether the `.env` credentials are an intentional dev sandbox |
| GAP-021 — Apple Sign-In inactive | No action needed | Already correctly gated; not a defect | Real `APPLE_ID`/`APPLE_CLIENT_SECRET` if ever wanted |
| GAP-023 — category color differentiation | No action needed | Knowledge Book itself states this isn't a locked/final spec | A future Founder decision to formally lock a per-category palette |
| GAP-024 — no customer-facing shopping-profile view | Not touched | A new feature, not a stabilization fix | Explicit Founder scoping |

## Discovered during Phase 1C implementation (new, not in the original backlog)

### Checkout's Express Delivery price (₹99) is display-only — never charged
- **What:** Selecting "Express Delivery" in checkout shows ₹99 added to the on-screen total, but
  `createOrder` has no field to receive which delivery tier was chosen — it always computes shipping
  from the Standard-Delivery threshold logic regardless of what the customer picked. This predates
  Phase 1C; Standard Delivery's price is now correctly wired to real `StoreSettings` values (this
  phase's GAP-004 fix), but Express was never wired to the server at all, before or after this phase.
- **Customer impact:** A customer who selects Express Delivery sees a total during checkout review
  that the server will not actually charge (the server silently ignores the Express selection and
  charges Standard's fee instead).
- **Why not fixed this phase:** Requires a new `createOrderSchema` field, new business logic (is
  Express a flat surcharge? does the server need to validate it against real courier capability?), and
  a product decision about how Express should actually work — a new capability, not "wire an existing
  hardcoded value to an existing settings field" (see `PHASE_1C_DECISION_LOG.md` D7).
- **Recommended next step:** A short, explicit scoping conversation before Phase 1D/2 touches
  checkout again — this is now the single most concrete, well-evidenced functional gap in the
  checkout flow.
- **Priority recommendation:** P1 (same tier as the original GAP-004) — it's a real discrepancy
  between what a customer is shown and what they're charged, on the highest-value page in the app.

## Half-open items

### GAP-020 — Cloudinary credential provenance
Not resolved, but the code-level question is now smaller than before: nothing about this phase's
work depends on the answer, and no code reads or displays these credentials anywhere customer-facing.
Still needs a direct Founder confirmation (intentional dev sandbox vs. needs rotation), tracked exactly
as Phase 1B left it.

### GAP-006's underlying data model
The new `/admin/inquiries` page is real and functional, but it's a minimal list/status view — no
search, no export, no assignment-to-staff-member concept. Sufficient to close the "no durable record"
gap Phase 1A identified; not a full CRM. Institutional Sales dependency work (per Phase 1A's own
"Dependencies for Institutional Sales" section) will need considerably more than this.

---

## Summary

15 items carried forward exactly as scoped (all correctly out of this phase's approved boundaries,
per explicit rule or explicit prior deferral) + 1 newly-discovered issue (Express Delivery pricing)
recommended for prioritization before Phase 1D proceeds further into checkout-adjacent work.
