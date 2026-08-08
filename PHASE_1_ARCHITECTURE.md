# MUV™ — Phase 1: Project Foundation & Architecture
### Version 1.0 · Target Architecture · Status: DRAFT — awaiting approval

> **Scope note.** This document specs the **target** architecture per the brief: Shadcn UI, Framer Motion, React Hook Form, and the `services/` / `hooks/` / `data/` / `config/` folder layout. The storefront already has four approved, shipped homepage sections (Hero, Shop by Category, Featured Products, Why Choose MUV) built on plain CSS transitions, native form state, and a `components/{admin,storefront,account,ui}` + `actions/` + `lib/` layout. Section 0 below reconciles the two — what carries forward unchanged, what's net-new, and what migrates later — so this document is usable as a real migration plan, not a fiction disconnected from what's deployed. No code changes ship in this phase.

---

## 0. Reconciliation with the Shipped App

| Already built (keep as-is) | Net-new in this phase (adopt going forward) | Migrates later (not now) |
|---|---|---|
| Brand tokens: ink/graphite dark theme, lavender `#B7ABF0` single accent, Fraunces + Inter via `next/font` | Shadcn UI primitives in `components/ui` | Existing custom `Modal`, `ToastProvider`, `Button` → Shadcn `Dialog`/`Sonner`/`Button` |
| Prisma schema, Postgres, NextAuth, Cloudinary upload pipeline | React Hook Form + `@hookform/resolvers/zod` for all forms | `ProductFormModal` and auth forms (currently hand-rolled `useState`) |
| Server Actions in `actions/` as the mutation entrypoint | `services/` layer as the business-logic seam under `actions/` and Server Components | Query logic currently inline in `actions/*.ts` and page-level `prisma.*` calls |
| `lib/validations/*` Zod schemas (source of truth for input shape) | `hooks/`, `types/`, `data/`, `config/` as first-class top-level folders | — |
| Cloudinary transform helper (`lib/utils/cloudinary-image.ts`), `IMAGE_PRESETS` | Framer Motion, scoped to orchestrated/gesture interactions only | Existing CSS-only reveals/hovers stay CSS; not retrofitted with Framer Motion for its own sake |
| CMS-driven homepage sections pattern (`HomepageSection`, `Banner`, `NewsletterContent`) | Formal design-token layer (`styles/tokens.css` + Tailwind theme extension reading the same values) | — |

Everything below is written as the standing specification for all work from this point forward, including future phases of the pages already shipped.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router | Already in use; Server Components + streaming are the performance baseline |
| Language | TypeScript, `strict: true` | Non-negotiable at 500+ product / multi-surface (storefront + admin) scale |
| Styling | Tailwind CSS | Already in use; utility-first keeps the design-token layer enforceable |
| Component primitives | Shadcn UI (Radix underneath) | Accessible (focus trap, keyboard nav, ARIA) out of the box — the single biggest gap in today's hand-rolled `Modal`/`Toast` |
| Motion | Framer Motion | Reserved for orchestration/gesture work CSS can't do cleanly (shared-layout transitions, drag-to-dismiss, staggered sequences). Default remains CSS transitions — see §8 |
| Forms | React Hook Form + Zod (`@hookform/resolvers/zod`) | Reuses the *same* Zod schemas already living in `lib/validations/*`, now also driving client-side field state/errors instead of duplicating validation logic in component state |
| Icons | Lucide | Already in use, already the icon language across every shipped section |
| Images | `next/image` | Already in use, paired with Cloudinary transform presets |
| Rendering | Server Components by default | Already the practiced pattern (`page.tsx` server, `FeaturedProducts` client at the interaction boundary) |
| Hosting | Vercel | Edge network, native Next.js image optimization, ISR |

---

## 2. Folder Architecture

