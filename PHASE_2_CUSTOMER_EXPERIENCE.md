# MUV™ — Phase 2: Customer Experience Blueprint
### Version 1.0 · Status: DRAFT — awaiting approval
### Companion to `PHASE_1_ARCHITECTURE.md` (frozen, binding)

> This document defines how a customer experiences MUV before a single page is visually designed. It contains no UI, no wireframes, no code. Where it references existing patterns from the live storefront (Hero, Shop by Category, Featured Products, Why Choose MUV), those references validate that the shipped work already aligns with the reasoning below — they are cited as evidence, not as a substitute for the strategic thinking this document exists to capture.

---

## 1. Customer Experience Philosophy

MUV sells products people use to clean, care for, and maintain the things they're responsible for — their home, their family, their fabric, their car, their business premises. That is inherently unglamorous category territory. The brand's entire wager is that this category deserves the same emotional craft as skincare or fashion — "an affordable luxury from India," not a commodity aisle.

**"Keep Muving™" is not a slogan — it is the design principle for every stage below.** It means: the customer is always moving forward, never stalled, never made to wait on an unanswered question, never forced to backtrack. A stall — a dead-end search, a cart that adds a surprise cost, an order with no visible status — is the one experience failure mode that directly contradicts the brand's name. Every section in this document is, underneath, an answer to "where could this customer stall, and how do we keep them moving."

| Stage | Feeling | MUV must... | The moment breaks if... |
|---|---|---|---|
| **Discover** | Curious | Answer "what is this, and is it for someone like me" within seconds — MUV's five-category breadth (Home, Fabric, Body, Personal, Car) is unusual for a single brand and must read as *range*, not *confusion* | The visitor can't tell if this is a home-goods brand, a skincare brand, or something else, and leaves before finding out |
| **Interested** | Intrigued, mildly skeptical | Resolve the tension in "affordable luxury" fast — premium visual craft *and* visible, un-hidden pricing, in the same glance | Pricing feels hidden or the visual polish makes the visitor assume it's out of their budget before they check |
| **Trusting** | Reassured | Back every claim with something specific and real — real photography, real ingredients, real HSN/GST detail, real (or honestly absent) reviews | A claim reads as generic marketing language with nothing concrete behind it |
| **Confident** | Ready | Remove every unknown between "I want this" and "I bought this" — stock status, delivery estimate, total cost, return terms, all visible before commitment is asked for | The customer discovers a cost, a delay, or a policy detail *after* they've already committed emotionally |
| **Satisfied** | Delighted | Match the unboxing and the product performance to the premium promise made on-site | The physical product or packaging undersells what the site promised |
| **Loyal** | Dependable relationship | Make reordering effortless and make quality *identical* every time — for a care/cleaning brand, consistency is the loyalty driver, not gamified engagement | A repeat customer has to re-shop from scratch, or a reorder isn't quite the same product they trusted last time |

This is the lens every later section is evaluated against: **does this decision help the customer keep moving toward the next stage, or does it risk a stall.**

---

## 2. Customer Personas

MUV serves two structurally different buyer populations, not nine variations of one. Recognizing this split is the single most important strategic fact in this document — it will shape navigation, product presentation, checkout, and trust signaling differently for each half.

- **Consumer (B2C):** buys for personal/household use, decides emotionally first and rationally second, purchases in units of one.
- **Institutional (B2B):** buys for a business or facility, decides rationally first (cost, reliability, compliance) with brand feeling as a tiebreaker, purchases in bulk and repeats on a schedule.

### B2C — Consumer Personas

