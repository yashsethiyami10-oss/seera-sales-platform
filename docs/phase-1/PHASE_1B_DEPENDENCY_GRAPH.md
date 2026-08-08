# Phase 1B — Dependency Graph

## Module Implementation Sequence

```
Stage 0 — Pre-flight (AUTH_SECRET rotation, seed guard)
   ↓
Homepage
   ↓
Header
   ↓
Navigation
   ↓
Footer
   ↓
Category Pages
   ↓
Shop / Product Detail / Search / Wishlist   (verification batch, no code change)
   ↓
Cart
   ↓
Checkout
   ↓
Customer Account   (verification of Stage 0's effect)
   ↓
Orders
   ↓
CMS   (verification only)
   ↓
Admin
   ↓
Product Management / Category Management   (low-effort batch)
   ↓
Inventory / Coupons / Media / Analytics   (verification + decision-point batch)
   ↓
Notifications   (external, parallel-safe)
   ↓
Mobile / Accessibility   (final verification gate)
   ↓
SEO   (bundled into Homepage stage in practice — see note below)
```

This extends the brief's example sequence (Homepage → Header → Navigation → Footer → Categories →
Products → Cart → Checkout → Customer Account → CMS → Admin) through all 25 modules plus the
pre-flight and cross-cutting items the example didn't name. "Products" in the brief's example maps to
the Shop/Product Detail/Search/Wishlist verification batch here, since no code change was found
needed in any of them.

**Note on SEO's position:** SEO's one real fix (`lib/seo.ts`, `app/layout.tsx` casing) is the same
underlying text-casing gap as Homepage's, in adjacent files — it is listed at the end of the module
list per the brief's ordering, but is implemented *together with* Stage 1 (Homepage) in practice,
not as a separately-scheduled stage. Its "official" position in the sequence above reflects the
brief's requested module list order; its *actual* build position is Stage 1.

---

## Why Each Arrow Exists (real dependencies, not just brief-ordering)

| From → To | Real dependency, or "ordering only"? |
|---|---|
| Pre-flight → Homepage | **Ordering only.** No code dependency — Stage 0 is config, Homepage is component text. Sequenced first because it's the two P0 items and blocks real deployment regardless of what else happens. |
| Homepage → Header | Ordering only — no shared file, no logic dependency. Header has zero changes in this blueprint. |
| Header → Navigation | Ordering only. |
| Navigation → Footer | Ordering only — `nav.tsx` and `footer.tsx` are independent files with independent, non-overlapping gaps. Both could technically happen in parallel; sequenced per the brief's ordering. |
| Footer → Category Pages | Ordering only. |
| Category Pages → Shop/Product Detail/Search/Wishlist verification | Ordering only — this batch is pure regression-checking after the preceding text changes, confirming shared layout (`Footer`, `Nav`) changes didn't break unrelated pages. |
| Verification batch → Cart | Ordering only. |
| **Cart → Checkout** | **Real, hard dependency — the only one in this graph that must not be reordered.** Cart's shipping-estimate fix (GAP-004, display side) reads from the same shared source Checkout's fix (GAP-004, logic side) introduces in `actions/orders.ts`. Fixing Cart's display before Checkout's logic exists would either require a second, temporary hardcoded value (recreating the exact inconsistency this blueprint exists to remove) or leave Cart broken until Checkout lands. **In practice, implement Cart and Checkout as one coordinated change, in the same PR/session, even though they're listed as two stages for module-tracking clarity.** |
| Checkout → Customer Account | **Partial real dependency** — not through Checkout's own code, but through Stage 0 (which happens before Checkout in this sequence): Customer Account's verification stage exists specifically to confirm Stage 0's `AUTH_SECRET` rotation didn't break login, and by this point in the sequence Stage 0 has had the most "soak time" against the intervening changes. |
| Customer Account → Orders | Ordering only — Orders' one change (GAP-007, webhook signature) is independent of Customer Account. |
| Orders → CMS | Ordering only. |
| CMS → Admin | **Real, soft dependency** — Admin's new `BusinessInquiry` page (GAP-006) follows the exact existing pattern every other `/admin` page uses (Server Component + Prisma query → Client Component → Server Action), which is easiest to build correctly right after the CMS verification stage has re-confirmed that pattern is still working end-to-end elsewhere in `/admin`. Not a hard blocker — Admin's build does not literally require CMS's stage to run first. |
| Admin → Product Management/Category Management | Ordering only — bundled because both are low-effort `/admin` items best reviewed together with Admin's new page, for one combined `/admin`-focused review pass. |
| → Inventory/Coupons/Media/Analytics | Ordering only, except: **Coupons has a real testing dependency on Checkout (Stage 8)** — the coupon+shipping interaction must be verified once Checkout's pricing logic changes, which is why Stage 8's own testing checklist already includes a coupon case rather than waiting for this later stage. This later stage is a final confirmation pass, not where the real verification work happens. |
| → Notifications | **No dependency at all** — GAP-014 (WhatsApp template approval) is external to the codebase and could genuinely happen at any point in this sequence, in parallel with any other stage. Listed near the end only to match the brief's module list order. |
| → Mobile/Accessibility | **Real, intentional dependency** — both are explicitly sequenced *after* every module that touches customer-facing UI (Stages 1–12), specifically so the device/assistive-technology verification pass covers the final, post-fix state rather than a moving target that would need to be re-verified after each subsequent stage. |
| → SEO | See "Note on SEO's position" above — real build position is Stage 1, listed last only for module-list-order compliance. |