```
muv-platform/
├── app/                              # Routes only — no business logic lives here
│   ├── (storefront)/
│   │   ├── layout.tsx                # Nav + Footer shell
│   │   ├── page.tsx                  # Homepage — composes components/home/*
│   │   ├── shop/
│   │   ├── collections/[category]/
│   │   ├── products/[slug]/
│   │   ├── cart/
│   │   ├── checkout/
│   │   └── journal/[slug]/           # Blog / editorial CMS content
│   ├── (auth)/                       # login, signup — route group, no shared chrome
│   ├── account/                      # Authenticated customer area
│   ├── admin/                        # Staff/admin panel
│   ├── api/                          # Route Handlers: webhooks, NextAuth, future AI endpoints
│   ├── layout.tsx                    # Root HTML shell, font loading, providers
│   └── globals.css                   # Tailwind directives only — tokens live in styles/
│
├── components/
│   ├── ui/                           # Shadcn primitives (button, input, dialog, sheet, command, accordion…) — generated, unopinionated, themed via CSS variables only
│   ├── layout/                       # Nav, MegaMenu, MobileDrawer, Footer, AnnouncementBar
│   ├── home/                         # Hero, CategoryGrid, FeaturedProducts, WhyChooseMuv, Testimonials, NewsletterSection
│   ├── product/                      # ProductCard, ProductGallery, ProductGrid, VariantSelector, QuickView, Price, Rating
│   ├── cart/                         # CartDrawer, CartLineItem, CartSummary, CouponForm
│   ├── account/                      # OrderHistory, AddressBook, WishlistGrid, ProfileForm
│   ├── admin/                        # DataTable, ProductForm, MediaUploader, OrdersTable, AnalyticsWidgets
│   ├── cms/                          # SectionRenderer + editable-block components — see §11
│   └── shared/                       # Breadcrumbs, SEO/JsonLd, ErrorBoundary, EmptyState, Skeletons
│
├── lib/
│   ├── auth/                         # NextAuth config, session helpers, RBAC (requireStaff/requireAdmin)
│   ├── db/                           # Prisma client singleton
│   ├── validations/                  # Zod schemas — shared by RHF (client) and Server Actions (server)
│   ├── utils/                        # Pure functions: formatting, discount math, stock-status, cloudinary transforms
│   └── constants/                    # Enums, size lists, route maps
│
├── actions/                          # Server Actions — THIN: auth check → parse with Zod → call services/ → revalidate. No query/business logic inline (see §12 Project Rules)
│
├── services/                         # Business logic / data access, framework-agnostic. Callable from Server Components (reads) AND actions/ (writes) — the layer that makes 500+ products maintainable, because query logic lives once
│   ├── product-service.ts
│   ├── category-service.ts
│   ├── cart-service.ts
│   ├── order-service.ts
│   ├── search-service.ts             # AI-ready seam — see §10
│   └── recommendation-service.ts     # AI-ready seam — see §10
│
├── hooks/                            # Client hooks: useCart, useWishlist, useMediaQuery, useDebounce, useInfiniteScroll
│
├── types/                            # Shared TS types decoupled from generated Prisma types at the client boundary (Product, Category, Order, CartItem)
│
├── styles/
│   ├── globals.css                   # imports tokens.css, Tailwind base/components/utilities
│   └── tokens.css                    # single source of truth for every CSS custom property in §4–5
│
├── data/                             # Static/reference, non-DB data: nav taxonomy fallback, country/state lists, size charts
│
├── config/
│   ├── site.config.ts                # brand name, tagline, nav structure, feature flags
│   └── seo.config.ts                 # default metadata, OG defaults
│
├── public/                           # Static assets, favicons, self-hosted fonts if ever needed
├── prisma/                           # schema.prisma, migrations, seed.ts
└── middleware.ts                     # Route protection today; locale detection when i18n lands
```

**Why `services/` is separate from `actions/`:** `actions/` is a Next.js-specific transport (the client can call it directly, args cross the network boundary). `services/` is plain TypeScript with no framework coupling — Server Components call it directly for reads, `actions/` calls it for writes. Splitting these means the *same* `getProductBySlug()` isn't reimplemented once for the product page and again for a future API route or AI tool.

---

