# Wiring the Frontend to This Backend

Every `.jsx` file delivered earlier in this project renders from a hardcoded
mock array so it could be previewed standalone. This document says exactly
which array gets replaced by which real call, file by file. None of this
rewiring has actually been done — the frontend files are still on mock data
today. This is the map for doing it, not a claim that it's done.

A general note before the specifics: every frontend file was delivered as
`.jsx` for in-chat preview. Wiring to Server Actions/Server Components means
converting to `.tsx` inside a real Next.js 15 project (the components
themselves barely change — mostly replacing `useState(MOCK_ARRAY)` with data
passed down from a Server Component parent, and swapping local mutation
handlers for `await someServerAction(...)` calls).

## Storefront

**`muv-homepage.jsx`**
- `CATEGORIES` array → `GET /api/categories`
- `PRODUCTS` (best sellers section) → `GET /api/homepage` → `data.bestSellers`
- Hero copy / promo content → `GET /api/homepage` → `data.heroBanners` / `data.promoBanners`
- Reviews section → not yet backed by a real endpoint; add
  `GET /api/products/[slug]` reviews array once the homepage links to a
  specific product, or a new `/api/reviews/featured` route if you want
  sitewide (not per-product) testimonials.

**`muv-catalog.jsx`**
- `CATEGORIES`, `PRODUCTS` arrays → `GET /api/products?category=<slug>&search=&sort=&page=`
  (matches `productQuerySchema` exactly — the toolbar's search/filter/sort
  state becomes query params on this same request)
- `wishlist` (Set of ids) → needs new customer-facing endpoints, not yet
  built: add `app/actions/wishlist.ts` with `addToWishlist`/`removeFromWishlist`/
  `getWishlist`, following the exact pattern in `app/actions/customers.ts`

**`muv-product-detail.jsx`**
- `PRODUCTS_DEMO` object → `GET /api/products/[slug]`
- `RELATED_DEMO` → a new query, not yet built: `prisma.product.findMany({ where: { categoryId, id: { not: currentId } }, take: 4 })`
- `RECENTLY_VIEWED_DEMO` → genuinely not implementable from mock data alone;
  needs either a `RecentlyViewed` table keyed by customerId+productId, or
  client-side localStorage (acceptable here since it's just a UX nicety, not
  business data)
- `REVIEWS_DEMO` → already included in `GET /api/products/[slug]` response
- Add to Cart / Wishlist buttons → new `app/actions/cart.ts` (see Cart section
  below) and the wishlist actions mentioned above

**`muv-cart.jsx`**
- `INITIAL_CART`, `INITIAL_SAVED` → there's no `Cart`/`CartItem` model in the
  schema yet, because cart state is normally either (a) client-side only
  until checkout, which is what the checkout Server Action
  (`createOrder` in `app/actions/orders.ts`) already assumes — it takes
  `items: [{variantId, quantity}]` directly from client state — or (b) a
  persisted `Cart` table if you want server-side cart recovery across
  devices. Given `createOrder` already works from client-held cart state,
  **the pragmatic move is not adding a Cart table at all** — keep cart in
  client state (React context or a small Zustand store) and only touch the
  backend at checkout. Add the table later only if cross-device cart
  recovery becomes a real product requirement.
- `COUPONS` object → `validateCoupon` Server Action (`app/actions/coupons.ts`)
- Order summary GST math → already matches `createOrder`'s calculation
  exactly (subtotal/discount/shipping) — no changes needed there.

**`muv-checkout.jsx`**
- `CART_ITEMS`, `SAVED_ADDRESSES` → addresses via a new read (`prisma.address.findMany({ where: { customerId } })` in a Server Component), cart items passed through from the cart page's client state
- Placing the order → `createOrder` Server Action (`app/actions/orders.ts`) —
  its input shape (`addressId`, `paymentMethod`, `couponCode`, `items`) was
  designed to match this checkout flow's state directly
- Razorpay panel → needs the real Razorpay checkout.js script + a webhook
  handler at `app/api/webhooks/razorpay/route.ts` (not built — see the note
  in `app/actions/orders.ts` on why webhook-verified payment status is the
  only safe source of truth)

## Account

**`muv-account.jsx`**
- `ORDERS` → `prisma.order.findMany({ where: { customerId }, include: { items: true } })` in the Orders section's Server Component
- Order detail / tracking / cancel / return → `cancelOrder` Server Action
  already built; a "request return" action isn't built yet — follow the
  `cancelOrder` pattern in `app/actions/orders.ts`, transitioning to
  `RETURN_REQUESTED` instead of `CANCELLED`
