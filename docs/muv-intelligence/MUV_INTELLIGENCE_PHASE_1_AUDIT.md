# MUV Intelligence — Phase 1: MUV AI Care Companion Foundation
## Implementation Audit

*Inspection-only. No files modified, no packages installed, no database changes made, no code written.*

---

## 1. Executive Summary

The Muv codebase (Next.js 15 / React 19 / TypeScript / Prisma / PostgreSQL) has **zero existing AI infrastructure** — no AI SDK, no chat model, no vector/embedding tooling, no conversation schema, no speech APIs, and microphone access is currently **disabled site-wide via `Permissions-Policy`**. This is not a criticism; it means Phase 1 is a genuine greenfield build inside a mature, disciplined codebase.

The good news: this codebase already has the *exact* architectural pattern Phase 1 needs, proven twice — a pluggable provider abstraction (`lib/shipping/index.ts`, `lib/messaging/index.ts`) selected by an environment variable, with every mutation going through a `"use server"` action that independently self-enforces RBAC (`lib/rbac.ts`) and validates input through Zod before touching Prisma. A third instance of this same pattern (`lib/ai/index.ts`) is the natural, low-risk shape for the MUV AI Engine described in the frozen architecture. The admin panel already has a working template for a new admin section (`/admin/inquiries` — Server Component list + Client Component table + status-transition action) that an AI admin console can copy directly.

The two Knowledge Book source files (`.claude/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt`, 715.6 KB; `Muv_AI_Sutra_Master_MASTER1.md`, 110.7 KB) exist as **plain text/Markdown only** — not indexed, not chunked, not embedded, not referenced anywhere in application code. Per `CLAUDE.md`, these two files' own relationship is only partially declared (the Sutra names the Library as senior; the Library never acknowledges the Sutra exists) — this is a real, standing conflict, not something this audit can resolve, and is carried into Section 17 as a founder decision rather than guessed at.

One blocking issue was found that isn't code-complexity-related: **`next.config.ts` explicitly disables microphone access via `Permissions-Policy: microphone=()` globally.** Voice input, the Section 5 requirement, cannot function until this is scoped down (not simply removed — the existing security posture should be preserved everywhere the AI companion isn't rendered).

---

## 2. Confirmed Stack

Verified directly from `package.json`, `.env.example`, `next.config.ts`, `middleware.ts`, `server.js`, and `prisma/schema.prisma`.

| Item | Value | Evidence |
|---|---|---|
| Framework | Next.js | `package.json`: `"next": "15.5.20"` |
| Language | TypeScript (strict, per `CLAUDE.md`) | `.ts`/`.tsx` throughout; `typescript": "^5.6.0"` |
| Routing | Next.js App Router | `app/` directory with route groups `(auth)`, `(storefront)`, plus `admin/`, `account/`, `api/` |
| Package manager | npm | `package-lock.json` implied by `npm run` scripts; no `pnpm-lock.yaml`/`yarn.lock` found |
| UI | React 19, hand-built components (no component library) | `"react": "19.0.0"`; `components/ui/` has only `modal.tsx`, `password-input.tsx`, `primitives.tsx`, `reveal.tsx`, `social-icons.tsx`, `toast.tsx`, `toggle-switch.tsx` — no MUI/Radix/shadcn |
| Styling | Tailwind CSS + one hand-authored global stylesheet | `"tailwindcss": "^3.4.10"`; `styles/globals.css` is the single design-system file (per `CLAUDE.md`) |
| Authentication | Auth.js (NextAuth) v5 beta, JWT sessions, credentials + Google OAuth (optional) | `"next-auth": "5.0.0-beta.31"`, `lib/auth.ts`, `lib/auth.config.ts` (edge-safe split) |
| Database | PostgreSQL | `prisma/schema.prisma`: `datasource db { provider = "postgresql" }` |
| ORM | Prisma 5.20 | `"@prisma/client": "^5.20.0"`, `"prisma": "^5.20.0"` |
| Hosting | Dual-target: standard Node host (`next start`) or GoDaddy/cPanel Passenger (`server.js`) | `package.json` scripts (`start`, `start:passenger`); `server.js` present |
| Deployment | Not confirmed | No CI/CD config file, no `vercel.json`, no Dockerfile found in the repo root |
| Environment variables | Confirmed set: `DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_URL`, Google OAuth, Razorpay (×4), Cloudinary (×3), Resend (×2), shipping provider (×4 provider blocks), messaging provider (×4 provider blocks), warehouse address (×5) | `.env.example`, full contents read |
| Existing AI SDKs | **None** | No `openai`, `@anthropic-ai/sdk`, `ai` (Vercel AI SDK), `langchain`, or any embedding/vector package in `package.json`; a project-wide grep for `chat\|assistant\|openai\|anthropic\|embedding\|vector\|pinecone` across `.ts`/`.tsx` returned zero real matches outside `node_modules` (one incidental substring match in `lib/payments/razorpay.ts`, unrelated) |
| Existing search infrastructure | Custom in-process fuzzy matcher only, not a search engine | `lib/utils/fuzzy-search.ts` used by `components/storefront/product-grid.tsx`; no Algolia/Meilisearch/Elasticsearch/Typesense client found |
| Existing "AI-adjacent" logic | A rule-based, explicitly non-AI recommendation engine | `lib/recommendations.ts`: same-category / overlapping-fragrance-token Prisma queries, with its own comment: *"No ML model, no external service, per the phase brief's own 'no external AI service' / 'real data only' constraints."* This is a real prior decision from an earlier phase and is flagged in Section 17. |