## 3. Design System — Tokens

All tokens are CSS custom properties in `styles/tokens.css`, re-exported into `tailwind.config.ts` under `theme.extend` so Tailwind utilities (`text-display-lg`, `rounded-card`, `shadow-elevation-2`) and raw CSS both read the same values. No component ever hardcodes a px/hex value.

### 3.1 Spacing (4px base unit)

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | icon-to-label gaps |
| `--space-2` | 8px | tight inline groups |
| `--space-3` | 12px | form field internal padding |
| `--space-4` | 16px | default gap |
| `--space-5` | 20px | card internal padding, compact |
| `--space-6` | 24px | grid gutter (mobile) |
| `--space-7` | 32px | grid gutter (desktop), card padding |
| `--space-8` | 40px | subsection spacing |
| `--space-10` | 64px | section header-to-content gap |
| `--space-12` | 96px | section vertical padding, desktop |
| `--space-16` | 160px | rare — hero-scale spacing only |

### 3.2 Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 8px | inputs, small badges |
| `--radius-md` | 12px | secondary buttons, compact cards |
| `--radius-lg` | 20px | standard cards |
| `--radius-xl` | 24px | feature/product/category tiles |
| `--radius-full` | 999px | pills, primary buttons, icon circles, avatars |

### 3.3 Elevation (shadow scale)

| Token | Value | Usage |
|---|---|---|
| `--elevation-0` | none | flat/inline elements |
| `--elevation-1` | `0 2px 10px rgba(0,0,0,.16)` | resting card |
| `--elevation-2` | `0 16px 36px rgba(0,0,0,.28)` | hovered card, raised state |
| `--elevation-3` | `0 28px 70px rgba(0,0,0,.4)` | modal, popover, floating nav |
| `--elevation-glow` | `0 0 0 1px rgba(var(--lavender-rgb),.28), 0 14px 34px rgba(var(--lavender-rgb),.3)` | primary CTA hover — brand-specific, not a neutral elevation step |

### 3.4 Border

| Token | Value | Usage |
|---|---|---|
| `--border-hairline` | `1px solid rgba(255,255,255,.07)` (dark) / `rgba(11,11,15,.08)` (light) | default resting border, every card/input |
| `--border-hairline-hover` | `1px solid rgba(var(--lavender-rgb),.35)` | hover/active card border |
| `--border-focus` | `2px solid rgba(var(--lavender-rgb),.6)`, 2px offset | keyboard focus ring — **required on every interactive element**, distinct from hover |

### 3.5 Animation

| Token | Value | Usage |
|---|---|---|
| `--ease-default` | `cubic-bezier(0.16,1,0.3,1)` | the one easing curve for 95% of motion — a soft "out," never elastic/bounce |
| `--ease-in-out` | `cubic-bezier(0.4,0,0.2,1)` | symmetric transitions (tab switches, accordion) |
| `--duration-instant` | 100ms | icon color/fill swaps |
| `--duration-fast` | 200–250ms | hover feedback, button press |
| `--duration-base` | 350–400ms | card lift, image scale |
| `--duration-slow` | 500–700ms | section reveal, modal enter/exit |
| `--duration-page` | 800ms+ | reserved for Framer Motion page/shared-layout transitions only |

Full animation rules are in §8.

### 3.6 Grid / Containers / Breakpoints

| Breakpoint | Min-width | Columns | Gutter |
|---|---|---|---|
| Base (mobile) | 0 | 4 | 16px |
| `sm` | 640px | 4 | 20px |
| `md` (tablet) | 768px | 8 | 24px |
| `lg` (laptop) | 1024px | 12 | 24px |
| `xl` (desktop) | 1280px | 12 | 32px |
| `2xl` (ultra-wide) | 1536px | 12 | 32px |

| Container | Max-width | Usage |
|---|---|---|
| `--container-content` | 1280px | standard section content (matches shipped `max-w-7xl`) |
| `--container-narrow` | 680px | forms, reading content (checkout, blog post body) |
| `--container-wide` | 100vw | full-bleed section backgrounds; content inside still clamps to `--container-content` |

