# MUV™ — Phase 4C: Platform Architecture
### Version 1.0 · Status: DRAFT — awaiting approval
### Builds on `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md`, `PHASE_4B_INFORMATION_ARCHITECTURE.md` (all frozen, binding)

> This document defines how MUV operates internally — the backstage that makes every customer-facing promise in Phases 1-4B real. It does not redefine UX, brand, or product strategy; it builds on them and cross-references rather than repeats. No UI, no design, no code.

---

## 1. Platform Philosophy

**Why the platform exists:** The storefront (`PHASE_1`-`PHASE_4B`) is what a customer sees. The platform is everything that has to work correctly *behind* it for that experience to be true rather than aspirational — accurate stock, orders that don't get lost, content editable without a deploy. A customer never visits the platform directly, but every promise `PHASE_2`/`PHASE_3` make on the customer's behalf is only as real as the operational system honoring it.

**How internal operations support customer experience:** Directly and specifically. `PHASE_2` §1's "Confident" stage depends on inventory data that isn't stale. "Trusting" depends on product claims an admin actually sourced from something real. "Satisfied" depends on fulfillment operations getting the right product to the right address. Every emotional stage in `PHASE_2` has an operational dependency in this document — they are not two separate concerns.

**How platform decisions support Keep Muving™:** Internally, not just externally. An admin who can't find what they need, a support agent without visibility into an order, a warehouse worker unsure what shipped — these are internal stalls, and they compound into customer-facing ones. "Keep Muving" is an operational discipline before it's ever a customer-facing feeling.

**Storefront vs. Platform:** The Storefront is the customer-facing surface — already fully specified in Phases 1-4B. The Platform is the operational system that runs, maintains, secures, and evolves it: admin, CMS, integrations, security, data — almost entirely invisible to a customer, entirely load-bearing for what they experience.

---

## 2. Operational Architecture

Each domain owns one truth and explicitly does not own others — the boundary is the point.

| Domain | Owns | Never owns |
|---|---|---|
| **Products** | What's sellable, its content, its lifecycle state | Stock quantity (Inventory's job) |
| **Inventory** | What's actually available to promise a customer, in real time, with a full audit trail | Product content/pricing |
| **Orders** | Every commitment made to a customer, from placement to closure | Product truth — an `OrderItem` snapshots it, never re-reads live product data (`PHASE_4B` §10) |
| **Customers** | Who's transacted, what they're owed by support, what they've consented to | Marketing segmentation (a related but distinct concept — see §7) |
| **Content** | Everything a customer reads that isn't a transactional fact (`PHASE_4B` §6) | Product/pricing facts |
| **Media** | The shared asset pool referenced across products, content, and banners | The assets themselves — Cloudinary is the actual store (§9) |
| **Marketing** | Promotions and coupons, and how they interact with pricing without corrupting its single source of truth | Base pricing (Products owns that) |
| **Business** | Institutional relationships, inquiries, quotations (`PHASE_4A`/`PHASE_4` §10) | The order lifecycle once a quotation converts (§6) |
| **Support** | Resolution of anything gone wrong for a customer | Order or customer *data* — Support has visibility, not ownership |
| **Analytics** | Measurement of every domain above (`PHASE_2` §14, `PHASE_4A` §5) | Nothing — read-only over everything, a source of truth for nothing |
| **Finance** | The true financial record — revenue, tax (HSN/GST), refunds | Order status — reconciled against Orders, never a parallel copy |
| **Settings** | Platform-wide configuration (shipping providers, tax defaults, feature flags) | Currently mostly environment variables (`PHASE_1`); admin-editable settings is a tracked gap, not a design decision |
| **Notifications** | Outbound communication triggered by events in other domains | Any originating truth — Notifications reacts, it never originates |

---

## 3. Admin Architecture

Page inventory already lives in `PHASE_4B` §2-3 — not repeated here. This section defines responsibility, and the genuinely new surfaces this phase adds.