#### Home Users
- **Goals:** Find something effective and pleasant to use without a research project. Want the *category* decided quickly (which detergent, which body wash) so they can move on with their day.
- **Pain Points:** Facing five product categories from one brand feels like it *should* take longer to evaluate than it wants to. Decision fatigue if the site makes them compare too much.
- **Buying Behaviour:** Discovery- and fragrance-led browsing, single-unit or small-pack purchases, price-aware but not price-first — will pay a premium for something that *feels* like a small daily treat rather than a chore.
- **Trust Factors:** Real product photography, a handful of genuine reviews, ingredient visibility.
- **Decision Drivers:** "Does this feel like a treat, not a chore?" Sensory appeal (fragrance, packaging) outweighs spec-sheet detail.

#### Families
- **Goals:** Stock the household efficiently, trust one brand across *multiple* categories at once so they don't have to separately vet a detergent brand, a body wash brand, and a floor cleaner brand.
- **Pain Points:** Safety anxiety around chemicals with kids/pets in the house. Running out unexpectedly. Juggling several household budgets against one shopping trip.
- **Buying Behaviour:** Larger pack sizes, cross-category basket-building in a single order (this is where MUV's five-category range becomes a genuine strength — one trusted checkout for the whole home, not five separate brand relationships). Repeat-purchase mentality once trust is established.
- **Trust Factors:** Safety/dermatological-testing claims, family-oriented language and imagery, consistent quality across every category they've bought into.
- **Decision Drivers:** "Will this be safe and reliable enough that I stop having to think about it?" Trust, once earned, transfers *across* MUV's categories — which is also the biggest risk if a single product disappoints.

### B2B / Institutional Personas

#### Hotels
- **Goals:** Consistent guest-facing experience quality at scale, predictable cost-per-room, frictionless reordering without renegotiating terms each time.
- **Pain Points:** A stockout disrupts housekeeping operations directly. Batch-to-batch inconsistency is a guest-experience risk, not just a product complaint. Procurement approval adds internal friction.
- **Buying Behaviour:** Bulk sizes (5L–20L), scheduled recurring orders. The buyer is a procurement/purchasing manager, evaluating on reliability and total cost — not the end guest, and not sensory delight.
- **Trust Factors:** Visible HSN/GST compliance, transparent bulk pricing, demonstrable delivery reliability, business references.
- **Decision Drivers:** "Will this reduce my operational risk and cost, predictably, every month?"

#### Restaurants
- **Goals:** Hygiene-compliant cleaning and hand-wash products, fast turnaround, formulations that won't transfer odor into food-prep areas.
- **Pain Points:** Health-inspector compliance exposure. Thin margins mean price volatility is a real operational threat, not an inconvenience.
- **Buying Behaviour:** Frequent, smaller-bulk reorders (cash-flow-constrained relative to hotels' longer capital cycles).
- **Trust Factors:** Clear labeling and HSN codes for compliance audits, food-safety-adjacent formulation clarity.
- **Decision Drivers:** "Will this pass inspection and not disrupt service?"

#### Hospitals
- **Goals:** Infection-control-grade cleanliness, documented regulatory compliance, zero tolerance for product inconsistency (a liability and safety issue, not a quality complaint).
- **Pain Points:** Formal procurement processes that a self-serve ecommerce checkout may not fully satisfy — this persona may need to reach a *quotation or business-inquiry* step rather than an instant checkout.
- **Buying Behaviour:** High-volume, long-term contracts; likely requires documentation (safety data sheets, certifications) before a purchasing decision is even made.
- **Trust Factors:** Ingredient disclosure, safety documentation, evidence of clinical/dermatological testing.
- **Decision Drivers:** Risk mitigation above all. For this persona specifically, the website's job may be to generate a **qualified business inquiry that a human then closes**, not to force a self-serve cart-and-checkout flow that doesn't match how hospitals actually procure.

#### Offices
- **Goals:** Maintain a clean, professional workplace cheaply and with minimal ongoing effort.
- **Pain Points:** Facilities budgets are small and scrutinized. No desire to "shop" or browse — this persona wants the fastest possible path to *reordering the same short list*.
- **Buying Behaviour:** Narrow, repeat SKU list; infrequent decision-making (the choice is made once, then set-and-forget via reorder).
- **Trust Factors:** Fast, reliable delivery; clean GST invoicing for expense reporting.
- **Decision Drivers:** Price-per-unit and reorder speed — not discovery.

#### Car Wash Businesses
- **Goals:** Commercial-grade cleaning performance at volume pricing; the product must work *fast* per vehicle, not just eventually well.
- **Pain Points:** Thin, volume-dependent margins. Product performance directly affects *their* customers' satisfaction and repeat business.
- **Buying Behaviour:** Bulk, narrowly focused on the Car Care category — unlike Families, this persona doesn't cross-shop MUV's other verticals.
- **Trust Factors:** Demonstrable performance (before/after evidence), stable bulk pricing.
- **Decision Drivers:** "Does this measurably speed up or improve my service?"

#### Laundry Businesses
- **Goals:** Stain-removal efficacy at scale, fabric safety across diverse textile types (damaging a customer's garment is a liability, not a returns-desk issue), predictable cost-per-wash.
- **Pain Points:** Liability exposure from any product inconsistency; needs confidence a new batch behaves identically to the last.
- **Buying Behaviour:** Very large bulk (20L+), likely the highest order volume and frequency of any persona, contract-style recurring purchasing.
- **Trust Factors:** Proven fabric safety, batch-to-batch consistency, ideally technical/data-sheet-level detail.
- **Decision Drivers:** "Will this behave identically every single time?"

#### Bulk Buyers
- **Goals:** Best unit economics at large quantity, a straightforward way to *place* a large order without ecommerce friction (most sites penalize bulk quantity rather than rewarding it).
- **Pain Points:** Typical ecommerce UX assumes small quantities — stock caps, no visible bulk-tier pricing, cart mechanics that make ordering 50 units of one SKU tedious or impossible.
- **Buying Behaviour:** One-off large purchases (events, gifting, resale) rather than a recurring institutional relationship.
- **Trust Factors:** Transparent bulk pricing tiers, honest lead-time communication, a visible path to human support for large orders.
- **Decision Drivers:** "Is buying a lot from MUV *easier* than buying a little, or harder?"

### The Strategic Implication

Every B2C persona above is served well by the shipped homepage sequence (Hero → Category → Featured Products → Trust). Every B2B persona needs a **parallel, clearly-signposted path** — not a separate site, but a consistently reachable entry point (navigation and footer, per §4) that leads toward bulk pricing, business-relevant trust signals (HSN/GST, consistency, documentation), and — for the highest-stakes personas (Hospitals, Laundry) — a graceful off-ramp to a human conversation rather than a forced self-serve checkout that doesn't match how they actually buy.

---

## 3. User Journey Mapping

`Google Search → Landing Page → Homepage → Category → Product → Cart → Checkout → Order Tracking → Repeat Purchase`

| Step | Customer's unspoken question | Emotional state | Stall risk |
|---|---|---|---|
| **Google Search** | "Is there a premium Indian brand for [this need]?" | Task-focused, mildly skeptical of anything that reads as an ad | Search result snippet/title doesn't match the actual need, so the click never happens |
| **Landing Page** | "Did I land somewhere legitimate?" | Snap judgment — this is the single highest bounce-risk moment in the entire journey | First screen doesn't visually and immediately signal "real, premium, relevant" |
| **Homepage** | "What does this brand actually sell, and is it for me?" | Curious but impatient | Category breadth reads as confusion instead of range (see §1) |
| **Category** | "Which of these is right for my specific need (fragrance, size, use-case)?" | Comparing, wants efficient narrowing, not more browsing | Filtering doesn't match how the customer actually thinks (size in litres vs. "for a big household") |
| **Product** | "Will this work, is it safe, is it worth this price?" | Evaluating risk before spending money | Claims read as generic; no concrete evidence to resolve doubt |
| **Cart** | "Did I get a fair deal? Do I need anything else? Can I trust what happens next?" | Last-minute doubt — the highest abandonment-risk moment after landing | A cost, delay, or requirement appears here that wasn't visible earlier |
| **Checkout** | "Is my payment safe? When will this arrive? What if something goes wrong?" | Vigilant, wants speed and reassurance *simultaneously* | Forced account creation, unclear delivery date, or a validation error that loses already-entered information |
| **Order Tracking** | "Is it actually coming? Did they forget about me?" | Anticipation that erodes into anxiety the closer the promised date gets without an update | Status only checkable by the customer proactively digging, never pushed to them |
| **Repeat Purchase** | "Should I re-evaluate, or can I just trust this again?" | Either loyal-and-efficient, or — if the first experience was merely fine, not great — back to square one | Reordering requires re-browsing instead of one click from history |

**A second, parallel journey exists for institutional personas** (§2): it diverges at *Category/Product* — where a B2C visitor sees "Add to Cart," a Hospital or Laundry-business visitor needs a path toward bulk pricing and, for the highest-compliance personas, a business inquiry rather than an instant transaction. This parallel path rejoins the main journey at Checkout for personas that *can* self-serve (Hotels, Restaurants, Offices, Car Wash, Bulk Buyers) and exits to a human-assisted process for personas that need it (Hospitals, large Laundry contracts).

---

## 4. Navigation Philosophy

- **Primary Navigation:** Category-first (Home / Fabric / Body / Personal / Car Care), matching how both B2C and B2B personas already think about their need. A category with no products yet (e.g., Skin Care) still appears — visibly labeled as upcoming — rather than being hidden, so it builds anticipation instead of becoming a dead click. *(This is the already-shipped "Muving in soon" pattern — cited here because it's the correct instance of a broader rule: never let a navigation item lead nowhere.)*
- **Secondary Navigation:** Within-category refinement only (fragrance, size, use-case) — never a second competing taxonomy. Refinement, not re-navigation.
- **Footer Navigation:** The trust-and-continuity layer — company story, policies, support, *and* the primary entry point for the institutional/bulk journey ("For Business" or equivalent), since procurement personas don't think of themselves as "shop" visitors and won't look in the primary nav for a bulk-ordering path.
- **Quick Actions:** Search, Wishlist, Cart, Account — persistent and always one tap away, never buried in a menu. These represent the four things a returning, decided customer needs immediate access to.
- **Mobile Navigation:** Collapses to a single reachable control cluster in the natural thumb zone (see §11) rather than shrinking the desktop nav — mobile is the primary surface for this brand's market, not a secondary adaptation.
- **Search Placement:** Prominent, not a magnifying-glass icon buried in a corner. Many visitors already know exactly what they want ("floor cleaner," a fragrance name) and search is faster for them than taxonomy browsing — search is a first-class navigation method here, not a fallback.
- **Breadcrumb Strategy:** Shop / Category / Product, always visible on deep pages. With five distinct verticals under one brand, breadcrumbs are what keeps a customer oriented when they arrive on a product page directly from search rather than by browsing down from the homepage.
- **Account Entry Points:** Visible but never a gate — browsing and even guest checkout must never require login. For B2B personas, account value (order history, saved GST details, fast reorder) should be *evident*, not assumed; the account entry point is where that value gets communicated, not just where login happens.

---

## 5. Homepage Experience

**Purpose:** The homepage is not a product catalogue. It is a trust-and-orientation device with one job: answer "what is MUV, and is it for me" within a single scroll, then route two different intents — *casual browsing* and *purposeful shopping* — toward their respective next step without making either wait on the other.

**Information Hierarchy** (and why, in this order):
1. **Brand promise** — an emotional hook, not a product spec. First impression must resolve legitimacy and premium positioning before anything else is asked of the visitor.
2. **Category orientation** — "which of these five is relevant to me." This is the resolution to the single biggest risk identified in §1: five categories under one brand reading as confusion instead of range.
3. **Curated proof** — concrete products, not abstract claims. This is where "premium" gets tested against something real and priced.
4. **Trust reinforcement** — *after* desire has been created, not before, reduce whatever doubt remains before asking for a decision.
5. **A low-commitment off-ramp** (footer/newsletter) — for the visitor who isn't ready to buy today. Losing them silently is worse than giving them a reason to stay in touch.

*(This hierarchy matches what's already shipped — Hero → Shop by Category → Featured Products → Why Choose MUV → Footer — cited here as validating evidence for the reasoning, not as a substitute for it.)*

**Storytelling Flow:** Aspirational opening (who MUV is) → tangible proof (what MUV actually makes) → rational reassurance (why trust the claim) → invitation to continue the relationship even without a purchase today.

**Trust-Building Sequence:** Emotional trust first (visual craft signals competence before a single word is read), then category-breadth trust (this brand covers real range, not a single gimmick product), then product-level evidence (specific, real proof), then an explicit reassurance module once genuine trust content exists to put there.

**CTA Strategy:** No single hard-sell moment. Multiple *soft* invitations, each matched to a different readiness level — a primary "Shop the range" CTA for the visitor ready to browse, category tiles as an implicit CTA for the undecided, product-level "Add to Cart" for the convinced, and a newsletter capture for the not-yet-ready. Never force a decision before the visitor has enough information to make it comfortably.

**Scrolling Logic:** Every section should create the reason to keep scrolling, not just present information — the hero creates intrigue, categories create "which one is me," featured products create desire, the trust section resolves what's left of the doubt, and the footer offers continuity instead of a hard stop.

**Decision Points:** The moments where a visitor silently decides "keep going" or "leave" sit right after the hero (is this legitimate and relevant to me), right after categories (did I find mine), and right after featured products (did something specific catch my interest). Each of these is where attention is most fragile.

**Exit Prevention:** Never through urgency countdowns, exit-intent popups, or manufactured scarcity — those contradict "elegant, modern, premium, minimal" and would read as desperate against this brand's positioning. Instead, exit prevention means *no section is allowed to end on an unanswered question* — the newsletter section functions as the genuine "soft catch" for an undecided visitor, so leaving without buying doesn't have to mean leaving the relationship entirely.

---

## 6. Collection Experience

- **Filtering Philosophy:** Filter by what the customer thinks in — size, fragrance, use-case — never by internal SKU or database structure. For bulk-relevant categories, larger sizes should be discoverable, not buried at the bottom of an alphabetically/numerically sorted list a Home User would never scroll to.
- **Sorting Philosophy:** Default to curated ("Featured"), not price-ascending. Leading with the cheapest item anchors the whole category around price and undercuts the premium positioning before the customer has evaluated anything else.
- **Search Strategy:** Forgiving — matches fragrance names, use-case phrases ("floor cleaner" vs. "surface cleaner"), and partial/misspelled terms, not just exact product names.
- **Zero-Result Handling:** Never a dead end. A search or filter combination with nothing to show should immediately offer the nearest adjacent path (related category, cleared filters) — the literal application of "Keep Muving" to a failure state: a stall is the one outcome the brand name explicitly promises not to be.
- **Empty States:** A category with no products yet (or a "coming soon" vertical) should build anticipation, not feel like a broken page — consistent with the already-shipped pattern of labeling upcoming categories rather than hiding them.

---

## 7. Product Detail Experience

**Ideal information order — what the customer should learn, in sequence:**

1. **What it is, and who it's for** — name, category, real photography. Pure orientation.
2. **Why it's worth the price** — the short, specific benefit (a real USP, not marketing filler) *before* the customer has to scroll for it.
3. **Price and size options** — the concrete decision inputs, including bulk sizes where relevant, visible without hunting.
4. **Trust signals** — rating (only when genuine reviews exist), and for the institutional reader specifically, HSN/GST detail that signals a compliant, legitimate business.
5. **Deep content** — ingredients, directions, full description — for the deliberate reader who wants to verify before committing.
6. **Social proof** — reviews, positioned as the last reassurance before the decision, not the first thing thrown at an undecided visitor.
7. **The purchase action itself** — reachable at every point in this sequence, not just at the bottom. A returning, already-confident customer shouldn't have to scroll past reassurance they don't need.

**Questions the page must answer, unprompted:** Is this right for my specific need (size, fragrance, skin type)? Is it safe? What does it cost for the amount I actually need? How fast will it arrive? Can I return it if it's wrong?

**How trust is built here specifically:** through *specificity* — real photography instead of stock imagery, real ingredient disclosure, visible HSN/GST rather than hidden compliance detail, and reviews that are either genuine or honestly absent (never fabricated, never incentivized into bias — the same discipline already applied to product USP copy, extended to reviews).

**When the purchase decision should happen:** As early as the *confident* customer wants it to (the action is always reachable), while the *first-time or skeptical* customer is never forced to commit before they've had the chance to scroll for the reassurance they specifically need. The page serves both without making either wade through what they don't.

---

## 8. Cart Psychology

The cart is where trust that was built across the whole journey gets tested one final time — it is the highest-leverage moment for both confidence and abandonment.

**What reduces abandonment:** The cart must feel like a *held decision*, not a fresh negotiation. Nothing should be introduced here that wasn't already knowable — no surprise shipping fee, no new required step, no re-litigating whether the purchase is a good idea via aggressive cross-sell.

**What increases confidence:** Visible savings (price vs. MRP), unambiguous stock status, and *visible progress toward a benefit* — a free-shipping threshold bar the customer is actively closing in on is reassurance and forward momentum in one element, not a growth-hack — this is already shipped and is a genuine, correctly-placed application of the "Keep Muving" principle: the customer sees themselves progressing, not stalling.

**What reassures users:** A coupon field that's available but doesn't demand attention (present, not pushy), and stock/delivery information that removes ambiguity before checkout even starts.

**What should never interrupt checkout, once a customer has decided to proceed:** A forced account-creation gate, a surprise upsell modal, or re-authentication friction. The cart→checkout transition is the single most fragile moment in the funnel — anything added here that wasn't expected reads as a stall, and a stall here is the most expensive one in the entire journey to recover from.

---

## 9. Checkout Experience

- **Guest vs. Account Checkout:** Guest checkout is always available — it must never be a gate, especially for first-time B2C buyers making a low-commitment single purchase. Account creation is offered as a clearly-valuable *option* (order tracking, faster reorder, saved details) rather than a requirement. For institutional buyers, the account's value (recurring order history, saved GST/business details) should be made obvious enough that they *want* one — persuasion, not obligation.
- **Progress Indicators:** Always show where the customer is (address → payment → review) and how much remains. This is "Keep Muving" made literal at the moment anxiety is highest — visible forward progress is itself reassurance.
- **Validation Strategy:** Real-time, inline, and specific ("this pincode isn't serviceable yet" — not "invalid input"). A customer should never reach the payment step only to be bounced back by something that could have been caught three fields earlier.
- **Error Recovery:** An error must never cost the customer their already-entered information. Recovering from a mistake should feel like a quick correction, not a restart — a restart at checkout is very close to a guaranteed loss of the sale.
- **Payment Confidence:** Recognizable payment methods, a clear statement of what happens if a payment fails (nothing silently lost), and security communicated through calm clarity rather than fear-based badges or urgency — which would read as inconsistent with an elegant, premium brand tone.
- **Shipping Clarity:** Delivery estimate and full cost breakdown shown *before* payment is requested, never revealed as a surprise afterward. For every persona, but especially the institutional ones, cost transparency (including tax) is itself a trust signal, not just a courtesy.

---

## 10. Post-Purchase Experience

- **Order Success:** An immediate, unambiguous confirmation that feels like reaching a milestone, not just receiving a receipt — this is the moment the "Satisfied" stage from §1 formally begins.
- **Tracking:** Proactive status communication, not a page the customer has to remember to go check. The anxiety identified in §3's journey map ("is it actually coming, did they forget about me") is resolved by MUV reaching out, not by the customer having to dig.
- **Email Flow:** Order confirmation → shipping notification → delivery confirmation → (once the customer has actually had time to use the product) a review request → a reorder reminder timed to the product's realistic consumption cycle. That last step is "Keep Muving" in its most literal form — never letting a customer run out and have to re-decide from zero what should already be a habit.
- **Review Requests:** Timed *after* genuine usage time has passed, not immediately at delivery — asking too early produces low-quality or no reviews. Collection must stay genuine and never incentivized into bias, consistent with the standing discipline against fabricated trust signals.
- **Reorder Journey:** The single highest-leverage moment for loyalty. A repeat customer already knows what they want — reordering should be effectively one action from order history, never a re-browse from the homepage.
- **Customer Loyalty:** For a care and cleaning brand, the actual loyalty driver is *consistency* — the same quality, every single time — not points, streaks, or gamified engagement mechanics, which would read as off-brand and juvenile against MUV's premium positioning. Trust, once earned, is what gets renewed at each reorder; it isn't manufactured through game mechanics.

---

## 11. Mobile Experience Principles

For an India-based D2C brand, mobile is not the secondary experience adapted from desktop — it is very likely the *primary* surface most customers ever use, and should be treated as the design baseline, with desktop treated as the expanded canvas rather than the reference point.

- **Thumb Reach:** Primary actions — cart, wishlist, add-to-cart, navigation — live within comfortable one-handed reach, not spread to corners that require a re-grip.
- **Fast Browsing:** Category and product grids load progressively; images are sized to the surface they're shown on, never a desktop-sized asset shrunk down at the customer's data expense.
- **Easy Checkout:** Minimize typing wherever a selection can replace it — saved addresses, size/quantity as taps rather than typed numbers, appropriate keyboard types for phone and pincode fields.
- **Reduced Typing:** Prefer selection over free text everywhere the option space is finite — this is a direct extension of the checkout validation philosophy in §9, applied specifically to the constraints of a touch keyboard.
- **Performance Priorities:** On mobile, perceived speed *is* trust — a slow-loading premium brand reads as a contradiction. Performance is treated as a trust signal here, not only a technical metric (ties directly to `PHASE_1_ARCHITECTURE.md` §9's performance strategy).

---

## 12. Accessibility Experience

Accessibility is treated as baseline experience quality, not a compliance checkbox — and stays fully compatible with the rules already frozen in `PHASE_1_ARCHITECTURE.md` §12.

- **Keyboard Users:** Every interactive element must be reachable and operable by keyboard alone, in a logical order, with a visible focus state distinct from hover — this is Phase 1's Project Rule 7, restated here as a customer-experience requirement, not just an engineering one.
- **Screen Readers:** Meaningful, descriptive image text (product photography described by what it actually shows, never a filename), semantic structure, and labels on every icon-only control.
- **Contrast:** WCAG AA minimum across every surface — already an audited, enforced standard per Phase 1's color system.
- **Touch Targets:** Comfortably sized tap areas everywhere, especially on the mobile surface this brand's customers primarily use.
- **Readable Typography:** Constrained line length, generous line-height, and — critically for an ecommerce brand — never encoding essential meaning (like stock status) in color alone; it must always be paired with a text label.
- **Inclusive Design:** As a body and personal care brand, imagery and language must not assume a single body type, gender, or family structure. As a brand also serving institutional procurement staff (who may be evaluating on behalf of an organization, not as an end-user, and not always as a native English speaker), copy should favor clarity over cleverness throughout — a principle that also directly serves the B2C personas in §2.

---

## 13. Trust Architecture

**Where trust is built:** Continuously, at every touchpoint — not confined to a single "trust section." Real photography versus stock imagery, a working link versus a dead end, accurate stock status versus overselling, an honest badge versus an inflated claim: each of these either adds to or quietly withdraws from the same trust account across the entire journey.

**How MUV communicates quality:** Through *specificity*, not adjectives. A real ingredient list, real HSN/GST detail, a real USP drawn from actual product content — never vague "premium quality" language standing in for evidence. This is already the operating discipline behind the shipped product-card USP system and should be understood as the brand's general trust principle, not a one-off implementation detail.

**How "Keep Muving™" should appear naturally:** As an emotional throughline expressed *through the experience* — visible forward progress in the cart, a search that always offers a next step instead of a dead end, a reorder reminder that arrives before the customer runs out — not merely as a badge printed in the navigation. The tagline should be *earned* by moments that actually embody momentum (an order shipping, a reorder made effortless), not only decorative brand chrome.

**What reassures a first-time buyer specifically:** Clear return and replacement terms, genuine reviews (or an honest absence of any, rather than fabricated ones), fully transparent pricing, and visible signs of real business legitimacy (GST/HSN detail, real company information in the footer). A first-time buyer has the least context of anyone in the journey and needs the most explicit reassurance — this matters especially for a brand whose "affordable luxury" positioning could otherwise read as "too good to be true" without concrete evidence to back it.

---

## 14. Success Metrics

Each metric below maps to a stage from §1 — a UX goal without a stage it's meant to move the customer through isn't a useful metric.

| Metric | Maps to stage | What it reveals |
|---|---|---|
| Time to first product view | Discover → Curious | Is navigation/search efficient, or is the customer wandering |
| Search success rate (search → product view, not zero-result) | Curious | Is search actually forgiving and useful, per §6 |
| Category-to-product click-through | Curious → Interested | Are category pages helping people find their fit |
| Add-to-cart rate | Interested → Trusting | Is the product page resolving doubt (§7) |
| Cart-to-checkout rate | Trusting → Confident | Where hesitation concentrates — the highest-risk transition in §8 |
| Checkout completion rate (segmented: guest vs. account, mobile vs. desktop) | Confident | Is checkout actually frictionless, per §9, for every real segment |
| Bounce rate on first-touch landing pages | Discover | Is the very first impression resolving legitimacy fast enough (§3) |
| Repeat purchase rate + time-between-orders | Satisfied → Loyal | Is MUV actually delivering on the reliability "Keep Muving" implicitly promises |
| Review submission rate | Satisfied | A proxy for genuine post-purchase satisfaction and willingness to engage |
| Business/bulk inquiry conversion (tracked separately from standard checkout) | Institutional journey (§2–3) | The institutional personas' conversion event is often "qualified inquiry," not "order placed" — this must be measured as its own funnel, not folded into consumer checkout metrics |
| Core Web Vitals / keyboard-navigability audit pass rate | Cross-cutting | Ties performance and accessibility (§11–12) back to the standing engineering rules in `PHASE_1_ARCHITECTURE.md` §9 |

---

## Deliverables Checklist

1. ✅ Customer Experience Philosophy — §1
2. ✅ Customer Personas (9, across B2C and B2B) — §2
3. ✅ User Journey Mapping — §3
4. ✅ Navigation Philosophy — §4
5. ✅ Homepage Experience — §5
6. ✅ Collection Experience — §6
7. ✅ Product Detail Experience — §7
8. ✅ Cart Psychology — §8
9. ✅ Checkout Experience — §9
10. ✅ Post-Purchase Experience — §10
11. ✅ Mobile Experience Principles — §11
12. ✅ Accessibility Experience — §12
13. ✅ Trust Architecture — §13
14. ✅ Success Metrics — §14

**No UI. No wireframes. No code. This phase is strategy only — frozen pending approval.**