Ultra-wide (`2xl`+) rule: content **never** stretches past `--container-content`; only ambient backgrounds (gradients, imagery) go full-bleed. Already the practiced pattern in every shipped section.

---

## 4. Color System

Single accent principle carried forward from the approved brand work: **lavender is the only accent color, used sparingly** (Sprint 1B: *"Do not overuse lavender... elegant, modern, premium and minimal"*). There is no secondary accent competing for attention — "Secondary" below means secondary *emphasis*, not a second hue.

| Token | Dark (storefront default) | Light (admin/CMS) | Role |
|---|---|---|---|
| `--color-primary` | `#B7ABF0` (lavender) | `#B7ABF0` | Brand accent — links, active states, icons, CTA glow |
| `--color-secondary` | `#6E62B6` | `#6E62B6` | Deeper violet — gradient/aura depth only, never solid text/fill |
| `--color-accent` | *(alias of primary)* | *(alias of primary)* | No second accent hue exists in this brand — documented explicitly so it's never invented ad hoc |
| `--color-neutral-50…900` | ink→white 10-step ramp | white→ink 10-step ramp | Backgrounds, borders, text opacity scale |
| `--color-success` | `#34D399` | `#0F9D66` | Order confirmed, in-stock, form success |
| `--color-warning` | `#F5A623` | `#B9770E` | Low stock, pending states |
| `--color-error` | `#F2555C` | `#D92D2D` | *(already shipped as `--danger`)* validation errors, destructive actions |
| `--color-background` | `#0B0B0F` | `#F6F5F8` | Page background |
| `--color-surface` | `#111117` | `#FFFFFF` | Secondary section panels (alternating section rhythm) |
| `--color-card` | `rgba(255,255,255,.03)` | `#FFFFFF` | Card fill |
| `--color-border` | `rgba(255,255,255,.07)` | `rgba(11,11,15,.08)` | Hairline border |
| `--color-text` | `rgba(255,255,255,1 / .85 / .7 / .45 / .3)` | `rgba(11,11,15, …same steps)` | 5-step text-opacity scale: solid / strong / body / meta / faint *(already shipped, keep exactly)* |
| `--color-muted` | `--color-text` at `.45` step | same | Secondary/meta copy |

**Dark mode is the storefront default and stays that way** — this is a deliberate brand decision already made and audited (customer-facing = always dark; admin/CMS = always light, internal tool). Not a user-togglable "dark mode" in the conventional sense; documented here so it's never "fixed" as if it were a bug.

---

## 5. Typography

| Role | Font | Source |
|---|---|---|
| Heading | **Fraunces** (variable, optical-size axis) | `next/font/google`, already wired |
| Body | **Inter** | `next/font/google`, already wired |
| Button | Inter, 500 weight, `+0.02em` tracking | |
| Navigation / eyebrow labels | Inter, 600 weight, uppercase, `+0.08em` to `+0.32em` tracking depending on size | matches shipped eyebrow pattern (`SHOP BY CATEGORY`, `FEATURED COLLECTION`, `WHY CHOOSE MUV`) |

### Type scale

| Token | Desktop | Tablet | Mobile | Line-height | Weight | Letter-spacing |
|---|---|---|---|---|---|---|
| `--text-display-xl` (hero H1) | clamp 56–72px | 44–56px | 36–40px | 1.0–1.05 | 400 | −0.01em |
| `--text-display-lg` (section H2) | clamp 40–48px | 32–40px | 28–32px | 1.15–1.2 | 400 | −0.01em |
| `--text-display-md` (card/H3) | 20–24px | 20px | 18–20px | 1.2 | 500 | −0.005em |
| `--text-body-lg` | 17–18px | 17px | 16px | 1.7 | 300–400 | 0 |
| `--text-body-md` (default) | 15px | 15px | 14px | 1.6 | 400 | 0 |
| `--text-body-sm` | 13px | 13px | 13px | 1.5 | 400 | 0 |
| `--text-caption` (eyebrow) | 11px | 11px | 10–11px | 1.4 | 600 | +0.08 to +0.32em, uppercase |

