# MUV™ — Phase 5: Design System™
### Version 1.0 · Status: DRAFT — awaiting approval
### Builds on `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md`, `PHASE_4B_INFORMATION_ARCHITECTURE.md`, `PHASE_4C_PLATFORM_ARCHITECTURE.md` (all frozen, binding)

> This document defines the visual and behavioral language every future screen inherits — Website, Admin Panel, Mobile (future), Business Portal, Distributor Portal. It contains no pages, no wireframes, no components, no frontend code.

**A necessary clarification before §1:** `PHASE_1_ARCHITECTURE.md` §3–9 already contains concrete, frozen values — the actual spacing scale (4px base), radius scale, elevation scale, animation durations/easing, the single-lavender color system with exact hex values, the Fraunces/Inter typeface pairing with a full clamp-based type scale, the breakpoint/grid table, and a component inventory. This phase does not re-choose any of that, and nothing below should be read as reopening it. What Phase 1 defined is the *token layer* — the values. What this phase defines is the *system layer* sitting above it — the reasoning that makes those values cohere, the behavioral contracts that make components consistent regardless of which screen or surface they appear on, and the governance that lets the system extend to surfaces Phase 1 named but didn't fully specify (Business Portal, Distributor Portal, Mobile app). Where a section below appears to overlap a Phase 1 table, it is translating that table's *values* into *principles* and *extending* them to new surfaces — never restating or reopening the values themselves.

---

## 1. Design System Philosophy

**Why a design system, specifically for MUV:** A design system is the mechanism that lets "one company" (`PHASE_3` §11) survive contact with many different teams, screens, and surfaces built at different times. Without one, consistency depends on everyone remembering — with one, it depends on nothing but using the system correctly. Five surfaces (Website, Admin, Mobile, Business Portal, Distributor Portal) built by different priorities and possibly different people, at different times, must still read as the same company. That is the entire purpose of this document.

**How it supports Keep Muving™:** A design system is a "no stall" mechanism turned inward. Every time a new screen has to *invent* a card style, a spacing value, or a button hierarchy from scratch, that's a stall — for the builder, and eventually for the customer who receives an inconsistent result. A mature design system means a new screen is assembled from known-good parts, not re-litigated from zero every time. Momentum, applied to how MUV is built, not just how it feels to use.

**How it supports Customer Experience:** `PHASE_2` defined the emotional stage each touchpoint must hit (Confident, Trusting, Satisfied…). None of that survives if the visual execution is inconsistent — a customer who feels "reassured" on the product page and then lands on an inconsistent-looking cart has that reassurance quietly undermined by the interface itself, even if no individual screen is badly designed.

**How it supports Brand Experience:** `PHASE_3` defined what MUV must *feel like* — calm, confident, warm, elegant, honest. A design system is the delivery mechanism for that feeling at scale. A brand feeling that only shows up on hand-crafted hero sections and disappears on the two-hundredth admin screen isn't actually a brand feeling — it's a marketing veneer. This system exists specifically to prevent that gap.

**How it supports Accessibility:** Accessibility that depends on each screen's author remembering to add it is accessibility that will eventually fail. A design system that builds accessibility into the *components themselves* (§11, §12) means every screen assembled from those components is accessible by construction, not by individual review.

**How it supports Performance:** Reusing a known-good token and component set is cheaper than re-deriving styles per screen — fewer one-off styles, less CSS, fewer layout shifts from inconsistent spacing. This is the design-side half of the performance discipline `PHASE_1` §9 already commits to on the engineering side.

**How it supports Scalability:** At 500+ products and five surfaces, ad hoc styling doesn't scale — every inconsistency compounds, and every fix has to be found and repeated across screens that all solved the same problem slightly differently. A design system scales by *addition* (new components built from existing tokens) rather than by rewrite — the same discipline `PHASE_1`/`PHASE_4A`/`PHASE_4C` already committed to, applied here to design specifically.

**How it supports Consistency:** Consistency is this document's entire subject, not one property among others — every section that follows is, in some way, a mechanism for achieving it.

---

## 2. Design Principles

Permanent, and binding on every future design decision — not aspirational language, a constraint.

