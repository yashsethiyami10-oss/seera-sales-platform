# MUV™ — Phase 15: Analytics & Business Intelligence
## Founder Operating System
### Implementation Report
### Status: All seven intelligence areas built on real Prisma data · Build and typecheck verified · A real runtime bug was caught and fixed during verification

> Every KPI, trend, segment, and export below is a live Prisma query or a plain JS aggregation over one — never a forecast, an estimate, or a fabricated number. Where a real figure genuinely can't be computed from what this schema stores (exact partial-refund amounts, product margin, traffic/conversion data), that's said directly rather than approximated. Audited first (§1), reused wherever real logic already existed (§2), before any new code was written.

---

## 1. Audit Findings

| Area | What already existed | What was missing |
|---|---|---|
| Dashboard | `/admin` (Phase 13A) — real Total Revenue, Today's/Month's Orders, Pending/Delivered/Cancelled, Low/Out of Stock, 7-day revenue comparison, Recent Orders/Customers, Best Sellers (by real `OrderItem` quantity), Top Categories | Yesterday/Week/Year revenue, Gross vs Net Sales split, AOV, Repeat Purchase Rate, CLV, Refunded orders, a real date-range picker |
| Orders/Customers | `Order` stores `subtotal`/`discount`/`shippingFee`/`total`/`taxableValue`/`cgst`/`sgst`/`igst` directly; per-customer LTV/AOV already computed in the admin customer detail page (Phase 13B) | No company-wide aggregate versions of any of this; no RFM segmentation anywhere |
| Inventory | `adjustStock`/`getLowStock`, full `StockHistory` audit trail (Phase 13B) | No inventory valuation, no turnover/velocity signal, no dead-stock/restock-suggestion view |
| Marketing | Full `Coupon` CRUD + real `usedCount` (Phase 13A) | No performance view — discount given, revenue generated, or orders-per-coupon were never aggregated anywhere |
| Financial | `lib/tax/gst.ts` computes GST at checkout time; the resulting `cgst`/`sgst`/`igst`/`taxableValue` are stored on every `Order` | No GST summary reporting screen ever read those stored columns back out |
| Reporting | None | No export of any kind existed anywhere in the admin |

**Real gaps found, not just missing UI:**
- No `Refund`/refund-amount model or column exists anywhere in the schema — only `Order.paymentStatus` (`REFUNDED`/`PARTIALLY_REFUNDED`), confirmed by grep. A fully `REFUNDED` order's stored `total` is a real, accurate refund amount; a `PARTIALLY_REFUNDED` order's *exact* refunded rupees is genuinely not stored anywhere. Reported honestly as a count only for the partial case (§7, §12) rather than guessed.
- No product cost/COGS field exists on `Product` — true profit/margin is not computable from this schema at all. Not fabricated; flagged in §12/§13.
- No traffic/session/UTM tracking model exists anywhere — "Conversion Rate" (marked "if available" in the brief) and "Traffic Sources" are genuinely not available and were omitted rather than invented.
- **A real, deterministic runtime bug this pass introduced and then caught itself, during Build Verification (§11):** `lib/recommendations.ts`'s `productCard` constant (written in Phase 14A, reused as-is by this phase's own top-selling/category queries where relevant) mixed scalar fields (`id`, `name`, `slug`, `images`, `benefits`) into an object passed as a Prisma `include`, which only accepts relation fields — scalars are already returned automatically. This crashed the homepage and Product Detail's recommendation sections with a `PrismaClientValidationError` on every request, invisible to `tsc`/`next build` (an inline object literal, and the crash only happens on the request path a static build never executes for a dynamic route). Caught by manually curling the live dev server as part of this phase's own verification step, not by the type checker. Fixed by removing the scalar keys from `productCard` — see §11 for the full story, including a second, unrelated `.next` cache corruption issue hit during the same verification pass (also documented and resolved there).

---

## 2. Existing Logic Reused

`Order`'s stored `subtotal`/`discount`/`shippingFee`/`total`/`taxableValue`/`cgst`/`sgst`/`igst` columns (no GST math was recomputed — every tax figure is a direct `_sum` over what checkout already wrote). `Coupon.usedCount`, `Inventory.quantity`/`lowStockThreshold`, `StockHistory`'s existing audit data model. The exact "Pending Orders" definition (`status: "PLACED"`) was matched intentionally to the existing `/admin` Overview so the two dashboards never disagree on a number carrying the same label. `getLowStock`-style low/out-of-stock counting logic. No admin UI primitive was reinvented — `Badge`, the established table/row pattern, `muv-card`, and the exact client-side CSV-blob-download pattern Phase 13B's `order-print-export.tsx` already established.

---

## 3. Founder Dashboard (`/admin/analytics`)