`clamp()` is used for every display token so type scales continuously between breakpoints instead of jumping at fixed steps — already the shipped pattern (`fontSize: "clamp(1.9rem,4vw,3rem)"`).

---

## 6. Component Architecture

| Component | Composition | Notes |
|---|---|---|
| **Navigation** | Custom (floating glass shell, already shipped) + Shadcn `Sheet` for the mobile drawer | Desktop link row unchanged; MegaMenu is new — required once category count grows past a flat 5-link row |
| **MegaMenu** | New — Shadcn `NavigationMenu` primitive, themed | Multi-column: category → subcategory → featured product, needed at 500+ SKU scale |
| **Buttons** | Shadcn `Button`, themed to existing hierarchy | Primary (solid white), Secondary (glass/ghost), Tertiary (text+underline), Icon (circular glass), Destructive (admin only) — visual spec unchanged from shipped `.muv-btn-*` classes, just re-homed as a themed Shadcn component |
| **Cards** | 5 variants, one shared base | Product, Collection/Category, Content (blog), Trust/Feature, Stat (admin) — base handles radius/border/shadow/hover; each variant supplies only its content slot |
| **Product Card** | `components/product/ProductCard.tsx` | Image, badge, wishlist, quick view, name, USP, rating, price, add-to-cart — this is the shipped Sprint 3 card, promoted to the formal reference implementation |
| **Collection Card** | `components/home/CategoryGrid.tsx` | Shipped Sprint 2 tile — icon or image, index label, hover arrow |
| **Inputs** | Shadcn `Input`/`Textarea`/`Select`/`Checkbox`/`RadioGroup` + custom `QuantityStepper`, `ToggleSwitch` (already shipped, keep) | All wired through RHF `register`/`Controller` |
| **Forms** | RHF + Zod resolver, one `<Form>` wrapper per Shadcn's form pattern | Applies first to admin `ProductForm` (currently the most complex hand-rolled validation display) and auth forms |
| **Dialogs** | Shadcn `Dialog` | Replaces the custom `Modal` component |
| **Drawer** | Shadcn `Sheet` | Mobile nav (already effectively this) **and** a new Cart Drawer — slide-out cart is the standard premium-D2C pattern; today cart is full-page-only |
| **Toast** | Shadcn `Sonner` | Replaces custom `ToastProvider`; same pill/white-bg/dark-text visual spec, just Radix-backed for stacking/dismiss/keyboard behavior |
| **Search** | Shadcn `Command` | Site search today; same primitive powers an admin quick-action palette later |
| **Footer** | Custom (shipped Sprint 1) | Reference implementation, unchanged |
| **Carousel** | Shadcn `Carousel` (Embla) | Product gallery thumbnails at scale, "related products" rows |
| **Accordion** | Shadcn `Accordion` | FAQ, product detail spec/description tabs |
| **Badge** | One `<Badge tone="new" \| "limited" \| "sale" \| "outOfStock">` | Consolidates the three badge variants already shipped independently (`muv-badge-pill`, `muv-tag-pill`, `muv-featured-badge`) into one component |
| **Price** | `<Price value mrp />` | Consolidates the price+strikethrough+discount% JSX currently repeated in every product surface |
| **Rating** | `<Rating value count />` | Consolidates the star-mapping JSX currently repeated in `ProductGrid`, `QuickViewModal`, `FeaturedProducts` |

---

## 7. Grid System Recap (implementation-facing)

- Category/Product grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (editorial density) or `lg:grid-cols-4` (dense commerce density) — chosen per section intent, not globally fixed.
- Section vertical rhythm: `--space-12` (96px) desktop / `--space-8`–`--space-10` (40–64px) mobile, top and bottom — matches shipped `py-28 md:py-36`.
- Section header (eyebrow + heading + optional paragraph) is always centered, always `--space-10` (64px) to `--space-12`(96px)-ish gap above the content grid — the pattern established across Categories, Featured Products, and Why Choose MUV; formalized here as the standard, not re-decided per section.