---

## 3. Repository Structure

Directory tree (generated live from the working tree; `node_modules`, `.next`, `.git`, and the `docs/phase-1/*_BACKUPS` folders excluded as noise):

```
app/
  (auth)/                     login, signup, reset-password
  (storefront)/                about, cart, checkout(+success), collections/[category],
                                contact, faq, journal(+[slug]), privacy, products/[slug],
                                returns, shipping, shop, terms
  account/                     orders(+[id]), profile, wishlist
  admin/                       analytics, cms/(blog, categories, homepage), customers(+[id]),
                                inquiries, inventory, marketing, media, orders(+[id]),
                                products, returns, settings
  api/
    auth/[...nextauth]/
    blog/(+[slug])
    categories/
    homepage/
    products/(+[slug])
    webhooks/razorpay/
    webhooks/shipping/[provider]/
  robots.ts, sitemap.ts, error.tsx, not-found.tsx, global-error.tsx

actions/                       auth, blog, cart, cms, coupons, customers, inquiries,
                                inventory, media, orders, payments, products,
                                recently-viewed, returns, reviews, search, settings,
                                shipping, wishlist   (one file per domain, "use server")

components/
  account/, admin/(+admin/products), auth/, cart/, checkout/, order-success/,
  storefront/, ui/

lib/
  analytics.ts, auth.config.ts, auth.ts, cache.ts, cart-context.tsx, env.ts,
  errors.ts, logger.ts, media.ts, pagination.ts, preferences.ts, prisma.ts,
  rate-limit.ts, rbac.ts, recommendations.ts, retry.ts, saved-for-later.ts, seo.ts
  constants/, messaging/(+providers/), notify/(+providers/), payments/,
  shipping/(+providers/), tax/, utils/, validations/

prisma/                        schema.prisma, seed.ts
types/                         next-auth.d.ts   (only augmentation file — no other shared types module)
public/, styles/                (globals.css — single stylesheet, per CLAUDE.md)
middleware.ts, next.config.ts, server.js

docs/, .claude/docs/            MUV Knowledge Library + phase documentation
```

**Tests:** No `tests/`, `__tests__/`, `*.test.ts`, or test runner config found anywhere. Confirms `CLAUDE.md`'s own statement: *"There is no test runner configured."*

**Types:** `types/next-auth.d.ts` is the only dedicated types file in the repo — this project puts most types inline or co-located (e.g., Zod-inferred types in `lib/validations/*.ts`), not in a central `types/` module. Relevant for Section 14: a future `types/ai.ts` (or similar) would be a new pattern, not an established one, if chosen.

---

## 4. Product Data Sources

Inspected `prisma/schema.prisma` (`Category`, `Product`, `ProductVariant`, `Inventory` models), `actions/products.ts`, `app/admin/products/`, and the storefront FAQ components.

| Field | Source of truth | Admin-editable? | API-exposed? | AI-retrieval suitable? |
|---|---|---|---|---|
| Product name, slug, brand | `Product` table | Yes (`/admin/products`) | Yes (`/api/products`, `/api/products/[slug]`) | Yes |
| Category | `Category` table, relation on `Product` | Yes (`/admin/cms/categories`) | Yes | Yes |
| MRP / Price | `ProductVariant.mrp` / `.price` (per-variant, `Int`, whole rupees) | Yes | Yes | Yes — but **per-variant**, not per-product; AI must always resolve price at the variant level, never assume one price per product |
| Description | `Product.shortDescription` (required) / `fullDescription` (optional, both `@db.Text`) | Yes | Yes (present in `/api/products/[slug]`, **not confirmed** whether the list endpoint `/api/products` returns `fullDescription` or only summary fields — would need to be checked against the exact API route before wiring retrieval) | Yes |
| Benefits | `Product.benefits` (`@db.Text`, free text) | Yes | Not confirmed in list endpoints; present on the model | Yes |
| Ingredients | `Product.ingredients` (`@db.Text`) | Yes | Not confirmed | Yes — but this is exactly the field where hallucination risk is highest if the AI is ever allowed to fill gaps; must be treated as authoritative-or-silent, never inferred |
| Directions | `Product.directions` (`@db.Text`) | Yes | Not confirmed | Yes |
| Safety | `Product.safety` (`@db.Text`) | Yes | Not confirmed | Yes — same hallucination-risk note as Ingredients; this is a safety-critical field |
| FAQs | **Not a database field.** Hardcoded arrays in `components/storefront/product-faq.tsx` (generic, same 4 Q&As on every product) and `app/(storefront)/faq/page.tsx` (site-wide, also hardcoded) | **No** — not admin-editable | No — never leaves the React component | **No** — there is no per-product FAQ data model at all today. This is a real, confirmed gap the frozen architecture's "explain usage" goal will hit immediately. |
| Variants | `ProductVariant` (`sku`, `size`, `price`, `mrp`), 1:1 with `Inventory` | Yes | Yes | Yes |
| Availability | `Inventory.quantity` / `.lowStockThreshold`, derived status via `lib/utils/stock-status.ts` | Yes (via `/admin/inventory`) | Yes, on variant | Yes — but time-sensitive; an AI answer about stock is only correct at query time, must always be a live lookup, never cached/embedded as static fact |
| Policies (returns, shipping) | Static server-rendered content in `app/(storefront)/returns/page.tsx` and `app/(storefront)/shipping/page.tsx` — **not a database model** | **No** | No | Content exists and is current (the 48-hour return policy, ₹499 delivery threshold — both recently corrected in this codebase), but is only reachable by parsing rendered page content or the source file itself, not a structured field |
| Brand Story | Static content in `app/(storefront)/about/page.tsx` and the Knowledge Library documents — **not a database model** | **No** | No | Same caveat as Policies |

