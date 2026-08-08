# Phase 1B — File Modification Matrix

Every file identified for change across the blueprint, in one place, cross-referenced by module,
gap, and stage — so a PR can be scoped by file overlap rather than by re-deriving it from 25 separate
module sections. Files marked **(new)** don't exist yet. Everything else is an existing file getting
a targeted, described change — no file gets a full rewrite.

## Files Requiring Changes

| File | Module(s) | Gap(s) | Stage | Change Type | Change Description |
|---|---|---|---|---|---|
| `.env` (deployment config, not source-controlled) | Customer Account (cross-ref) | GAP-001 | 0 | Config | Real `AUTH_SECRET` per environment |
| `prisma/seed.ts` | Customer Account (cross-ref) | GAP-008 | 0 | Logic (small) | Guard against seeding a non-development `DATABASE_URL` |
| `components/storefront/brand-story.tsx` | Homepage | GAP-002 | 1 | Text | "MUV" → "Muv" in prose |
| `components/storefront/social-proof.tsx` | Homepage | GAP-002 | 1 | Text | "MUV" → "Muv" in prose |
| `lib/seo.ts` | SEO | GAP-002 | 1 | Text | `DEFAULT_DESCRIPTION`: "MUV" → "Muv" |
| `app/layout.tsx` | SEO | GAP-002 | 1 | Text | `<title>`: "MUV" → "Muv" |
| `components/storefront/nav.tsx` | Navigation | GAP-002 | 3 | Text | "Explore MUV" → "Explore Muv" |
| `components/storefront/footer.tsx` | Footer | GAP-002, GAP-003, GAP-009, GAP-019 | 4 | Text + Logic | Casing/spelling fixes; `SOCIAL_LINKS` replaced with a `StoreSettings`-driven read; stale comment corrected |
| `app/(storefront)/collections/[category]/page.tsx` | Category Pages | GAP-005 | 5 | Text | "Coming Soon" → "Muving Soon™" |
| `app/(storefront)/cart/page.tsx` | Cart | GAP-004 | 7 | Logic | Shipping estimate reads the same shared source Stage 8 introduces |
| `actions/orders.ts` | Checkout | GAP-004 | 8 | Logic (business rule) | `createOrder` reads `shippingFee`/`freeShippingThreshold`/`codEnabled`/`codFee` from `StoreSettings` instead of hardcoded `999`/`49` |
| `components/checkout/**` (specific file TBD at implementation time — payment-method selector) | Checkout | GAP-004 | 8 | Logic (conditional) | COD option genuinely hidden/disabled when `codEnabled=false`, not just visually |
| `app/api/webhooks/shipping/[provider]/route.ts` | Orders | GAP-007 | 10 | Logic (conditional, provider-scoped) | Only if the confirmed scheme differs from current — may conclude "no change" |
| `app/admin/inquiries/page.tsx` **(new)** | Admin | GAP-006 | 12 | New file | List/detail page for `BusinessInquiry` |
| `components/admin/inquiries-table-client.tsx` **(new)** | Admin | GAP-006 | 12 | New file | Client component, matching the existing admin-table pattern |
| `actions/inquiries.ts` | Admin | GAP-006 | 12 | Logic (additive) | Add `listBusinessInquiries`/`updateInquiryStatus`, each independently calling `requireStaff()` |
| Admin nav/sidebar component (exact file TBD — wherever `/admin/customers` etc. are listed) | Admin | GAP-006 | 12 | Logic (additive) | Add the new `/admin/inquiries` entry |
| `components/storefront/business-section.tsx` | Admin (comment cross-ref) | GAP-019 | 12 | Text (comment only) | Correct the stale "no backend exists" comment |
| `components/admin/categories-table-client.tsx` | Category Management | GAP-022 | 13 | Text | "Coming Soon" → "Muving Soon™" (admin badge, optional/P3) |
| `.env` (deployment config) | Media | GAP-020 | 14 | Config (conditional) | Rotate Cloudinary credentials only if Founder confirms it's needed |

**21 file-level changes across 20 distinct files** (`.env` appears twice, for two independent
reasons). Two are brand-new files; every other entry is a targeted, described change to an existing
file — no file in this matrix is being rewritten wholesale.

## Files Explicitly NOT Modified (verification-only modules)

Listed so a reviewer can confirm nothing was missed, not because any of these need work:

| Module | Files inspected, confirmed no change needed |
|---|---|
| Header | `components/storefront/nav.tsx` (logo/announcement portion only — text portion is Stage 3) |
| Shop | `app/(storefront)/shop/page.tsx`, `components/storefront/product-grid.tsx` |
| Product Detail | `app/(storefront)/products/[slug]/page.tsx`, `components/storefront/product-specs.tsx` (one "MUV" match confirmed to be a code comment, not rendered text) |
| Search | `lib/utils/fuzzy-search.ts`, `actions/search.ts` |
| Wishlist | `actions/wishlist.ts` |
| CMS | `app/admin/cms/**`, `actions/cms.ts` |
| Product Management | `app/admin/products/**`, `actions/products.ts` |
| Inventory | `app/admin/inventory/**`, `actions/inventory.ts` |
| Coupons | `app/admin/marketing/page.tsx`, `actions/coupons.ts` |
| Analytics | `app/admin/analytics/**`, `lib/analytics.ts` |
| Notifications (code) | `lib/notify/**` (already correctly gated — the gap is external template approval, not code) |

## File Overlap Notes (why the stage order matters)

- **`components/storefront/footer.tsx`** carries four independent gaps (GAP-002/003/009/019) — all
  four should land in one PR/commit for this file, not split across stages, to avoid four separate
  review passes over the same component. Scheduled as a single Stage 4 unit.
- **`actions/orders.ts`** (Stage 8) is the highest-risk file in this matrix — it's also the file
  Phase 0's own audit flagged for the "every exported Server Action must independently enforce RBAC"
  rule, and the file most other order-related code depends on (`app/(storefront)/cart/page.tsx`,
  `app/(storefront)/checkout/page.tsx`, admin order views). Any change here should be its own
  isolated PR, not bundled with unrelated Stage 8 UI work.
- **`app/(storefront)/cart/page.tsx`** (Stage 7) must not be changed before `actions/orders.ts`
  (Stage 8) establishes the shared shipping-fee source — see `PHASE_1B_DEPENDENCY_GRAPH.md`.
- **`.env`** appears for two unrelated reasons (GAP-001's secret rotation, GAP-020's credential
  provenance question) — these are independent decisions and should not be conflated into one change
  or one conversation with the Founder.