---

## 8. Animation Philosophy

**Luxury. Minimal. Fast. Smooth. Nothing moves without a reason.**

1. **CSS transitions/transforms are the default for everything.** Only `opacity` and `transform` are animated for performance (never `width`/`height`/`top`/`left`/`margin`) — already the shipped discipline.
2. **Framer Motion is reserved for what CSS genuinely can't do**: shared-layout transitions (Quick View → full PDP), gesture-driven interaction (drag-to-dismiss on the new Cart Drawer/mobile Sheet), and multi-element orchestrated sequences where staggering via CSS `animation-delay` gets unmanageable. If a CSS transition can do it, use CSS — don't reach for Framer Motion by default.
3. **One easing curve** (`--ease-default`) for ~95% of motion. No elastic/bounce/spring-overshoot easings anywhere — those read as playful, not premium.
4. **Duration ceiling**: nothing the user is blocked on exceeds 700ms. Page-level transitions (Framer Motion only) may go to ~800ms, never more.
5. **Every animation ships a `prefers-reduced-motion: reduce` fallback.** Non-negotiable, already the shipped pattern on every hover/reveal effect.
6. **Hover = feedback, not decoration.** Every hover effect must signal "this is interactive" or communicate a state change — lift for clickable cards, scale for image previews, glow for primary actions, underline-draw for text links. Never stack more than two simultaneous hover effects on one element.
7. **Scroll-reveal stays IntersectionObserver-based** (the shipped `Reveal` component) — not reimplemented in Framer Motion's `whileInView`, since it already works, is cheap, and every section already depends on it.

---

## 9. Performance Strategy

- **Server Components by default**; `"use client"` only at genuine interaction boundaries, pushed as far down the tree as possible — already the practiced discipline (`page.tsx` stays a Server Component; `FeaturedProducts` is client only because it needs wishlist/cart/quick-view state).
- **Images**: `next/image` everywhere, sourced through the Cloudinary transform preset system (`IMAGE_PRESETS` — thumbnail/gallery/lightbox tiers), explicit `sizes`, `priority` reserved for the true LCP element only (one per page).
- **Code splitting**: automatic at the route level via the App Router; heavy client-only libraries (Framer Motion, any future admin analytics/chart library) loaded via `next/dynamic` where they're not needed for first paint.
- **Caching**: tag-based (`unstable_cache` + `revalidateTag`, already the shipped `lib/cache.ts` pattern) extended down into the new `services/` layer so every service function is cacheable at its own granularity, not just at the page level.
- **Lazy loading**: native `next/image` lazy-by-default, combined with the existing IntersectionObserver `Reveal` component for below-fold sections — no new lazy-loading mechanism introduced.
- **SEO**: Metadata API (`lib/seo.ts` `buildMetadata`, already shipped), JSON-LD structured data (Product/Organization/Breadcrumb schema, already shipped) extended to Article/FAQ schema as blog/FAQ ship; `sitemap.ts`/`robots.ts` via Next's file conventions.
- **Accessibility**: semantic HTML and `aria-label`s are already a practiced discipline; adopting Shadcn/Radix primitives closes the real remaining gap — focus trapping in modals, keyboard nav in menus/comboboxes, and correct ARIA roles, none of which the current hand-rolled `Modal` implements. WCAG AA contrast (4.5:1 text / 3:1 large text) is an already-audited, enforced rule (AUDIT.md) — carried forward unchanged.

---

## 10. AI-Ready Architecture

Every AI feature sits behind a `services/` interface. Components and Server Actions never call a model/provider directly — only the service does — so the provider or algorithm can change without touching a single component.

