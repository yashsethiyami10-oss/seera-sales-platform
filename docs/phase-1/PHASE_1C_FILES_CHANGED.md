# Phase 1C — Files Changed

46 files touched (2 new, 44 modified). Grouped by what kind of change each one represents, not
alphabetically, so the risk profile of the whole batch is visible at a glance. Full pre-edit
snapshots of the 18 files identified before implementation began are preserved in
`docs/phase-1/PHASE_1C_BACKUPS/` (as `.bak` files — renamed from their original extension partway
through so TypeScript's compiler would stop treating them as live source files; see
`PHASE_1C_DECISION_LOG.md`).

## New files (2)

| File | Purpose |
|---|---|
| `app/admin/inquiries/page.tsx` | GAP-006 — Server Component list/filter page for `BusinessInquiry` |
| `components/admin/inquiries-table-client.tsx` | GAP-006 — Client Component: status change, message expand |

## Business-logic changes (4) — highest scrutiny warranted

| File | Change |
|---|---|
| `actions/orders.ts` | GAP-004 — `createOrder` now reads `shippingFee`/`freeShippingThreshold`/`codEnabled`/`codFee` from `StoreSettings` instead of hardcoded `999`/`49`; rejects COD orders server-side when `codEnabled` is false |
| `actions/inquiries.ts` | GAP-006 — added `updateInquiryStatus` (calls `requireStaff()` independently, per this codebase's own RBAC rule) |
| `lib/validations/inquiry.ts` | GAP-006 — added `updateInquiryStatusSchema` |
| `prisma/seed.ts` | GAP-008 — added `assertSafeToSeed()` guard; refuses to run against a non-`localhost` `DATABASE_URL` unless `ALLOW_SEED=true` |

## UI wiring changes (5) — StoreSettings props threaded through

| File | Change |
|---|---|
| `components/cart/cart-client.tsx` | GAP-004 — accepts `shippingFee`/`freeShippingThreshold` as props instead of hardcoded constants; Delivery Estimate card's Standard row now shows the real computed price |
| `app/(storefront)/cart/page.tsx` | GAP-004 — fetches `StoreSettings`, passes shipping props to `CartClient` |
| `components/checkout/checkout-client.tsx` | GAP-004 — accepts `shippingFee`/`freeShippingThreshold`/`codEnabled`/`codFee` as props; Standard Delivery price computed live; COD option filtered out when disabled; COD surcharge added to displayed total; Razorpay modal's merchant `name` corrected to "Muv" |
| `app/(storefront)/checkout/page.tsx` | GAP-004 — fetches `StoreSettings`, passes shipping/COD props to `CheckoutClient` (both guest and logged-in branches) |
| `app/admin/layout.tsx` | GAP-006 — added "Inquiries" nav entry pointing to `/admin/inquiries` |

## Brand-text changes (34) — "MUV" → "Muv" and/or spelling/wording fixes, no logic touched

Original Phase 1A/1B scope named 7 files for this fix; direct verification during implementation
found the actual footprint was much larger. Every file below received a text-only change (string
literal or JSX text node), confirmed via `tsc --noEmit` and `next build` after every batch:

`components/storefront/brand-story.tsx` · `components/storefront/social-proof.tsx` · `lib/seo.ts` ·
`app/layout.tsx` · `components/storefront/nav.tsx` · `components/storefront/footer.tsx` ·
`components/storefront/business-section.tsx` · `app/(storefront)/collections/[category]/page.tsx` ·
`components/storefront/why-choose-muv.tsx` · `app/(storefront)/page.tsx` · `app/error.tsx` ·
`app/not-found.tsx` · `app/(storefront)/about/page.tsx` · `app/(storefront)/terms/page.tsx` ·
`app/(storefront)/contact/page.tsx` · `app/(storefront)/faq/page.tsx` · `app/(storefront)/shop/page.tsx` ·
`app/(storefront)/privacy/page.tsx` · `app/(storefront)/journal/[slug]/page.tsx` ·
`app/api/blog/[slug]/route.ts` · `app/api/blog/route.ts` · `app/account/layout.tsx` ·
`app/(storefront)/shipping/page.tsx` · `app/(storefront)/returns/page.tsx` ·
`app/(storefront)/checkout/success/page.tsx` · `app/admin/settings/page.tsx` ·
`components/account/future-features.tsx` · `components/order-success/muv-community.tsx` ·
`components/order-success/share-experience.tsx` · `components/auth/login-form.tsx` ·
`lib/notify/templates.ts` · `lib/notify/providers/email.ts` · `lib/notify/send-messaging.ts` ·
`lib/tax/invoice.ts`

(34 distinct files. `footer.tsx` also received the GAP-009/GAP-003 changes listed in the UI-wiring
and this same section respectively — counted once here, not duplicated across sections.)

## Cosmetic / P3 (1)

| File | Change |
|---|---|
| `components/admin/categories-table-client.tsx` | GAP-022 — admin status badge "Coming Soon" → "Muving Soon™" |

## Non-source artifacts created this phase (not counted above)

- `docs/phase-1/PHASE_1C_BACKUPS/**/*.bak` — 18 pre-edit file snapshots
- `docs/phase-1/dev-server-1c.log`, `docs/phase-1/dev-server-1c-restart.log` — dev server logs from live route verification (see `PHASE_1C_TEST_REPORT.md`)

## Deliberately NOT modified

- `.env` — no secret or credential was changed, per this phase's explicit core rule
- `prisma/schema.prisma` — no schema change; every fix used fields that already existed
- Any `Product`/`ProductVariant` row's `name`/`brand`/`sku` data, or any other live database data —
  see `PHASE_1C_DECISION_LOG.md` for the reasoning (product labels, SKUs, and brand-field data are
  out of scope by the task's own "do not alter approved product labels" rule and general data-preservation caution)
- `StoreSettings.businessName`'s actual stored value (if it's still `"MUV"` from the schema's own
  `@default`) — only the code-level fallback default was corrected; the live data value was left
  alone, consistent with not mutating existing admin data