- `WISHLIST`, `RECENTLY_VIEWED` → wishlist actions (see above); recently-viewed
  has the same caveat as the product detail page
- `ADDRESSES`, `CARDS` → `addAddress`/`updateAddress`/`deleteAddress`
  (`app/actions/customers.ts`) — already built. Payment methods (`CARDS`)
  have no backing model: Razorpay/Stripe-style tokenized cards are stored
  *by the payment gateway*, not this database — this app would only ever
  store a gateway's card token reference, never raw card details
- `NOTIFICATIONS` → not built; would need a new `Notification` model plus a
  way to generate them (order status changes, promotions) — reasonable next
  addition, not attempted here since it wasn't in this turn's model list

**`muv-auth.jsx`**
- Login form → NextAuth's `signIn("credentials", {...})`
- Signup form → `signup` Server Action (`app/actions/auth.ts`)
- OTP screens → cosmetic placeholder only; real OTP needs an SMS provider
  (Twilio/MSG91) and a short-lived code table or Redis entry, neither of
  which exists here

## Admin Dashboard

**`muv-admin-core.jsx`**
- `PRODUCTS` (Overview + Products section) → `prisma.product.findMany(...)`
  server-side, and `createProduct`/`updateProduct`/`deleteProduct`
  (`app/actions/products.ts`) for the modals
- `RECENT_ORDERS`, `LOW_STOCK` → `prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5 })`
  and the `$queryRaw` low-stock query in `app/actions/inventory.ts`
  (`getLowStock`)
- `REVENUE_TREND` chart data → needs a new aggregate query, not built:
  `prisma.order.groupBy({ by: ['month'], _sum: { total: true } })`-style
  query, or a materialized view if this gets slow at scale
- Order detail modal (status update / refund / cancel) → `updateOrderStatus`,
  `refundOrder`, `cancelOrder` (`app/actions/orders.ts`) — built and match
  this modal's actions exactly

**`muv-admin-extended.jsx`**
- `CUSTOMERS` → `prisma.customer.findMany({ include: { orders: true, addresses: true, wishlist: true, notes: true } })`;
  the note-adding UI → `addCustomerNote` (`app/actions/customers.ts`)
- `COUPONS` → `createCoupon`/`updateCoupon`/`deleteCoupon` (`app/actions/coupons.ts`)
- Featured Products toggle grid → `setFeaturedProduct` (`app/actions/cms.ts`)
- Homepage Banners list (in Marketing) → superseded by the CMS files' banner
  manager, see below
- Settings tabs → Website tab fields (logo/favicon/social/footer/legal) have
  no backing model yet; add a single-row `SiteSettings` table following the
  same singleton pattern as `AnnouncementBar`/`NewsletterContent` in the
  schema. Shipping/Tax/Payment Gateway tabs are genuinely operational
  config, not data an admin should freely edit via a naive settings-table
  UPDATE in production — treat those as environment variables or a
  more tightly-controlled config source instead.

## CMS

**`muv-cms-homepage.jsx`**
- `INITIAL_HERO_SLIDES`, `INITIAL_PROMO_BANNERS` → `createBanner`/`updateBanner`/
  `deleteBanner`/`reorderBanners` (`app/actions/cms.ts`), filtered by `type`
- `INITIAL_SECTIONS` → `updateSections` (`app/actions/cms.ts`)
- `INITIAL_BEST_SELLERS` → `setBestSellers` (`app/actions/cms.ts`)
- `INITIAL_CATEGORIES` → `createCategory`/`updateCategory`/`deleteCategory`
  (`app/actions/cms.ts`)
- Announcement bar / Newsletter content forms → `updateAnnouncementBar`/
  `updateNewsletterContent` (`app/actions/cms.ts`)

**`muv-cms-content.jsx`**
- `PRODUCTS` (content editor) → `updateProduct` (`app/actions/products.ts`)
  already covers these fields (`ingredients`, `directions`, `benefits`,
  `fragranceNotes`) — the SEO tab's `metaTitle`/`metaDescription` fields
  aren't in the `Product` schema yet; add them as two nullable `String?`
  columns on `Product` in a follow-up migration
- `INITIAL_ARTICLES` → `createBlogPost`/`updateBlogPost`/`deleteBlogPost`
  (`app/actions/blog.ts`)
- `MEDIA_ITEMS` → `listMedia`/`confirmUpload`/`deleteMediaAsset`
  (`app/actions/media.ts` + `lib/media.ts` for the upload URL step)
- SEO section (global defaults, OG/Twitter, structured data, sitemap) → no
  backing model — same `SiteSettings`-style singleton table suggested above
  would hold these; sitemap regeneration is a build-time/cron concern, not
  something a Server Action should compute on demand from request context