- **Clarity before decoration.** Every element earns its place by helping the customer understand or act — decoration that doesn't serve comprehension is the interface performing for itself (`PHASE_3` §10, Over-designed pages).
- **Content first.** The system exists to present real product, real content, real information — never the reverse, where a layout pattern is chosen and content is forced to fit it.
- **Whitespace is intentional.** Space is not the absence of design — it's a `PHASE_1` §3.1 token, chosen deliberately, and (per `PHASE_3` §4) itself a luxury signal. A crowded layout is a decision, not an accident, and the wrong one.
- **Motion has purpose.** Every animation answers "what does this communicate" (`PHASE_3` §5) before it answers "how does this look" — a rule this phase extends into a binding per-component contract in §11.
- **Accessibility is default, not an enhancement.** It ships with the component, not added after the component in a separate pass (§11, §12).
- **Consistency builds trust.** Inconsistent components quietly tell a customer no one is actually in charge of the experience (`PHASE_3` §10) — this system is the mechanism that prevents that.
- **Premium through restraint.** Luxury is redefined by `PHASE_3` §9 as *consideration*, not opulence — visually, that means every added element must be justified, never included because there was room for it.
- **Design serves the customer, not the system.** When a rule in this document and an actual customer's need conflict, the customer's need wins — this document exists to serve `PHASE_2`'s journey, not the other way around.

---

## 3. Visual Language

*Translating `PHASE_3`'s brand qualities into what they mean structurally — no colour is chosen here; those choices already exist, frozen, in `PHASE_1` §4.*