- **Dashboard:** read-only summary, pulling from §2's domains — never a data-entry point itself.
- **Audit Logs [new]:** an append-only record of who changed what, when, across every domain — not only a compliance artifact. `PHASE_4A`/`PHASE_4B`'s repeated "one source of truth" principle is only trustworthy if changes to that truth are traceable. `StockHistory` is the real, already-shipped precedent for exactly this pattern, scoped to inventory; this section formalizes it as a platform-wide expectation, not an inventory-specific exception.
- **System Health [new]:** operational visibility into the platform itself — is the payment webhook succeeding, is the shipping integration responding, are notifications sending. Distinct from Analytics, which measures *business* performance; System Health answers "is anything actually broken right now," for admins and engineers, not for reporting.
- **Reviews (moderation):** the `Review.status` (`PENDING`/`APPROVED`/`REJECTED`) already exists in the data model — this is the admin surface that acts on it, a real gap consistent with `PHASE_4B`'s honest gap-tracking, not a new capability being proposed from scratch.
- **SEO:** the admin-facing control surface for `PHASE_4B` §8's per-page metadata — where a Content Editor (§10) actually edits a title/description/OG image, rather than metadata staying a code-level default indefinitely.

---

## 4. CMS Architecture

Content *types* and their relationships are `PHASE_4B` §6's territory. This section defines how content *moves* — ownership, versioning, publishing, drafts, scheduling — which `PHASE_4B` didn't cover.

**Content ownership:** each content type has an owning role (§10) — Content Editor owns Blog/Homepage sections/Banners; Admin owns Products/Pricing; Business Manager owns Business pages. Ownership means "who is accountable for this being correct," not "who is technically capable of editing it."

**Publishing workflow:** the minimum viable state model is Draft → Published — content is never half-visible, and a customer never sees an edit mid-flight. For V1, direct-publish is accepted (an edit is live immediately) because that already matches how Product edits actually behave in the live system today. A formal Draft → Review → Publish workflow with staging is a V1.1/Future maturity step, and specifically waits on the Content Editor role (§10) existing as distinct from Admin — a review step only means something once there's a proposer and a separate approver; with one undivided role today, formalizing review would be process theater.

**Drafts — two different things, worth naming separately:** a `Product` in `ProductStatus.DRAFT` (already modeled — not visible to customers, freely editable, no customer-facing consequence) is a different concept from a *draft edit to an already-live product* (editing an ACTIVE product without the change going live until approved) — the latter doesn't exist yet, and is the actual V1.1/Future capability implied by "drafts" in a CMS sense.

**Versioning:** for high-consequence content (pricing, policies) a change history should exist — the same audit discipline as §3, applied to content specifically, not just inventory.

**Scheduling:** time-based publishing (a banner going live on a specific date) is precedented already by `Coupon.expiresAt` — the pattern (a `publishAt`/`expiresAt` pair) should be reused generically across content types when scheduling is built, rather than reinvented bespoke per content type each time it's needed.

---

## 5. Product Management Architecture

Relationships are `PHASE_4B` §6/§10's territory. This section covers lifecycle specifically.

**Lifecycle states** (already modeled as `ProductStatus`): `DRAFT` — being prepared, invisible to customers, freely editable with no customer-facing consequence. `ACTIVE` — live and purchasable; edits take effect immediately (§4). `ARCHIVED` — no longer sellable, preserved intact for order-history integrity. This last rule is already correctly implemented: a product that appears in past orders is archived, never hard-deleted, specifically so historical orders/invoices remain intact — the real precedent every future "should we delete this?" decision should follow.

**Attributes:** today, product attributes (fragrance, weight, ingredients, HSN, GST) are fixed fields on `Product`, not a flexible attribute system. This is a real constraint, not an oversight: adding a genuinely different product *archetype* (something structurally unlike a bottled liquid) would require a schema change today, not just new data entry. Worth distinguishing clearly from adding a new *Category* (cheap, already flat and scalable per `PHASE_4B` §11) — a new archetype is a bigger, deliberate decision, not a routine catalog addition.

**Pricing, MRP, Discounts:** price and MRP live per-variant; discount percentage is *derived*, never stored (`calculateDiscountPercent`) — a "sale" is simply setting price below MRP on the variant directly. Coupons are the only genuinely separate promotional mechanism today. This matters operationally: Marketing (§2) can run a coupon-based promotion without touching product data, but cannot run a storewide "sale" without editing individual variant prices, because no separate promotional-pricing layer exists yet.