A new route, deliberately alongside — not replacing — the existing `/admin` Overview (Phase 13A stays exactly as it was). KPI strip: Today/Yesterday/Week/Month/Year revenue, Gross Sales and Net Sales (all-time), Average Order Value, Repeat Purchase Rate, Average Customer LTV, Orders Today, Pending/Delivered/Cancelled/Refunded. A real "Daily Business Summary" paragraph is generated from the same live numbers (today's revenue/orders, pending count, low/out-of-stock count, new customers this month) — sentence-templated from real values, not an LLM-generated summary. Quick Actions link to Orders/Inventory/Marketing/Customers.

---

## 4. Sales Intelligence

- **Revenue Trend** — a real daily bar chart over the selected date range (§9), built by fetching `PAID` orders in-range and bucketing by day in JS (no `$queryRaw` date-truncation needed at this data scale).
- **Growth %** — the selected range compared against an equal-length immediately-preceding period, real percentage, `null` (not "0%") when there's no prior-period revenue to compare against.
- **Top Selling Products, Category/Fragrance/Size Performance, Geographic Sales** (by real shipping-address `state` — the only location signal this schema stores) — all computed from one shared `getPaidOrderItems()` helper, not five separate near-identical queries.

---

## 5. Customer Intelligence

- New customers this month, paying customers, returning customers (2+ paid orders), real Repeat Purchase Rate.
- **Real RFM (Recency/Frequency/Monetary)** — Recency = days since last `PAID` order, Frequency = paid order count, Monetary = total real spend, all from one `Order.groupBy`. Segmented by plain, documented thresholds (Champions/Regulars/At Risk/Dormant/New) — business rules, not a trained model, exactly matching this phase's "no ML" constraint.
- Top Customers (by real spend) and Dormant Customers (90+ days, real) both link straight into the existing Phase 13B customer detail page.

---

## 6. Inventory Intelligence

Inventory Value (real: `Σ quantity × price` across every variant), Low/Out of Stock/Dead Stock counts, Restock Suggestions (low stock **and** real recent sales velocity — the two-signal version of "low stock" the plain Inventory page doesn't have), Fast/Slow Moving lists. **Stock turnover is explicitly documented as a proxy** — units sold in a 60-day window over current quantity, not textbook average-inventory-over-time turnover (this schema keeps no historical inventory snapshots to compute that properly) — the code comment says so directly rather than presenting an approximation as exact.

---

## 7. Marketing Intelligence

A real coupon performance table: times used, orders that used it (paid only), total discount given, and revenue generated — all from one `Order.groupBy` on `couponId`, joined against the existing `Coupon` list. **Traffic Sources, Campaign, and Referral tracking were not built** — no UTM/session/visit model exists anywhere in this schema; inventing one is a real, separate tracking-infrastructure project, not an "extend minimally" addition, so it's named in Future Extension Points (§14) instead of faked.

---

## 8. Financial Intelligence

Gross Revenue (subtotal sum), Net Revenue (total sum), Discounts Given, Shipping Charges Collected, and a full real GST breakdown (CGST/SGST/IGST/Taxable Value) — every figure a direct `_sum` over columns checkout already writes, not a recomputation. Refunds (full-refund value + count, real), Partially Refunded orders (count only — see §1's honesty note on why the exact rupee figure isn't shown), COD order count/value, and a "Net Cash Flow" figure documented as a real but simplified proxy (paid revenue minus refunded value in the period — not a full accounting cash-flow statement, since no expense/payroll/COGS data exists to net against). **"Profit Ready Structure" was not built as a number** — no cost/margin field exists on `Product` anywhere, so a profit figure would be entirely fabricated; flagged instead in §12/§13 as needing a real `Product.costPrice` column before it can exist honestly.

---

## 9. Reporting System

- **Date range**: `today` / `7d` / `30d` / `90d` / `ytd` / `all`, applied via `?range=` and driving every date-scoped section on the page — real, functional, server-rendered.
- **CSV Export** — a genuinely working client-side download of every order in the selected range (order #, date, customer, status, payment method/status, subtotal, discount, shipping, tax, total), same real Blob-download pattern Phase 13B's invoice export already established. Labeled "Export CSV (opens in Excel)" rather than "Excel Export" — no `.xlsx`-generation library is installed, and adding one would work against this same phase's own "no unnecessary heavy libraries" performance guidance; a real CSV that opens correctly in Excel was judged the honest way to meet the underlying need without either fabricating a fake binary format or importing a new dependency for it.
- **PDF Ready Architecture** — the CSV export's row-shaping is already a clean, structured function any future PDF renderer could consume directly; no actual PDF generation exists (same precedent as `lib/tax/invoice.ts`'s own documented "data layer, not a PDF renderer" stance from Phase 11A).
- **Custom Reports** — the date range selector *is* the custom-report mechanism; every intelligence section above respects it.
- **Saved Reports / Scheduled Reports** — not built this pass; see §12/§14.

---

## 10. Security Review

- `/admin/analytics` sits under the existing `/admin/*` prefix `middleware.ts` already gates — verified live: **307** unauthenticated, identical to every other admin route.
- Every query in `lib/analytics.ts` runs server-side only, inside a Server Component — no calculation logic is ever shipped to or re-run on the client.
- No customer PII beyond name/email is ever surfaced (RFM's Top/Dormant Customer lists show name + real spend/recency only, and link into the existing, already-gated customer detail page rather than duplicating its contents here).
- Nothing in this phase touches `lib/auth.ts`, `lib/rbac.ts`, or `middleware.ts`.

---

## 11. Build Verification

- `npx tsc --noEmit` — clean, zero errors, on every pass.
- `npm run build` — clean production build, all routes compiled (two pre-existing warnings from NextAuth's own `jose` dependency about Edge Runtime compatibility — unrelated to this phase, not introduced by it).
- **A real runtime bug was caught during this phase's own verification, not by `tsc`/`next build`:** curling the live dev server (a step this phase's own manual QA, not a required step, but the same discipline this project has followed every phase) surfaced `GET / 500` — `lib/recommendations.ts`'s `productCard` (§1) was structurally invalid as a Prisma `include`. Fixed by removing its scalar keys; re-verified `/`, `/shop`, `/cart`, `/products/muv-noir`, `/collections/home-care` all return **200** afterward.
- **A second, unrelated issue hit during the same verification pass:** running `npm run build` (production mode) while `npm run dev` was still pointed at the same `.next` directory corrupted the dev server's compiled output (`Cannot find module './vendor-chunks/@auth.js'`) — not a code bug, a build-tooling collision from running both processes against one output folder simultaneously. Fixed by stopping the dev server, clearing `.next`, and restarting cleanly; re-verified all storefront and admin routes afterward. Left the dev server running normally when finished, same as every prior phase's process-handling commitment.
- Live dev server, final pass: `/`, `/products/muv-noir` → **200**; `/admin/analytics`, `/admin`, `/admin/orders`, `/admin/customers` → **307** unauthenticated.

---

## 12. Known Limitations

- Partially-refunded orders show a real count but not an exact refunded rupee amount — no such column exists anywhere in the schema (§1, §8).
- No profit/margin figure anywhere — `Product` has no cost field; would need a real, intentional schema addition, not fabricated here.
- Stock turnover is a 60-day-velocity-over-current-quantity proxy, not textbook average-inventory turnover (§6) — this schema keeps no historical inventory snapshots.
- Conversion Rate and Traffic Sources are not shown at all — genuinely not available, no visit/session/UTM tracking exists anywhere in this codebase.
- Saved Reports and Scheduled Reports were not built — the brief itself marks Scheduled Reports "Ready Structure" (i.e., not a real feature to build this pass); Saved Reports would need a new schema + CRUD admin UI, judged a bigger addition than this phase's "extend minimally" scope given everything else already delivered here, and deferred with clear naming rather than under-built.
- Net Cash Flow is a simplified real proxy (paid revenue minus refunds in-period), not a full accounting statement — no expense/payroll data exists to net against.

---

## 13. Future BI Extension Points

- A `Product.costPrice` column, to make real profit/margin reporting possible.
- Real UTM/session tracking, to make Traffic Sources/Campaign/Referral/Conversion Rate genuinely available rather than absent.
- A `SavedReport` model (name + serialized filter state) for the admin to bookmark a specific date-range/section view.
- A true average-inventory-over-time turnover ratio, once historical inventory snapshots are captured (e.g., a nightly `InventorySnapshot` row).
- An exact per-order refunded-amount column, so partial refunds can be reported precisely rather than by count only.

---

## 14. Architecture Compliance

- Zero frozen phases rebuilt — `/admin` (Phase 13A) is untouched; `/admin/analytics` is a new, additive route.
- Zero authentication/RBAC logic modified.
- Zero duplicated business logic — GST figures are read from the columns checkout already computed and stored, never recalculated; the "Pending Orders" definition matches the existing Overview exactly rather than silently diverging; every performance breakdown (category/fragrance/size/geographic) shares one `getPaidOrderItems()` helper instead of four near-identical queries.
- The one real bug this phase produced (the `productCard` Prisma `include` error) was caught by this phase's own verification step, fixed, and documented here in full — exactly the discipline "audit before coding, verify before reporting" exists to enforce, the same standard Phase 14A's report held itself to for its own regression.