- **Luxury** (= consideration, per `PHASE_3` §9): expressed structurally as generous whitespace, restrained ornamentation, and elevation used sparingly (`PHASE_1` §3.3's shadow scale escalates only on real state change — hover, modal — never decoratively at rest).
- **Warmth**: expressed through rounded, human geometry (`PHASE_1` §3.2's radius scale favors soft corners over sharp ones across every surface) rather than through color, which stays governed by §5.
- **Calm**: expressed through low visual noise per screen — few simultaneous focal points, generous spacing between them (§6), and motion that settles rather than snaps (§10).
- **Movement**: `PHASE_3` §1's "Keep Muving" made structural — visual rhythm should always imply a next step (an arrow, a continuing grid, a visible "more") rather than a hard visual stop.
- **Balance**: asymmetry is preferred over dead-centre symmetry (`PHASE_3` §4) — balance here means *weight* distributed intentionally across a layout, not mirrored.
- **Hierarchy**: exactly one dominant element per screen region — when two elements compete for the same visual weight, that's a hierarchy failure, not a stylistic choice.
- **Spacing**: the primary tool of hierarchy and calm both — proximity implies relationship, distance implies separation, and neither is ever accidental (§6 governs this in full).
- **Depth**: communicated through the elevation scale (`PHASE_1` §3.3) alone — never through gradients or drop-shadow decoration outside that scale. Depth signals state (resting vs. hovered vs. floating), not ambiance.
- **Texture**: reserved for photography (§9) — the interface chrome itself (cards, buttons, inputs) stays flat and clean; texture belongs to the *content*, not the *frame* around it.
- **Shape**: consistent radius logic across every surface (`PHASE_1` §3.2) — a rounder shape reads as more approachable/human, a tighter radius as more precise/functional; the existing scale already encodes this (pills for actions, generous radius for content tiles).
- **Visual rhythm**: repetition with variation — a grid of cards should feel unmistakably like *one system*, while still letting individual content (a product photo, a headline) be the thing that actually varies.

---

## 4. Typography System

*Principles only — the typeface pairing and the full type scale are already frozen in `PHASE_1` §5.*

- **Hierarchy principle:** exactly three structural levels — Display (orientation: "what is this"), Body (comprehension: "tell me more"), Caption/Label (context: eyebrow labels, meta text) — matching the three role categories `PHASE_1` §5's scale already implements. A fourth level should never be invented for a one-off screen; if content doesn't fit these three roles, the content's structure is the problem, not the type scale.
- **Readability principle:** body copy is optimized for a comfortable reading measure, never full-bleed width — this is why `PHASE_1` §3.6 defines a narrow container specifically for reading contexts (checkout, blog body). Line-height loosens as text size shrinks (already the pattern in `PHASE_1` §5's scale, 1.6–1.7 for body vs. 1.0–1.2 for display) because smaller text needs more breathing room per line to stay legible.
- **Scale principle:** fluid (`clamp()`-based) scaling is preferred over fixed breakpoint jumps, already the practiced pattern (`PHASE_1` §5) — type should resize continuously with the viewport, never visibly "jump" at a breakpoint edge.
- **Line length:** body text targets roughly 60–75 characters per line regardless of surface — enforced through container width (`PHASE_1` §3.6), never through font-size tricks.
- **Spacing (tracking/leading):** tighter tracking at display sizes (large type needs less letter-spacing to read as unified), wider tracking on uppercase caption/eyebrow labels (small uppercase text needs more separation to stay legible) — already the shipped pattern.
- **Responsive behaviour:** typography shrinks *before* layout breaks — a heading should never be the reason a layout needs an early breakpoint; the fluid scale (above) exists specifically to prevent that dependency.
- **Accessibility:** text size is never the sole encoder of hierarchy — weight and spacing reinforce it, so a hierarchy still reads correctly under browser zoom or user font-size overrides. Never disable pinch-to-zoom or user text scaling on any surface.
- **Cross-surface extension:** Admin Panel, Business Portal, and Distributor Portal are data-dense, task-focused tools, not editorial storytelling surfaces — they use the *same* typeface pairing and the *same* three-role hierarchy (never a second typographic identity — that would break `PHASE_3` §11's "one company" rule), but lean toward the denser end of the existing scale (Body/Caption roles) far more than the Display end, which stays reserved for genuine section orientation, not routine data display.

---

## 5. Color System Strategy

*Every role below already has an exact, frozen value in `PHASE_1` §4 — this section states the strategy governing those values, not new ones.*

- **Primary / Secondary / Accent:** `PHASE_1` §4 already establishes a single-accent system — one brand hue (lavender) carries all emphasis, with a deeper tone of the same hue for depth/gradient use only, and no second competing accent hue. The strategic principle: emphasis is achieved through *one* color's saturation/weight, never by introducing a second hue to compete for attention. This rule is permanent, not just the current color's property — even if the accent hue ever changed, "exactly one accent" would not.
- **Success / Warning / Error:** semantic states are strictly separate from the brand accent — a green success state and a lavender brand accent must never be visually confusable, and semantic color is never repurposed for a non-semantic decorative use (`PHASE_1` §4 already keeps these distinct).
- **Neutral / Surface / Background:** a stepped neutral ramp (`PHASE_1` §4's 10-step ink↔white scale) does the majority of the interface's visual work — background, surface, border, and text-opacity all derive from one ramp so the whole interface reads as tonally unified, with color reserved for the moments that actually need emphasis.
- **Contrast philosophy:** contrast is a *hierarchy* tool as much as an accessibility one — the highest-contrast element on a screen should always be the thing the customer most needs to notice, never an incidental decorative element that happens to be high-contrast.
- **Accessibility requirements:** WCAG AA (4.5:1 body text, 3:1 large text) is the permanent floor across every surface and every future token addition — already an audited, enforced standard (`PHASE_1` §9/§12) that this system inherits unchanged, and that any new color role added in the future must be checked against before shipping.
- **Dark mode strategy:** `PHASE_1` §4 already made and audited the governing decision — the customer-facing storefront is always dark, admin/CMS is always light, and this is a deliberate brand split, not a user-togglable preference. The *strategic principle* worth stating explicitly here, since it now has to extend to two more surfaces: **a surface's mode is determined by its relationship to the customer, not by a blanket rule.** Storefront is dark because it's the emotional, brand-forward relationship surface. Admin is light because it's an internal operational tool. This leaves a genuine open question for Business Portal and Distributor Portal, correctly flagged rather than silently assumed: is a Business Portal closer to "a relationship surface for an external customer" (→ dark, storefront-aligned) or "an operational task tool" (→ light, admin-aligned)? Both portals are used by *external* parties, unlike admin — which leans toward treating them as relationship surfaces. This should be run through `PHASE_4A` §12's Decision Framework when each portal is actually scoped, not decided by default in this document. Whichever mode is chosen, the same token roles, same single-accent rule, and same contrast floor apply either way — the mode changes, the system never does.

---

## 6. Spacing System

*The exact scale (4px base unit, named tokens `--space-1` through `--space-16`) is already frozen in `PHASE_1` §3.1 — this section is the philosophy governing its use.*

- **Vertical rhythm:** consistent section-to-section spacing is what makes a long page feel authored rather than assembled — the same top/bottom rhythm at the same structural level (section boundary vs. subsection vs. element group) regardless of what content sits inside it.
- **Horizontal rhythm:** gaps between siblings in a row (card grids, button groups) come from the same token scale as vertical gaps — spacing is one system, not a vertical scale and a separate horizontal one that happen to share numbers.
- **Containers:** width is capped deliberately (`PHASE_1` §3.6) so line length and layout density stay controlled at wide viewports — a container's max-width is a readability and composition decision, not an arbitrary limit.
- **Margins vs. padding:** padding belongs to a component (space *inside* its boundary); margin/gap belongs to layout (space *between* components) — layout spacing is owned by the parent via `gap` (flex/grid), never by a component reaching outside itself with its own margin, which is what causes silently collapsing or doubling spacing.
- **Responsive scaling:** spacing compresses at smaller viewports using the *same* token scale, never arbitrary one-off shrinkage — a section that uses `--space-12` on desktop steps down to a smaller named token on mobile (already the shipped pattern, `PHASE_1` §7), never to an unnamed intermediate value.
- **Consistency rule:** every gap, padding, and margin value in any future component must reference a spacing token — never a hardcoded pixel value. This is not a new rule; it is `PHASE_1` §12's Project Rule 5 ("one token source"), restated here as this system's governing spacing law specifically.
- **Cross-surface extension:** Admin, Business Portal, and Distributor Portal are data-dense — they draw from the *same* scale but lean toward its tighter end (`--space-1` through `--space-6`) far more heavily than the storefront's generous use of its looser end (`--space-8` through `--space-16`). Density differs by surface; the scale that produces it never does.

---

## 7. Grid System

*Breakpoints, column counts, and gutters are already frozen in `PHASE_1` §3.6/§7 — this section defines when and why each layout choice is made.*

- **Density is a deliberate per-section choice, not a global constant** (`PHASE_1` §7 already establishes this: editorial 3-column vs. dense commerce 4-column, chosen per section intent). The governing principle: editorial density (fewer, larger tiles) is used where the customer is meant to *browse and feel*; dense commerce grids are used where the customer is meant to *compare and scan*. Choosing between them is a content-intent decision, made consciously each time, never defaulted.
- **Desktop / Tablet / Mobile:** column count steps up with viewport (4 → 8 → 12, `PHASE_1` §3.6) — content reflows, it does not simply scale down; a 4-column mobile layout is a genuine re-composition of a 12-column desktop one, not the same layout shrunk.
- **Container behaviour:** content clamps to a maximum width at wide viewports; only ambient backgrounds go full-bleed (`PHASE_1` §3.6) — this prevents both a cramped narrow reading experience and an ultra-wide layout that stretches content into an uncomfortable reading measure.
- **Responsive breakpoints:** treated as content thresholds, not device categories — a breakpoint exists because content needs to re-flow at that width, not because it maps to a specific phone or tablet model, which is why the scale is defined in raw viewport widths (`PHASE_1` §3.6) rather than device names.
- **Layout consistency:** the same grid primitives (container, gutter, column) are used everywhere — a Business Portal quotation table and a storefront product grid are structurally built from the same grid system, even though their density and content differ completely.
- **Cross-surface extension:** the storefront's editorial-vs-dense choice (above) doesn't fully apply to Admin/Business/Distributor Portal, whose primary content is often tabular, not tile-based — these surfaces need a **third density mode, data-table density**, prioritizing scan-efficiency over visual breathing room. This is a genuine addition this phase makes to `PHASE_1` §7's two-mode model, not a redefinition of it.

---

## 8. Iconography

- **Style:** one consistent icon set across every surface — a single stroke weight, a single corner style, a single visual grammar. Mixing icon styles (some filled, some outlined, from different sets) is one of the fastest ways a system starts to look assembled rather than designed, and is never permitted.
- **Purpose:** an icon illustrates a fact stated in words nearby — it never stands alone as the sole evidence for a claim or the sole label on an action (`PHASE_3` §4). An icon reinforces meaning; it never carries meaning alone.
- **Usage rules:** thin-lined, quiet, never the visual star of a screen (`PHASE_3` §4) — icons support hierarchy, they don't compete for it. An icon-only control (no visible text label) is permitted only where the icon is truly universal (search, close, cart) and always carries an accessible label regardless (§12).
- **Sizing:** icon sizes are tied to the type scale they sit beside (§4) — an icon next to body text uses a body-scale size, an icon next to a caption uses a caption-scale size, so icon and text always feel like one unit rather than two mismatched elements.
- **Accessibility:** every icon used as an interactive control has a text alternative (`aria-label` or equivalent) — an icon is never the only way to understand what a control does.
- **Consistency:** once an icon is chosen to represent a concept (cart, wishlist, search), that pairing is permanent across every surface — a different icon for "cart" on the Business Portal than on the storefront would quietly break the "one company" principle (`PHASE_3` §11).

---

## 9. Imagery

*Photography direction (lighting, composition, backgrounds, texture, video style) is already defined in `PHASE_3` §4 — this section governs how imagery behaves as a system, not how it should look.*

- **Photography philosophy:** already governed by `PHASE_3` §4 in full — real product, real use, equal reverence across every category (a floor cleaner shot with the same care as a fragrance). Not repeated here.
- **Product photography:** every product, regardless of category or price point, is photographed to the same standard and at the same technical spec (resolution, aspect ratio, background treatment) — the shipped Cloudinary transform-preset system (`PHASE_1` §9, `PHASE_4C` §9) is the mechanism that already enforces this: one uploaded original, consistently derived across every context (thumbnail, gallery, lightbox).
- **Lifestyle photography:** used specifically to establish the *result* of care (`PHASE_3` §4's storytelling principle: show the clean, calm result, not the chore) — reserved for brand/homepage/category-orientation moments, not for transactional surfaces (cart, checkout) where imagery would distract from task completion.
- **Business imagery:** a genuinely new consideration this phase adds — institutional/B2B contexts (`PHASE_2` §2) need imagery that reads as credible to a procurement buyer, not aspirational lifestyle photography. Business Portal and any bulk/institutional-facing content should favor product-true, spec-clear photography (real form, real scale, real packaging) over lifestyle staging — the same "product is always shown true to its form" rule from `PHASE_3` §4, weighted more heavily for this audience.
- **Illustration policy:** MUV is photography-led, not illustration-led (`PHASE_3` §4) — carried forward unchanged; illustration, if ever used, stays abstract and restrained, never character-driven.
- **Video principles:** already governed by `PHASE_3` §4 (slow, deliberate camera movement) — not repeated here.
- **Image quality / cropping / composition:** every context a product image appears in (card, gallery, hero, thumbnail) has one defined aspect ratio and crop behaviour, applied identically everywhere that context recurs — a product card crops the same way on the storefront, in a Business Portal order history, and in an order-confirmation email, so the customer never sees the same product represented two visibly different ways. Composition follows `PHASE_3` §4's generous-negative-space, asymmetry-preferred direction by default, with the tighter product-true framing (above) reserved specifically for institutional/spec-driven contexts.

---

## 10. Motion System

*Expands `PHASE_3` §5 (what motion communicates) together with `PHASE_1` §8 (the technical rules already governing how motion is implemented — CSS-first, one easing curve, duration ceilings, mandatory `prefers-reduced-motion` support). Neither is repeated in full here.*

- **Page transitions:** directional and brief, implying forward progress (`PHASE_3` §5) — technically bounded by `PHASE_1` §8's rule that page-level transitions are the one case reserved for Framer Motion, capped near 800ms.
- **Hover:** acknowledgment, not performance (`PHASE_3` §5) — every hover effect must signal interactivity or a state change, never stack more than two simultaneous effects on one element (`PHASE_1` §8).
- **Loading:** motion communicates real progress wherever possible, rather than an indefinite spinner (`PHASE_3` §5's "this is working") — a loading state is itself an honesty commitment (`PHASE_3` §1's Honesty principle applied to motion): it should never imply progress that isn't actually happening.
- **Micro-interactions:** reserved for moments that matter (add to cart, save to wishlist) — motion sprinkled onto every element cheapens the motion that's actually meaningful (`PHASE_3` §5).
- **Feedback:** every state-changing action gets a motion acknowledgment proportional to its significance — a minor UI toggle gets a fast, quiet transition; a meaningful action (successful checkout) can afford a slightly more deliberate one, though still brief and quiet, never celebratory (`PHASE_3` §5's Success animations rule).
- **Timing philosophy:** one easing curve for the overwhelming majority of motion, a hard duration ceiling, no bounce/elastic/spring-overshoot anywhere (`PHASE_1` §8) — these are engineering-enforced rules this system treats as permanent, not adjustable per project taste.
- **Performance rules:** only `opacity` and `transform` are animated; CSS is the default, Framer Motion is reserved for what CSS genuinely cannot do (`PHASE_1` §8) — unchanged.
- **New: per-component motion contracts.** Neither Phase 1 nor Phase 3 states, component-by-component, what motion a given component always uses — that gap is closed here so any future card, modal, or button (on any surface) inherits identical motion behavior rather than reinventing it: a **card** lifts and gains a border glow on hover (`--duration-fast`, `--ease-default`); a **modal/dialog** enters and exits via the `--duration-slow` fade+scale pair; a **button** presses with `--duration-instant`–`--duration-fast` feedback and never lifts (lift is reserved for cards); a **toast** slides and settles, never bounces. These pairings, once set at implementation time, are permanent across every surface that uses the component.
- **Cross-surface extension:** Admin, Business Portal, and Distributor Portal motion is deliberately quieter than the storefront's. An internal or task-focused tool uses motion purely to communicate state change efficiently (a row expands, a save confirms) — it does not perform brand luxury the way the storefront does. Same tokens, same easing, shorter list of *when* motion is used at all.

---

## 11. Components Philosophy

*Not component designs — `PHASE_1` §6 already names the actual inventory (which primitive, which file). This section is the behavioral contract every component, regardless of surface, must satisfy.*

**Every interactive component supports the same state set**, and none may skip a state that applies to it: default (resting) → hover → focus (keyboard-visible, distinct from hover per `PHASE_1` §3.4's dedicated focus-ring token) → active/pressed → disabled → loading (where the action is asynchronous) → error (where the action can fail) → empty (where the component displays a collection). A component that silently lacks one of its applicable states is incomplete, not "fine for now."

**Every component has one anatomy pattern it never deviates from**, regardless of what content fills it — this is what makes a grid of them feel systematic (§3, visual rhythm) rather than assembled ad hoc:
- **Buttons:** one shared hierarchy — Primary (one per view, the single most important action), Secondary, Tertiary, Icon, Destructive — never two Primary-weight buttons competing in the same view.
- **Cards:** a fixed slot order (media → content → action), shared across every variant (Product, Collection, Content, Trust, Stat) — each variant fills the slots differently, none reorders them.
- **Forms & Inputs:** label → control → helper/error text, always in that order, always with the error state replacing the helper text rather than stacking below it. Validation is inline and specific, never a generic "invalid input" (`PHASE_2` §9).
- **Navigation:** wayfinding never requires memory — the current location is always visibly indicated, on every surface, not only the storefront's breadcrumb pattern.
- **Tables [new — not previously specified]:** the primary data-display component for Admin, Business Portal, and Distributor Portal, essentially unused on the storefront. A table's contract: sortable columns indicate their sort state visually and to assistive tech, row density follows §7's data-table density mode, and every table has a defined empty state (never a blank white area — `PHASE_2` §6's "never a dead end" principle, applied to data tables specifically).
- **Modals:** interrupt deliberately and rarely — a modal is earned by a genuinely blocking decision, never used for content that could be inline. Always dismissible by keyboard (Esc) and by an explicit control, never only by clicking outside.
- **Badges:** communicate one fact each (new, limited, on sale, out of stock) — a badge is never decorative, and a component never carries more than one badge at a time competing for the same corner.
- **Product Cards:** the shipped reference implementation (`PHASE_1` §6) — image, badge, wishlist, quick view, name, USP, rating, price, action, in that fixed order, on every surface that displays a product (including Business Portal order history and quotation views).
- **Filters:** filter by what the customer thinks in, never by internal data structure (`PHASE_2` §6) — a filter's applied state is always visibly reflected and always independently removable, never requiring "clear all" to remove one.

**Cross-surface rule:** a component's *behavior contract* is identical on every surface — a button behaves like a button whether it's on the storefront or the Distributor Portal. Only the density (§6, §7) and the surface's color mode (§5) change; the contract itself never does.

---

## 12. Accessibility

*`PHASE_1` §9/§12 and `PHASE_2` §12 already establish the practiced rules (keyboard operability, WCAG AA contrast, focus-ring token, semantic HTML, touch target sizing, inclusive imagery/language). This section states the system-level principle that makes those rules durable rather than repeating them.*

**The governing principle:** accessibility is a property of the token and component layer (§5–§11), not a property of individual screens. A screen assembled entirely from system components — which already carry focus states, ARIA roles, and contrast-compliant color tokens — is accessible by construction. Accessibility review at the screen level exists to catch *composition* mistakes (a bad reading order, a missing landmark), not to retrofit basics the components should have already provided.

- **Keyboard:** every interactive element is reachable and operable by keyboard alone, in logical order — a system-level guarantee from `PHASE_1` §12's Project Rule 7, inherited by every component in §11.
- **Contrast:** WCAG AA is the token-level floor (§5) — a color combination that fails it is never a valid token pairing, regardless of how it looks.
- **Focus:** every interactive element has a focus state visually distinct from its hover state (`PHASE_1` §3.4's dedicated focus-ring token) — never approximated by reusing the hover style.
- **ARIA / screen readers:** semantic HTML first, ARIA only where semantics genuinely can't express the interaction (`PHASE_1` §9) — meaningful alt text on every image, never a filename or "image of product" placeholder (`PHASE_2` §12).
- **Touch targets:** comfortably sized on every surface, not only mobile-primary ones — an Admin Panel used occasionally on a tablet deserves the same target sizing as the storefront.
- **Reduced motion:** every animation ships a `prefers-reduced-motion` fallback, no exceptions (`PHASE_1` §8) — this includes the new per-component motion contracts in §10.
- **Responsive behaviour:** accessibility does not degrade at any breakpoint — a control that's reachable and labeled on desktop is reachable and labeled on mobile, not simplified away.
- **Inclusive design:** imagery and language never assume a single body type, gender, or family structure (`PHASE_2` §12) — carried forward as a system-wide rule, not only a storefront one.

---

## 13. Responsive Design

- **Mobile-first is the binding default for customer-facing surfaces.** `PHASE_2` §11 already establishes mobile as the *primary* surface for an India-based D2C brand, not a secondary adaptation — the design system's breakpoint structure (`PHASE_1` §3.6) is built mobile-up (4 columns base, expanding at each larger breakpoint) specifically to reflect this.
- **Desktop-first is the more honest default for Admin.** Staff operate the Admin Panel at a desk, on a large screen, for extended sessions — data-table density (§7, §11) genuinely benefits from desktop's available width first, with a usable but secondary mobile/tablet fallback (an admin checking a single order from a phone, for example) rather than a fully mobile-optimized parallel experience.
- **Business Portal and Distributor Portal — an open question, same reasoning as §5's dark-mode strategy.** These are used by external parties (unlike Admin) who may reasonably check an order or quotation from a phone — but their primary task (reviewing bulk pricing, tracking a large order) is more data-dense than a typical mobile-primary consumer flow. Whether they follow the storefront's mobile-first posture or Admin's desktop-first one should be decided per-portal, through `PHASE_4A` §12's Decision Framework, once each portal is actually scoped — not assumed by default here.
- **Adaptive behaviour:** layouts re-compose at breakpoints (§7), they don't merely rescale — content that matters most at a narrow viewport (price, primary action) should be prioritized in that recomposition, not just proportionally shrunk alongside everything else.
- **Touch interactions:** every primary action sits within comfortable one-handed thumb reach on mobile (`PHASE_2` §11) — a rule that applies to any surface actually used on a touch device, not only the storefront.
- **Tablet strategy:** tablet is never just "mobile, stretched" or "desktop, shrunk" — `PHASE_1` §3.6's dedicated `md` breakpoint (8 columns) exists specifically because tablet has its own legitimate layout needs between the two.
- **Future app compatibility:** the token system (§14) is structurally platform-agnostic — CSS custom properties map cleanly onto a native app's own token/theme layer (a spacing scale, a color role, a type scale mean the same thing regardless of rendering technology). A future native app should be able to *consume this system's values*, not redesign a parallel one from scratch.

---

## 14. Design Tokens

*Philosophy only — every actual value already exists in `PHASE_1` §3, re-exported through Tailwind's theme layer. No new values are assigned here.*

**Why tokens exist at all:** a token is the single point of truth for one design decision (a spacing amount, a radius, a duration) — every component that needs that decision references the token, never a hardcoded value. This is `PHASE_1` §12's Project Rule 5 ("one token source"), and it is the mechanical foundation every other section of this document depends on: §3–§10's principles are only enforceable because tokens make deviation from them visible (a hardcoded px value stands out precisely because everything else references a token).

**Token categories** (matching `PHASE_1` §3's actual structure): spacing, radius, elevation/shadow, border, animation (easing + duration), typography (scale + weight + tracking), color (role-based, per §5) — a closed, deliberately small set of categories. A new category is added only when an entire *class* of future decisions needs one, never for a single one-off value.

**How a token gets added:** a new token is justified by a recurring need across multiple components or surfaces — a value used exactly once belongs inline-derived from an existing token (e.g., a one-off spacing need is expressed as a sum/multiple of existing space tokens), not promoted to its own named token. This keeps the token set legible rather than sprawling as the system grows across five surfaces.

**Cross-surface token reuse:** every surface (storefront, admin, future portals, future app) draws from the *same* token set — a surface may use a different color-mode value for a token (§5's dark/light split) or lean toward a different part of a scale (§6, §7's density extensions), but it never defines a parallel, surface-specific token for something the shared system already names.

---

## 15. Design Governance

**Versioning:** this document and its companion token implementation are versioned together — a change to a token value or a component contract is a version event, tracked the same way `PHASE_4C` §3's Audit Logs track any other consequential platform change. A visual change without a corresponding version note is exactly the kind of untraceable drift this whole system exists to prevent.

**Deprecation:** an old component or token is marked deprecated before removal, with a defined replacement — screens are migrated deliberately, never left silently broken by a token disappearing out from under them. Nothing is deleted that a live screen still depends on, mirroring `PHASE_4C` §15's "archive, don't erase" principle applied to design assets instead of data.

**Documentation:** every component's behavioral contract (§11) is documented once, centrally — not re-explained per screen that uses it. A screen's design should be reviewable by asking "does this correctly *use* the system," not "is this internally consistent on its own terms."

**Component ownership:** an open point worth naming honestly rather than assuming: `PHASE_4C` §10's role set does not currently include a role accountable for the design system itself — Content Editor owns content, Admin owns product/pricing, no one is named as owning whether a new component actually conforms to §11's contracts. Until a dedicated design-system ownership role exists, this accountability defaults to whoever is implementing `PHASE_1`'s technical architecture, since the token layer already lives there — but this is a gap worth resolving explicitly, not a decision made by default.

**Review process:** every new component or pattern is checked against §17's Approval Checklist before it ships — not after, and not only when something looks visibly wrong. Review is a gate, not a retrospective cleanup pass.

---

## 16. Design Constitution

Binding on every future screen, component, and surface:

1. One design system serves every surface — Website, Admin, Mobile, Business Portal, Distributor Portal. There is no second visual language, ever, for any reason.
2. Every value used in a screen traces to a token (§14). A hardcoded spacing, color, radius, or duration value never ships.
3. Every component satisfies its full state contract (§11) before it ships — hover without focus, or an action without a loading state, is an incomplete component, not a "good enough for now" one.
4. Accessibility is inherited from the component, not authored per screen (§12).
5. Motion always communicates something (§10, `PHASE_3` §5). Motion that exists only to look nice is decorative, and decorative motion is cut.
6. A surface's density and color mode may differ (§5, §6, §7); the underlying token set and component contracts never do.
7. Nothing is deleted while a live screen still depends on it (§15) — deprecate, migrate, then remove.
8. Every genuinely open design question (a new surface's color mode, its responsive posture) is decided explicitly through `PHASE_4A` §12's Decision Framework — never assumed by default because a deadline is close.
9. The system scales by addition — new components, new tokens where a real recurring need justifies them — never by a parallel, one-off styling approach that quietly forks the system.
10. If a rule in this document ever conflicts with what an actual customer needs, the customer's need wins, and the rule is revisited — not silently overridden and left undocumented.

---

## 17. Approval Checklist

Every future screen, component, or pattern must confirm, before implementation:

- [ ] Does every value used (spacing, color, radius, type, motion) reference an existing token (§14), with no hardcoded values?
- [ ] Does every interactive element satisfy its full state contract — default, hover, focus, active, disabled, loading, error, empty where applicable (§11)?
- [ ] Is every claim of accessibility actually inherited from the component, not bolted on for this one screen (§12)?
- [ ] Does any motion used here communicate something real, per §10 — and if not, has it been cut?
- [ ] Does this fit an existing component pattern (§11), or does it require a new one — and if new, has it been justified as a recurring need, not a one-off (§14)?
- [ ] Does this remain visually and behaviorally consistent with every other surface, or does it quietly introduce a second visual language (§16, article 1)?
- [ ] If this is a new surface or a genuinely new design question (mode, density, responsive posture), has it been run through `PHASE_4A` §12's Decision Framework rather than assumed?
- [ ] Does it remain compatible with `PHASE_1`–`PHASE_4C` in full?
- [ ] Does it violate any article of the Design Constitution (§16)? If so, it does not proceed.

---

## Deliverables Checklist

1. ✅ Design System Philosophy — §1
2. ✅ Design Principles — §2
3. ✅ Visual Language — §3
4. ✅ Typography System (principles only) — §4
5. ✅ Color System Strategy (roles only, no new values) — §5
6. ✅ Spacing System (philosophy only) — §6
7. ✅ Grid System — §7
8. ✅ Iconography — §8
9. ✅ Imagery — §9
10. ✅ Motion System — §10
11. ✅ Components Philosophy (behavior, not design) — §11
12. ✅ Accessibility — §12
13. ✅ Responsive Design — §13
14. ✅ Design Tokens (philosophy only, no values) — §14
15. ✅ Design Governance — §15
16. ✅ Design Constitution — §16
17. ✅ Approval Checklist — §17

**No UI. No wireframes. No components built. No frontend code. No exact colours or fonts chosen (those remain frozen in `PHASE_1_ARCHITECTURE.md`). This is the systemic design foundation — frozen pending approval.**