**Missing fields relevant to Phase 1:** no per-product FAQ model, no structured "usage scenario" or "who is this for" field beyond free-text `benefits`, no explicit allergen/contraindication field separate from the general `safety` text block, no field distinguishing "admin-verified safety copy" from a placeholder — every one of these `@db.Text` fields can legally be `null`/empty in the schema (all are `String?`), so **a null-safe fallback behavior for the AI (e.g., "I don't have that detail for this product yet — let me connect you with our team") is a hard requirement, not an edge case.**

---

## 5. Knowledge Architecture Readiness

**Current state:** the two Knowledge Book files exist only as flat files on disk (`.claude/docs/MUV_Knowledge/`), read by *me* (the coding assistant) as project context, never by the running application. There is no chunking, no embeddings, no search index, no database table referencing them, and no code path that opens them at runtime. `docs/MUV_Knowledge/MUV_KNOWLEDGE_INDEX.md` is described in `CLAUDE.md` as an index only, not a duplicate of content.

Answering the audit's specific questions, based only on what exists today (not a design proposal — Phase 1's frozen architecture already settled the shape; this section states what the codebase would need to support it):

- **How should the knowledge be indexed?** Not implemented today. The codebase has no embedding/vector infrastructure of any kind (Section 2 confirms this) — anything beyond "the whole document as one context blob" would be new infrastructure, not a wiring change.
- **How should permission layers (A/B/C) work?** Nothing in the current schema or `lib/rbac.ts` role model (`ADMIN`/`STAFF`/`CUSTOMER`) maps to a *content*-permission concept — `lib/rbac.ts`'s roles gate *actions*, not knowledge segments. Layers A/B/C would be a new concept, not a repurposing of an existing one — Confidential Knowledge protection specifically has no precedent to build on in this codebase.
- **How should future updates work?** Not confirmed. The source files are hand-maintained `.txt`/`.md`; there is no admin UI, versioning, or diff-tracking for them today.
- **How should retrieval happen?** Not implemented. No retrieval code exists.
- **How should versioning work?** Not implemented. Filenames (`MUV KNOWLEDGE LIBRARY MASTER.txt`, `..._MASTER1.md`) suggest a single-current-version convention by hand, not a system.
- **Public/Internal/Confidential separation?** Per `CLAUDE.md`'s own binding note, the Sutra names "the MUV Knowledge Library™" as the one canonical source 13 times but the relationship between the Sutra's 12 AI chapters and the Library's own Part XII (7 AI chapters) is *not* stated by either document — **this is a real content-level ambiguity in the source material itself**, separate from any code question, and is carried to Section 17 rather than resolved here.

---

## 6. Voice Architecture Readiness

Inspected `next.config.ts`, `middleware.ts`, `package.json`, and did a full grep for speech/audio-related code (none found).