**Inventory:** already the platform's most mature domain — real-time quantity, low-stock thresholds, and a complete `StockHistory` audit trail per change. This is the standard §4's content-versioning ambition is measured against, not a separate concern.

**Media, SEO, Publishing:** `PHASE_4B` §8-9.

**Future product categories:** a new *Category* is low-risk and already scalable. A new product *archetype* (per Attributes, above) is a deliberate, higher-cost decision that should go through `PHASE_4A` §12's Decision Framework explicitly, not be treated as routine catalog growth.

---

## 6. Order Management

The complete lifecycle, built on the real, already-modeled state machines.

**Two state machines, reasoned about together:** `Order.status` (`PLACED → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, with `CANCELLED`/`RETURN_REQUESTED`/`RETURNED` branches) and `Order.paymentStatus` (`PENDING/PAID/FAILED/REFUNDED/PARTIALLY_REFUNDED`) are separate and must never be conflated — an order can be legitimately `PLACED` with payment `FAILED`, and that is a real state to handle correctly, not an edge case to shrug off.

**Payment:** `PaymentAttempt` is a distinct, retry-safe record from `Order` — a failed attempt doesn't corrupt the order, and a retry doesn't create a duplicate order.

**Shipping, Packing, Dispatch, Tracking:** modeled through `Shipment` → `ShipmentEvent`, tracked separately from `Order.status`. This separation is necessary (fulfillment has its own granular timeline) but creates a real integrity risk if the two are ever updated independently instead of through one owning transition — flagged explicitly in §14.

**Returns, Refunds, Cancellation:** `ReturnShipment` models the return flow distinctly from the outbound `Shipment` — a return is not "a shipment in reverse" structurally, it has its own state (`REQUESTED → APPROVED → PICKUP_SCHEDULED → PICKED_UP → RECEIVED`, or `REJECTED`).

**Status transitions:** the valid transition graph is the platform's job to enforce, not the admin screen's. `PLACED → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED` is the happy path; `CANCELLED` branches off before shipment; `RETURN_REQUESTED → RETURNED` branches off after delivery. An invalid transition (`DELIVERED → PLACED`) should be structurally impossible, enforced at the `services/` layer (`PHASE_1` §2) — never left to "the button just shouldn't be clickable" as the only safeguard.

**Manual intervention:** admins must be able to override status when reality diverges from the system (a courier misreports delivery, a customer calls to cancel outside the normal window) — but every override is logged (§3's Audit Log). An override is exactly the kind of event that most needs a trace, not an exception from having one.

**Business Orders:** once a Quotation (`PHASE_4A`/`PHASE_4` §10) converts, the resulting `Order` flows through this exact same lifecycle — there is no parallel "business order" state machine. One `Order` model, one lifecycle, regardless of which channel produced it.

---

## 7. Customer Management

Roles are `PHASE_4` §4's territory — not re-listed here.

**Customer Groups:** today, segmentation is implicit (role plus order history) — there's no explicit tagging/grouping system for marketing purposes. Worth distinguishing clearly from Role: Role governs *permissions*, Group/Segment would govern *targeting* — conflating the two would mean a marketing tag accidentally changing what a customer is allowed to do, which must never happen. A future Customer Groups capability is additive, not a Role extension.

**Customer 360:** Addresses, Wishlist, Orders, and Support history are already individually modeled; the genuinely useful *new* capability is a unified admin view assembling them into one profile — and `CustomerNote` already exists in the schema specifically to support this, an already-real precedent for "give support staff the full picture in one place" rather than a new idea.

**Privacy and data ownership:** access is scoped by role (Support Staff sees order/contact history, not payment detail; Admin sees everything). The customer owns their own data — access, export, and deletion requests are a real platform principle here, not only a legal formality, consistent with `PHASE_3` §7's transparency discipline applied to the customer's *own* information, not just product claims.

---

## 8. Business Operations

The Inquiry → Quotation → Order flow is fully specified in `PHASE_4`/`PHASE_4A` §10 — not repeated here.

**Approval:** a Quotation is proposed by a Business Manager (§10, a role this phase formalizes) and approved by Admin before it's sent — pricing exposed to an institutional buyer is a financial commitment, and deserves the same approval discipline as any other consequential change (§3's Audit Log applies here directly).

**Relationship Management:** institutional accounts (Hotels, Hospitals, Laundry, Car Wash, Corporate) are relationships, not one-off transactions. `PHASE_2` §2 already established that these personas need *predictability* — which requires the platform to observe recurring order patterns per account, not just process each order as an isolated event. This is the operational precondition for `PHASE_4`'s future Subscriptions/recurring-order capability, even before that capability is built.

---

## 9. Media Architecture

Content relationships are `PHASE_4B` §6/§9's territory. This section covers storage, naming, optimization, versioning, reuse, and lifecycle specifically.

**Storage:** Cloudinary is the actual store of record for asset bytes; `MediaAsset` (Postgres) is the admin-facing index and audit layer *over* it, not the store itself. This split — one system owns the bytes, another owns the metadata/audit trail — is the correct pattern and should not collapse into "just store it in the database."

**Naming:** storage keys (Cloudinary-generated) are opaque; `MediaAsset.filename` is the human-readable label. This mirrors `PHASE_4B` §7's URL philosophy exactly (opaque key internally, meaningful label externally) — worth recognizing as the same principle applied to a different layer, not a separate decision.

**Optimization:** already real — the Cloudinary transform-preset system (`PHASE_1` §9) delivers the right resolution per context (thumbnail, gallery, lightbox) from one uploaded original. This is the working precedent for "optimize once, derive many," not a future ambition.

**Versioning:** today, a "new version" of an image is really a new asset with references repointed — there's no true in-place version history per asset. Acceptable for V1's simplicity, but a real constraint worth naming: an order-confirmation email referencing a product photo should reference a *snapshot*, not a live-editable asset, for the same reason `OrderItem` snapshots price and name (`PHASE_4B` §10) — otherwise editing a photo today could silently alter what a six-month-old order confirmation shows.

**Reuse:** the shared-pool model (`PHASE_4B` §6) — one asset, referenced by many content types, never duplicated per use.

**Lifecycle:** unused/orphaned assets (uploaded but never attached to any live content) should be identifiable and eventually cleanable — a real hygiene concern at scale (500+ products, multiple images each, iterated over time) even though it isn't urgent today.

---

## 10. User Roles & Permissions

The ten roles and their base permissions are fully specified in `PHASE_4` §4 — not re-derived here. This section adds ownership and approval rights specifically, including two decisions `PHASE_4` left open.

**Reconciling two new role names this phase introduces:**
- **Content Editor** = `PHASE_4`'s **Content Manager**, named consistently with this document's CMS terminology (§4) — same role, not a new one.
- **Business Manager** — genuinely new, not previously named in `PHASE_4` §4's ten. Institutional quotation approval (§8) is a higher-trust responsibility than general order support, and doesn't fit cleanly inside Support Staff's scope. This phase formalizes Business Manager as an eleventh role, extending rather than revising `PHASE_4` §4.
- **Marketing** (mentioned in §2) — deliberately *not* resolved into a new role here. Coupon/promotion changes have direct financial impact, unlike a blog edit, so whether Marketing responsibilities fold into Content Editor or need their own role is a genuine open decision, not something to assume silently. Flagged for `PHASE_4A` §12's Decision Framework before it's built, not decided by default in this document.

**Approval rights (illustrative, not exhaustive):**

| Action | Proposed by | Approved by |
|---|---|---|
| Product price change | Admin | Admin (no separate approval today) |
| Quotation issued to a business contact | Business Manager | Admin |
| Policy page edit | Content Editor | Admin (once the review workflow in §4 exists) |
| Manual order status override | Support Staff or Warehouse Staff | Logged automatically (§3); no separate approval gate, but always auditable |
| Role assignment | Admin | Super Admin (once that role exists — `PHASE_4` §4) |

---

## 11. Integrations

**The established pattern to extend, not reinvent:** shipping and messaging are already provider-agnostic — a `SHIPPING_PROVIDER` / `MESSAGING_PROVIDER` configuration switches between Shiprocket/Delhivery/BlueDart/DTDC or Twilio/MSG91/Interakt/WhatsApp Business without touching call sites. This is the working precedent every future integration follows: swappable behind one interface, never hardcoded to a vendor's specific shape.

| Integration | Status | Boundary |
|---|---|---|
| Payment Gateway | Live (Razorpay) | Single-provider today; the abstraction pattern above is the template if diversification is ever needed |
| Shipping | Live, provider-agnostic | Already correct — the reference pattern |
| Email | Live (Resend) | Single-provider today |
| SMS / WhatsApp | Live, provider-agnostic | Already correct — the reference pattern |
| Analytics | Not yet wired | Gap, not a design decision |
| SEO | Code-level (`lib/seo.ts`), not a third-party integration | — |
| ERP / CRM / Marketplace / Accounting / AI | Future | Each integrates through the existing `services/` layer (`PHASE_1` §2) — reading/writing through the same functions the admin UI uses, never a direct-DB integration that could drift from one source of truth |

**Integration boundary principle:** every integration is either outbound-triggered by a domain event (order placed → payment call; order shipped → carrier call; order confirmed → email/SMS) or inbound via a verified webhook (payment confirmed, shipping status updated) — never something a customer or admin waits on synchronously longer than necessary, and never a second source of truth for data the platform already owns.

---

## 12. Security Architecture

**Authentication:** session-based (JWT strategy), credentials plus optional OAuth — already live.

**Authorization:** centralized role checks (`requireStaff`/`requireAdmin`/`requireCustomer`-style functions) rather than permission logic scattered per route — already the real, correct pattern, specifically so a role rule only ever has to change in one place.

**Audit Logs:** §3, extended here to security specifically — who logged in, who changed a role, who accessed sensitive customer or business data.

**Role Permissions:** §10.

**Customer Privacy / Business Privacy:** access scoped strictly by role (§7); a business's GST and company details are held to the same protection standard as an individual's personal data — "it's a business, not a person" is never a reason to relax a privacy standard.

**Data Integrity:** the snapshot pattern already used for `OrderItem`, order addresses, and (per §9) media references is itself a security-adjacent discipline — history can't be silently altered by editing a live record after the fact.

**Media Security:** signed uploads — the Cloudinary API secret never reaches the client; every upload is authorized server-side with a short-lived signature. Already the live pattern, not a proposal.

**Admin Security:** every staff-only route gated by role at the Server Component/Action level, not by hiding a link in the UI and hoping no one finds the URL.

**API Security:** every inbound webhook (payment, shipping) must verify its signature before acting on the payload — a hard requirement to audit against, flagged here explicitly rather than assumed already complete.

**Backups:** a real requirement to confirm and formalize (likely a managed-database-provider concern) — not something this document has evidence is configured, and not something to assume exists by default.

**Disaster Recovery:** a recovery point objective and recovery time objective should be explicitly defined once the platform is in production — stated here as the *category* of decision needed, not a fabricated number this document has no basis to set.

---

## 13. Platform Principles

- **Everything Auditable** — every consequential change carries a who/when/what record (§3, §12).
- **Everything Traceable** — an order's, a customer's, or a content item's full history should be reconstructable end to end without guessing "what actually happened."
- **Everything Editable** — restated from `PHASE_4B` §6/§11 as a platform-wide, not only CMS-specific, commitment.
- **No Duplicate Data / One Source of Truth** — the principle every prior phase has already converged on, restated once more because it governs every domain boundary in §2.
- **Automation Where Possible, Manual Override When Necessary** — the platform defaults to automatic (status transitions, notifications) but never traps an operator without an escape hatch when reality diverges from the system's assumptions (§6).
- **Scalable** — every operational surface, especially admin list/table views, is designed for 500+ products and a growing role set, not today's small catalog (`PHASE_1`, `PHASE_4A`).
- **Reliable** — concretely: an order is never silently lost between placement and fulfillment, not merely "the server doesn't crash."
- **Secure** — §12's full discipline, applied by default, not audited in after the fact.
- **Future-Ready** — every capability in `PHASE_4` §11 is reachable through addition to this platform, never a rewrite of it.

---

## 14. Operational Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Inventory mismatch** | Site shows stock the warehouse doesn't have — broken promise, refund/cancellation cost, trust damage | `StockHistory`'s existing audit trail plus real-time deduction at order placement, never batch-reconciled after the fact |
| **Order failure** | Payment succeeds but the order record fails, or vice versa — lost revenue or an uncharged customer receiving goods | `PaymentAttempt` as a distinct, retry-safe record from `Order` (§6); payment status vs. order status treated as a first-class reconciliation check, not an assumption |
| **Media loss** | An asset referenced by a live product disappears from storage — broken images at the worst possible moment, mid-purchase | Cloudinary as durable storage + `MediaAsset` as an audit index specifically to detect drift (§9) |
| **Permission errors** | A role granted more or less access than intended — either a security exposure or an operational bottleneck | Centralized RBAC (§12) rather than scattered per-route checks; the approval matrix (§10) reviewed explicitly, never assumed correct by default |
| **Data inconsistency** | `Order.status` and `Shipment.status` drift apart — admin and customer see contradictory information | Status transitions owned by one service function (§6), never updated independently by two different code paths |
| **Slow admin** | As product/order count grows past 500+, admin screens degrade — directly undermines §1's "operations support customer experience" | The Scalable First discipline (`PHASE_1`/`PHASE_4A`) applied specifically to admin views, not only the storefront |
| **Security breach** | Catastrophic, compounding trust damage (`PHASE_3` §7 — trust compounds slowly, spends instantly) | §12's full discipline: signature verification, least-privilege roles, audit logging |
| **Operational bottlenecks** | One broad `STAFF` role today (`PHASE_4` §4) means the platform's ability to operate depends on a small number of people who can do anything | The role-splitting roadmap already committed to in `PHASE_4` §4, sequenced through `PHASE_4A`'s version roadmap — not a new mitigation, the existing plan executed |

---

## 15. Platform Constitution

Binding on every future backend, CMS, admin, and operations decision:

1. The platform is the backstage that makes every customer-facing promise real — never treated as less important than the storefront simply because customers don't see it directly.
2. Every consequential change is attributable to who made it and when. Auditability is not optional, retrofitted, or role-dependent.
3. Inventory, orders, and customer data each have exactly one owning system of record. No domain reads a shadow copy of another domain's truth.
4. Status transitions happen in one place, enforced by the service layer — never left to an admin screen's own judgment about which button should be clickable.
5. Every integration is provider-swappable behind one interface, never hardcoded to a single vendor's shape.
6. A manual override is always possible, and always logged.
7. Security and privacy protections apply equally to consumer and business data.
8. Nothing is deleted that would break the integrity of past history — archived, not erased, wherever order or financial history depends on it.
9. The platform scales by addition, never by rewrite.
10. Automation is the default; a human is never locked out of correcting what automation gets wrong.

---

## 16. Approval Checklist

Every future backend, CMS, admin, or operations feature must confirm, before implementation:

- [ ] Does this respect one source of truth, or does it introduce a second copy of data another domain already owns (§2)?
- [ ] Is every consequential change this introduces auditable (§3, §12)?
- [ ] Does it fit an existing role's responsibilities, or does it require an explicit role/permission decision (§10) rather than a silent assumption?
- [ ] If this is a new integration, is it built behind a swappable interface, not hardcoded to one vendor (§11)?
- [ ] Does it preserve historical integrity — snapshots, archiving — rather than letting a live edit silently rewrite the past (§6, §9)?
- [ ] Has a relevant operational risk (§14) been considered, with a real mitigation, not just noted and ignored?
- [ ] Does it remain compatible with `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md`, and `PHASE_4B_INFORMATION_ARCHITECTURE.md`?
- [ ] Does it violate any article of the Platform Constitution (§15)? If so, it does not proceed, regardless of deadline pressure.

---

## Deliverables Checklist

1. ✅ Platform Philosophy — §1
2. ✅ Operational Architecture — §2
3. ✅ Admin Architecture — §3
4. ✅ CMS Architecture — §4
5. ✅ Product Management Architecture — §5
6. ✅ Order Management — §6
7. ✅ Customer Management — §7
8. ✅ Business Operations — §8
9. ✅ Media Architecture — §9
10. ✅ User Roles & Permissions — §10
11. ✅ Integrations — §11
12. ✅ Security Architecture — §12
13. ✅ Platform Principles — §13
14. ✅ Operational Risks — §14
15. ✅ Platform Constitution — §15
16. ✅ Approval Checklist — §16

**No UI. No wireframes. No design. No frontend. No code. No components. No colours. No typography. This is the operational blueprint for every internal system — frozen pending approval.**