| Feature | Service seam | Today | Later |
|---|---|---|---|
| AI Search | `services/search-service.ts` → `search(query, filters): Product[]` | Postgres `ILIKE`/full-text | Vector/embedding-backed search, same function signature |
| AI Recommendations | `services/recommendation-service.ts` → `recommend(context): Product[]` | Rule-based (same category, order-history joins for "frequently bought together") | Embedding similarity / collaborative filtering, same signature |
| AI Chat | `app/api/chat/route.ts` (Edge Route Handler, not built yet) + a reserved `components/shared/AiChatWidget` slot | Not built | Streaming chat backed by a model provider — the route and slot exist so this doesn't require restructuring `app/` later |
| Smart Filters | `services/filter-service.ts` (formalizes the already-shipped size-chip filtering in `ProductGrid`) | Deterministic facets from product/variant data | ML-ranked facet ordering, same data shape |

---

## 11. CMS-Ready Architecture

The shipped homepage sections already follow the right pattern: **every section reads from Postgres wherever a CMS model exists** (`Banner`, `HomepageSection`, `NewsletterContent`, `AnnouncementBar`), and falls back to a clearly-marked placeholder only when no model/row exists yet (e.g., Why Choose MUV's `TODO(MUV Darshan™)` placeholders — there is no `TrustSection` model yet).

Formalized rule going forward: **no user-facing marketing copy is hardcoded in a component once its CMS model exists.** Two concrete follow-ups this implies (documented, not built in this phase):

1. A `TrustSection`/`TrustCard` Prisma model mirroring the existing `HomepageSection` pattern, so MUV Darshan™ content can be entered through `/admin` without a code deploy once it exists.
2. A longer-term `components/cms/SectionRenderer.tsx` — a registry that maps a `HomepageSection.type` to a component and a JSON `content` shape, so new homepage sections can be composed by an admin from existing block types without a new route/component per section. This is the natural end-state of the pattern already in use; **explicitly deferred**, not part of this phase, so it doesn't turn into scope creep on top of an architecture doc.

---

## 12. Project Rules

1. **Naming**: PascalCase components, camelCase functions/hooks, kebab-case filenames (already the convention) — `use`-prefixed hooks in `hooks/`.
2. **Client boundary discipline**: `"use client"` only where interaction genuinely requires it; pushed as low in the tree as possible.
3. **No new `any`.** The one pre-existing instance (`CATEGORY_ICONS: Record<string, any>`) is documented debt, not a precedent — new code types icon props as `ComponentType<{ size?: number; strokeWidth?: number }>` (the pattern already used in `TrustCard`).
4. **`actions/` stays thin**: auth check → `zod.parse` → call into `services/` → `revalidateTag`/`revalidatePath`. No inline Prisma query logic in an action once its equivalent `services/` function exists.
5. **One token source**: every color/spacing/radius/shadow/duration value in a component references a token from `styles/tokens.css` (via Tailwind theme or `var(--…)`) — never a hardcoded hex/px.
6. **Every new model that backs user-facing copy ships its admin CRUD surface in the same phase** — the practiced discipline behind every CMS model shipped so far.
7. **Every interactive element has a visible focus state** (`--border-focus`), distinct from its hover state — a real gap today (hover-only affordance on several custom components) that Shadcn/Radix primitives close by default.
8. **Every animation respects `prefers-reduced-motion`.**
9. **Dark is the storefront default, light is admin-only** — a deliberate, audited brand decision, not a togglable theme; never "fixed" as if inconsistent.
10. **Components are colocated by domain** (`home/`, `product/`, `cart/`, …), never by "smart/dumb" split.

---

## Deliverables Checklist

1. ✅ Folder Structure — §2
2. ✅ Design System — §3
3. ✅ Theme Architecture — §3–5 (tokens.css → Tailwind theme extension, dark-default/light-admin)
4. ✅ Component Hierarchy — §6
5. ✅ Responsive Strategy — §3.6, §7
6. ✅ Performance Strategy — §9
7. ✅ CMS Architecture — §11
8. ✅ AI-Ready Architecture — §10
9. ✅ Project Rules — §12

**No page design. No homepage changes. This phase is documentation only — frozen pending your approval.**