---

## Gap-Level Dependency Summary (cuts across modules)

```
GAP-001 (AUTH_SECRET) ─────────────┐
GAP-008 (seed guard)  ─────────────┤── independent of everything else, Stage 0
                                    │
GAP-002 (MUV→Muv casing) ──────────┤── independent text-only changes,
GAP-003 (moving→Muving)  ──────────┤   Stages 1/3/4 — could theoretically
GAP-005 (Coming→Muving Soon) ──────┤   all ship in one PR if preferred
                                    │
GAP-009 (footer social links) ─────┴── independent of the above, but same file as GAP-002/003
                                        (footer.tsx) — bundle for one review pass

GAP-004 (Cart) ──depends on──> GAP-004 (Checkout)   [same gap ID, two sides — see Cart→Checkout above]

GAP-006 (Admin inquiries UI) ──independent──  (no dependency on any other gap;
                                                only "soft" pattern-consistency
                                                reasoning ties it after CMS)

GAP-007 (webhook signature) ──independent──  (requires external provider docs,
                                               not other code changes)

GAP-014 (WhatsApp templates) ──independent──  (external, provider dashboard only)

GAP-019 (stale comments) ──resolved alongside── GAP-009 (footer.tsx) and GAP-006 (business-section.tsx)
                                                  — not a separate stage, a cleanup riding along
                                                  with the file it's already being touched in

GAP-020 (Cloudinary provenance) ──independent── (Founder decision point, no code dependency)

GAP-022 (admin badge wording) ──independent── (P3, cosmetic, admin-only)
```

**The single hard rule this graph produces:** GAP-004's Cart and Checkout halves must ship together.
Every other gap in this blueprint is independently shippable in any order, and the Stage 0–16
sequence above is a *recommended* ordering for review clarity and risk-ramping (low-risk copy fixes
first, highest-risk pricing logic in the middle once the team is oriented, verification passes last)
— not a set of hard blockers.

---

## Cross-Cutting / Infrastructure Items — No Position in This Graph

GAP-010, GAP-011, GAP-012, GAP-013, GAP-015, GAP-016, GAP-017, GAP-018, GAP-024 are deliberately
**excluded** from this dependency graph, per `PHASE_1B_IMPLEMENTATION_MASTER_PLAN.md`'s
Cross-Cutting section — each requires a Founder scope/tooling decision before any ordering question
is even meaningful. They do not block, and are not blocked by, any stage above.