- **Best speech-to-text architecture (browser-native vs. server API):** Not implemented today, so this is unconstrained by existing code — but one existing fact narrows the choice: **`next.config.ts` sets `Permissions-Policy: microphone=()` site-wide**, which blocks `getUserMedia()`/the Web Speech API's microphone access on every single page, including wherever the AI companion would render. This must be corrected (scoped to the origin, not simply deleted) before any browser-based STT approach — Web Speech API *or* a server-relayed audio stream — can function at all.
- **Where microphone permission should be requested:** Not implemented; no existing permission-request pattern anywhere in the codebase to follow (this app doesn't request camera/location/notifications anywhere today).
- **Maximum recording duration:** Not implemented; no existing precedent (no video/audio upload feature in the customer-facing app — the only media upload path, `actions/media.ts`, is admin-only, image/video *file* upload, not live microphone capture).
- **Supported browsers:** Not confirmed by anything in this codebase; would need to be a founder/architect decision informed by the Web Speech API's actual (uneven) cross-browser support.
- **Fallbacks:** Not implemented.
- **Storage strategy:** The one existing precedent for user-submitted media is `actions/returns.ts`'s `getReturnEvidenceUploadUrl` (Phase 1D) — a customer-gated, signed, direct-to-Cloudinary upload with no server-side byte handling. If voice recordings are ever persisted, this is the closest existing pattern, but nothing in the frozen architecture requires persisting the audio itself (STT → text is the stated flow), so **whether recordings should be stored at all is a founder decision, not inferred here.**
- **Whether recordings should be temporary:** Not specified by the frozen architecture; no existing code opinion.
- **Future voice-output compatibility:** No TTS (text-to-speech) code, package, or config exists. The architecture note ("must remain ready for future voice output") is a constraint on *how Phase 1 is built*, not something Phase 1 itself implements — confirmed nothing today would conflict with it, since nothing today touches audio at all.

---

## 7. Customer UI

Inspected `components/storefront/nav.tsx`, `components/ui/modal.tsx`, `components/ui/toast.tsx`, `components/cart/sticky-cart-summary.tsx`, `components/checkout/sticky-checkout-summary.tsx`, and `styles/globals.css`'s z-index usage (found via the touch-interception audit performed earlier in this session).

- **Existing z-index stack (must not collide):** `.muv-modal-backdrop`/`.muv-toast` not yet greppable by number without re-checking, but confirmed fixed-position layers in current use: `<header>` at `z-50`, `.muv-announcement-bar` at `z-60`, `.muv-skip-link` at `z-999`, plus `StickyCartSummary`/`StickyCheckoutSummary` (`lg:hidden` mobile-only bottom bars). **A new AI launcher/chat window must pick a z-index that coexists with all of these**, particularly the mobile sticky summary bars on Cart/Checkout, which occupy the same bottom-of-screen real estate a chat launcher would naturally want.
- **A cautionary precedent, found and fixed this session:** the site's mobile nav drawer was *always mounted* in the DOM (hidden via `visibility:hidden`/`pointer-events:none` rather than conditional rendering) inside a `position: fixed` header with no explicit height — this silently expanded the header's hit-testable box over most of the mobile viewport and blocked touches, until fixed by making the drawer `position: absolute`. **Any AI chat window implementation must not repeat this pattern** — either mount it in a portal (see below) or ensure a closed/collapsed state truly has zero layout footprint, not just zero opacity.
- **Portal usage:** No `createPortal` usage found anywhere in the current codebase — `Modal` (`components/ui/modal.tsx`) renders in-place with a `fixed` backdrop, not via `ReactDOM.createPortal`. This works for the current modal (opened from deep in a tree but visually full-screen) but means **there is no established portal convention to reuse** — introducing one for the AI launcher would be new, not a continuation of an existing pattern.
- **Touch handling / keyboard behaviour:** No existing chat-style input exists to model against. The closest precedent is `components/checkout/checkout-client.tsx`'s multi-step form — plain controlled inputs, no virtual-keyboard-avoidance logic, no `visualViewport` API usage found anywhere in the codebase. **A chat input that must stay visible above a mobile on-screen keyboard has no existing pattern here to follow — this is new engineering, not reuse.**
- **Animation strategy:** No animation library (`framer-motion`, etc.) is installed (confirmed absent from `package.json`). Every existing animation in this codebase is hand-rolled CSS transitions driven by a `data-*` attribute + React state (`Reveal` component, `.muv-mobile-nav[data-open]`, `.muv-modal-panel`). **A new chat window should follow this same CSS-transition-on-`data-attribute` convention**, not introduce a new animation dependency, to stay consistent with the rest of the app.
- **Accessibility:** `Nav`'s mobile drawer has a real precedent worth copying: focus trap via manual `querySelectorAll` + Tab-cycle handling, `Escape`-to-close, `aria-hidden`/`aria-expanded`/`aria-controls`, and `tabIndex={open ? 0 : -1}` on inner links. This is the strongest accessibility precedent in the codebase and should be the template for the chat window's own focus management.
- **Safe overlay strategy:** Given the sticky-summary-bar collision risk and the header's own recent bug, **the safest launcher position, based on what's already on screen, is bottom-right on desktop and likely needs to defer to (not stack on top of) the existing mobile sticky bars on Cart/Checkout specifically** — exact placement is a design decision, not something this audit should invent, but the *constraint* (don't collide with StickyCartSummary/StickyCheckoutSummary) is a confirmed, real one.

---

## 8. Admin Architecture

Inspected `app/admin/layout.tsx` (nav array), `app/admin/inquiries/page.tsx`, `app/admin/returns/page.tsx`, and their paired Client Components.

The codebase already has a complete, repeatable template for exactly this kind of addition — used twice (`/admin/inquiries`, `/admin/returns`): a Server Component page (`prisma` query + pagination via `lib/pagination.ts`, RBAC enforced by `app/admin/layout.tsx`'s own session check) rendering a `"use client"` table component that calls a `"use server"` action which independently re-checks `requireStaff()`. Every requested admin surface maps onto a variant of this same template:

| Requested surface | Best-fit existing pattern to extend |
|---|---|
| AI Settings | New row in the `NAV` array (`app/admin/layout.tsx`) → new `/admin/ai-settings` page; closest existing precedent is `/admin/settings` (`app/admin/settings/page.tsx` + `actions/settings.ts`'s singleton-row `upsert` pattern for `StoreSettings`) |
| Knowledge Manager | No existing precedent — would be new. Closest structural cousin is `/admin/media` (`app/admin/media/`, `actions/media.ts`) for "manage a library of content," but Knowledge Manager's actual content type (versioned text/permission-layered knowledge) has no analog today |
| Conversation Viewer | Closest precedent: `/admin/orders/[id]` — a detail page reading one record with its full history. No conversation/session concept exists to view yet (Section 11) |
| Feedback | Closest precedent: `Review`/`ReviewStatus` model + `/admin` moderation pattern (approve/reject), though `Review` is product-review-specific, not reusable as-is |
| Escalations | Closest precedent: the return-request status workflow just built (`ReturnRequestStatus`, `RETURN_REQUEST_ALLOWED_TRANSITIONS` in `lib/validations/returns.ts`) — an explicit state machine with a staff-only transition action is the exact right shape for "escalate to human support" |
| Starter Questions, Welcome Message | Closest precedent: `AnnouncementBar`/`NewsletterContent`/`HomepageSection` — small, singleton or short-list CMS content types already admin-editable via `actions/cms.ts` |
| Prompt Versions | No existing precedent — would be new. Nothing in the schema tracks "versions" of anything today (not even Product has a revision history) |
| Logs | Closest precedent: `NotificationLog` model + `lib/logger.ts` (structured server-side logging, already used everywhere) |
| Permission Management | Closest precedent: `lib/rbac.ts`'s `Role` enum (`ADMIN`/`STAFF`/`CUSTOMER`) — but this governs *user* roles, not *content* permission layers (Layer A/B/C from Section 4/5) — those are a different concept and would need their own mechanism |
| Feature Flags | **No existing feature-flag system of any kind** — confirmed absent from `package.json` and `lib/`. Every toggle in this codebase today (COD enabled/disabled, announcement bar shown/dismissed, homepage section visibility) is a bespoke boolean field on a specific model (`StoreSettings.codEnabled`, `HomepageSection`'s own visibility flag), not a general flag system |

---

## 9. Backend Architecture

Inspected `actions/*.ts` broadly, `lib/errors.ts`, `lib/rate-limit.ts`, `lib/rbac.ts`, `lib/shipping/index.ts`, `lib/messaging/index.ts`, and `middleware.ts`.

- **Best API structure:** Follow the existing convention exactly — a new `"use server"` file (e.g. `actions/ai.ts`), not a new `app/api/*` route. `CLAUDE.md`'s own stated reason still applies: Server Actions get automatic CSRF protection via Origin-checking that a hand-added `app/api/ai/route.ts` would have to reimplement manually. The two existing webhook routes (`app/api/webhooks/*`) are the only precedent for a *mutating* API route, and only because an external system (Razorpay/a courier) must call in — that same exception would apply to a future WhatsApp webhook, not to the website chat itself.
- **Server-side AI architecture:** No existing precedent for calling a third-party inference API from this codebase (confirmed no `fetch()` to any LLM provider anywhere). The closest *structural* precedent is `lib/payments/razorpay.ts` — one real external-API integration, server-only, with its secret key never exposed client-side (`NEXT_PUBLIC_RAZORPAY_KEY_ID` is the sole deliberate exception, per `CLAUDE.md`). An AI provider key should follow the same rule: server-only, no `NEXT_PUBLIC_` prefix.
- **Rate limiting:** `lib/rate-limit.ts`'s `checkRateLimit(key, limit, windowMs)` already exists and is used for exactly this class of problem (`coupon-validate:${ip}` at 20/min, `signup:${ip}` at 5/hour, `login:${email}` at 5/5min). Directly reusable for an AI endpoint (e.g., `ai-chat:${customerIdOrIp}`) with no new dependency — **with the same caveat already documented in the codebase**: it's in-process memory, fine for one server instance, silently ineffective across multiple instances, and would need Redis before horizontal scaling (this caveat gets more urgent for an AI feature, since AI calls are typically the most expensive/abuse-prone endpoint in an app).
- **Logging:** `lib/logger.ts` is already used everywhere (`logger.error(...)`, `logger.warn(...)`) — directly reusable, no new logging infrastructure needed for basic operational logs. A dedicated conversation/message log is a *data model* question (Section 11), not a logging-infrastructure question.
- **Validation:** Every action validates `input: unknown` through a Zod schema before touching Prisma (`lib/validations/*.ts`) — this is a hard, consistent, unbroken convention across all 19 files in `actions/`. An AI action must follow it exactly.
- **Prompt construction:** No existing precedent.
- **Knowledge retrieval:** No existing precedent (Section 5).
- **Safety layer (anti-hallucination, escalation):** No existing precedent, but the *shape* of "never trust the client, re-derive server-side" is the single most consistent theme in this codebase (coupon re-validation at order time despite client-side display, webhook signature verification before trusting payment status, RBAC re-checked in every action regardless of caller) — the same discipline should govern how AI answers are grounded against retrieved knowledge rather than model memory.
- **Provider abstraction:** Directly reusable pattern, proven twice already (`getShippingProvider()`, and the equivalent in `lib/messaging/index.ts`) — switch on an env var (`AI_PROVIDER`), one file per provider under `lib/ai/providers/`, a shared `lib/ai/types.ts` interface. This is the single strongest piece of existing architecture to build Phase 1 on.
- **Future channel support:** See Section 10.

---

## 10. Multi-channel Architecture

The frozen requirement — one engine, reused by Website → WhatsApp → Email, extensible to QR/Founder/Sales — maps directly onto infrastructure that **already exists for exactly this reason, for a different feature**:

- `lib/messaging/index.ts` already abstracts WhatsApp/SMS behind one interface, provider-switched by `MESSAGING_PROVIDER` (Twilio/MSG91/Interakt/WhatsApp Business Cloud API — confirmed in `.env.example`).
- `lib/notify/` (with its own `providers/` subfolder) already abstracts email (Resend) the same way.
- Both are already called from business-logic code (`actions/orders.ts`, `actions/returns.ts`) without that code knowing which concrete provider is active.

**The cleanest reusable architecture, based on what's already here:** the AI Engine itself (`lib/ai/`) should be channel-agnostic — it accepts a normalized "incoming message + customer/session context" and returns a normalized "response + any actions" (e.g., escalate, recommend product X). Each *channel adapter* (a new website chat action, a new WhatsApp webhook handler under `app/api/webhooks/whatsapp/`, an email-reply handler) is responsible only for translating its transport into that normalized shape and back — mirroring how `actions/shipping.ts` doesn't know which courier is active and `actions/orders.ts`'s notification calls don't know which SMS provider is active. This is not a new idea being introduced; it is the same abstraction this codebase already uses twice, applied a third time.

**Not confirmed:** whether a WhatsApp *inbound* webhook receiver exists today for anything (the current `WHATSAPP_*` env vars and `lib/messaging` are outbound-only, for order/delivery notifications — confirmed by reading `lib/notify/send-messaging.ts`'s call sites in `actions/orders.ts`). An inbound WhatsApp channel for the AI companion would need a new webhook route, following the existing `app/api/webhooks/shipping/[provider]/route.ts` pattern (raw-body HMAC verification, always return 200, log failures for follow-up) — that pattern is directly reusable, but the route itself doesn't exist yet.

---

## 11. Database Readiness

Full `prisma/schema.prisma` model list inspected (44 models / enums, confirmed via direct grep). **None of the following exist today:**

| Concept | Exists? | Nearest existing analog |
|---|---|---|
| Knowledge (indexed/chunked) | No | None |
| Prompt Versions | No | None — nothing in this schema is versioned (not even `Product`) |
| Chat Sessions | No | None |
| Messages | No | None |
| Intent | No | None |
| Confidence | No | None |
| Feedback | No | `Review`/`ReviewStatus` exists but is product-review-specific, not reusable for AI-answer feedback without a new model |
| Escalation | No dedicated model | `ReturnRequestStatus`'s state-machine pattern (`SUBMITTED → UNDER_REVIEW → ...`, enforced via an `ALLOWED_TRANSITIONS` map) is the closest *structural* precedent for how an escalation workflow should be modeled, but it is order/return-specific, not reusable data itself |
| Conversation History | No | None |

**Conclusion: the current database cannot support Phase 1's data needs without new tables.** This is stated as a finding, not a recommendation to create them — per the explicit rule in this prompt, no schema changes are proposed or implied here beyond naming what's absent.

One relevant existing precedent worth noting for whenever schema design happens: this project's established convention for a status-workflow model is enum + explicit allowed-transitions map + `ticketNumber`-style human-readable ID (see `ReturnRequest` in `prisma/schema.prisma`, built this same session) — any future Escalation/Conversation model would likely follow that same shape to stay consistent with the rest of the codebase.

---

## 12. Security Review

| Area | Current state | Evidence |
|---|---|---|
| Prompt Injection | No existing exposure (no AI exists yet) — but the codebase's consistent "never trust client input, re-validate server-side" discipline (Zod on every action, coupon/GST re-derivation server-side) is the right foundation to extend to "never let retrieved knowledge or user input be interpreted as new instructions" | `lib/validations/*`, `actions/orders.ts`'s coupon re-check |
| Rate Limits | Infrastructure exists (`lib/rate-limit.ts`) and is proven on comparable endpoints; not yet applied to anything AI-related since nothing AI-related exists | `lib/rate-limit.ts`, its call sites in `actions/coupons.ts`, `actions/auth.ts`, `actions/inquiries.ts` |
| API Keys | Existing convention (server-only secret, one deliberate `NEXT_PUBLIC_` exception for Razorpay's publishable key) is clear and would extend cleanly to an AI provider key | `.env.example`, `CLAUDE.md`'s explicit rule |
| Admin Access | `requireStaff()`/`requireAdmin()` (`lib/rbac.ts`) already gate every admin mutation independently of middleware/route gating — directly reusable for AI Settings/Knowledge Manager/etc. | `lib/rbac.ts`, `middleware.ts` |
| Input Validation | Universal Zod-before-Prisma convention, unbroken across 19 action files | Confirmed by direct inspection of `actions/` |
| Output Sanitization | Not confirmed as a distinct concern anywhere today — this codebase's outputs are either structured data (JSON) or server-rendered React (auto-escaped by React) or plain-text notification templates (`lib/notify/templates.ts`). An AI's free-text output rendered into the DOM would need the same "React auto-escapes, don't use `dangerouslySetInnerHTML`" discipline already implicitly followed everywhere else — no existing violation found to flag, but also no existing precedent for sanitizing *model-generated* text specifically |
| PII | `Customer` (email, phone, name), `Address`, `Order` all contain real PII already, handled today only via RBAC + `lib/errors.ts`'s "never leak internals" pattern — no dedicated PII redaction/anonymization layer exists anywhere in the codebase. A Conversation History model (Section 10 gap) would be a *new* PII-bearing surface with no existing precedent for retention/redaction policy |
| Logging | `lib/logger.ts` used consistently; **not confirmed** whether current logging is already careful never to log full customer PII/payment details in structured log fields — worth an explicit check before logging AI conversation content, since conversations may contain more sensitive free-text than existing structured logs do |
| Secrets | `.env`/`.env.example` split is standard and consistent; `lib/env.ts` only hard-requires `DATABASE_URL`/`AUTH_SECRET`, letting every optional integration fail gracefully at its own call site — the same graceful-degradation pattern should apply to a missing/misconfigured AI provider key (AI companion unavailable, not a crashed app) |
| Permission Boundaries | `lib/rbac.ts`'s `ADMIN`/`STAFF`/`CUSTOMER` model has no concept of *content* permission layers (Layer A/B/C) — this is a genuinely new boundary type, not a reuse of the existing role system, and deserves explicit design attention before any Confidential-layer content is ever connected |

**Confirmed blocking security item (not a code gap, a live config):** `Permissions-Policy: microphone=()` in `next.config.ts` blocks microphone access globally, site-wide, right now (Section 6/15).

---

## 13. Testing Strategy

Recommended, given this codebase's actual, confirmed testing reality: **no test runner, no CI, all verification in this project has historically been `tsc --noEmit` + `next build` + live HTTP/`curl` checks against a running server, plus (per this session's own precedent) direct Prisma-script verification of database-level workflows.** Any AI-feature test plan should assume the same constraints apply, not assume a test framework that doesn't exist.

- **Desktop:** Launcher open/close, message send/receive, streaming (if used) doesn't block the rest of the page, chat window z-index doesn't collide with existing modals/toasts.
- **Mobile / Real Device:** This session's own findings make this non-optional, not a formality — this codebase has *already* shipped a bug where something looked correct in code and in desktop-simulator mode but silently broke ~most touch interaction on a real Android phone. Every AI UI element must be verified on a real device before being called done, exactly as the last correction pass required for the rest of the site.
- **API:** Rate-limit enforcement (verify the 429 path, not just the happy path), RBAC on every admin AI-management action, Zod rejection on malformed input, graceful behavior when the AI provider key is missing/misconfigured (should degrade, not 500).
- **Security:** Prompt-injection attempts against retrieved knowledge, confirm Confidential-layer content is never returned even when explicitly asked for it "as an admin," confirm the AI never states a price/stock/policy fact without a live data lookup backing it.
- **Performance:** Response latency budget (not confirmed by anything in this codebase — a founder/architect decision), behavior under the existing in-process rate limiter's memory-only constraint if this ever runs on more than one instance.
- **Failure Recovery:** AI provider timeout/error → must fail toward "let me connect you with our team" (the frozen architecture's own stated escalation goal), never toward a fabricated answer or a raw stack trace (`lib/errors.ts`'s existing "generic message to client, full detail server-side" convention should govern this exactly).
- **Accessibility:** Reuse `Nav`'s mobile-drawer precedent (focus trap, `Escape` handling, `aria-*` attributes, keyboard-only operability) as the acceptance bar for the chat window, since it's the strongest existing accessibility implementation in the codebase to hold a new feature to.

---

## 14. Files

**Likely to be created** (following exact existing naming/placement conventions — nothing here is invented, each maps to a real, already-used pattern in this repo):

| File | Purpose (by analogy to existing code) |
|---|---|
| `lib/ai/index.ts` | Provider-switch entry point, same shape as `lib/shipping/index.ts` |
| `lib/ai/types.ts` | Shared provider interface, same shape as `lib/shipping/types.ts` |
| `lib/ai/providers/*.ts` | One file per AI provider, same shape as `lib/shipping/providers/*.ts` |
| `lib/validations/ai.ts` | Zod schemas for chat/message input, same shape as every other `lib/validations/*.ts` |
| `actions/ai.ts` | `"use server"` chat/conversation actions, RBAC/rate-limit/Zod per the universal convention |
| `components/storefront/ai-launcher.tsx`, `ai-chat-window.tsx` | New customer-facing UI, placed alongside other `components/storefront/*` |
| `app/admin/ai/` (settings, knowledge, conversations, escalations sub-pages) | Following the exact `app/admin/inquiries/` / `app/admin/returns/` template |
| `components/admin/ai-*-client.tsx` | Client-side table/detail components, following `components/admin/returns-table-client.tsx`'s pattern |
| `prisma/schema.prisma` additions (new models — not enumerated here since this audit does not propose a schema) | Would need Conversation/Message/Knowledge/Feedback/Escalation-equivalent models per Section 11's gap list |

**Likely to be modified:**

| File | Why |
|---|---|
| `next.config.ts` | `Permissions-Policy` currently blocks `microphone=()` globally — must be corrected before voice input can work at all |
| `app/admin/layout.tsx` | New `NAV` entries for AI admin sections, same one-line-per-section pattern already used for Returns/Inquiries |
| `lib/rbac.ts` | Only if content-permission layers (A/B/C) end up needing a new boundary concept beyond the existing `Role` enum — **not confirmed to be necessary**, depends on future design |
| `.env.example` | New AI provider key(s), following the existing documented-optional-var convention |
| `middleware.ts` | Only if a new admin AI route needs edge-gating beyond what the existing `/admin/:path*` matcher already covers — **likely not required**, since the existing matcher is already broad |

---

## 15. Blockers

**Blocking:**
1. **Microphone access is globally disabled** (`next.config.ts`'s `Permissions-Policy: microphone=()`). Voice input (Section 5's core requirement) is technically impossible until this is corrected.
2. **No conversation/knowledge/feedback/escalation data model exists** (Section 11). Nothing here can be implemented without new schema — which this audit is explicitly forbidden from creating, only from confirming the gap.
3. **No AI provider is chosen or configured** (no key, no package). Not a defect — a founder decision (Section 17) — but it blocks any actual API call regardless of how well the surrounding architecture is built.

**Non-blocking:**
1. No per-product FAQ data model (Section 4) — the AI can launch with a generic fallback answer path and this can be backfilled.
2. No feature-flag system exists (Section 8) — a simple `StoreSettings`-style boolean (matching the existing `codEnabled`/announcement-bar precedent) is a perfectly adequate substitute for Phase 1's scope and doesn't block anything.
3. `lib/rate-limit.ts`'s in-memory-only limitation (already a known, documented limitation for the whole app, not new to this feature) — fine for Phase 1's likely single-instance deployment, a real constraint only at scale.

**Unknowns requiring a founder decision** (see Section 17 for the full list — summarized here as blockers-to-planning, not blockers-to-inspection):
- Which AI provider/model.
- Exact shape of the A/B/C knowledge permission system.
- Whether the Sutra or the Library governs when the two conflict on an AI-capability specific (the standing, `CLAUDE.md`-documented ambiguity).
- Retention/versioning policy for the Knowledge Library once it's connected to a running system instead of being static documentation.
- Whether voice recordings are ever persisted, and for how long.

---

## 16. Founder Decisions

(Carried forward from Sections 4, 5, 8, 15 — consolidated here as the audit format requests.)

1. **AI provider selection** — no SDK, no key, no code preference exists today; this is entirely open.
2. **Knowledge indexing/retrieval method** — the frozen architecture states the *what* (permission-layered retrieval from the existing Knowledge Library) but not the *how* (full-document context vs. chunked retrieval vs. embeddings) — nothing in the current codebase implies a preference either way.
3. **Sutra vs. Library seniority on AI-capability specifics** — `CLAUDE.md`'s own binding note states this is unresolved between the two source documents themselves ("stop and report the conflict — do not guess which one wins"). This audit reports it; it does not resolve it.
4. **Confidential-layer (Layer C) governance** — the frozen architecture says it's "used only when explicitly authorized in future internal systems" — which system, which role, and when, is not specified and has no existing analog in `lib/rbac.ts`'s current role model.
5. **Voice recording retention** — persist or fully ephemeral; no existing code precedent points either way.
6. **Deployment/scaling target** — whether this runs on the standard Node host or GoDaddy/Passenger (both are live options in this repo today) matters for whether `lib/rate-limit.ts`'s in-memory limitation is acceptable for the AI endpoint specifically or needs Redis from day one.
7. **Relationship to the existing "no external AI service" decision** in `lib/recommendations.ts` — that earlier phase deliberately avoided any AI/ML dependency for product recommendations; Phase 1 supersedes that for the chat/companion feature specifically, but whether the *recommendation engine itself* should ever be upgraded to use the new AI Engine (vs. staying rule-based) is a separate, unaddressed decision.

---

## 17. Final Recommendation

The frozen architecture is sound and, notably, already matches this codebase's existing engineering discipline closely (provider abstraction, server-side-only secrets, Zod-everywhere, RBAC-everywhere, "never trust the client" as a running theme) — Phase 1 is not fighting the codebase's grain. But three concrete, confirmed gaps stand between this audit and a safe first line of implementation code: the disabled microphone permission, the complete absence of any conversation/knowledge database model, and the unresolved AI-provider decision. None of these are large, but per this prompt's own rule, "do not implement" — so they are reported, not fixed, here.

**NOT READY FOR IMPLEMENTATION**
