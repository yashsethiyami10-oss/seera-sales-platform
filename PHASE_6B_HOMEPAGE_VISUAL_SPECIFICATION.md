# MUV™ — Phase 6B: Homepage Visual Specification™
### Version 1.0 · Status: DRAFT — awaiting approval
### Builds on `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md`, `PHASE_4B_INFORMATION_ARCHITECTURE.md`, `PHASE_4C_PLATFORM_ARCHITECTURE.md`, `PHASE_5_DESIGN_SYSTEM.md`, `PHASE_6A_HOMEPAGE_EXPERIENCE_BLUEPRINT.md` (all frozen, binding)

> `PHASE_6A` defined what each homepage section communicates and why. This document defines how that translates into a concrete visual treatment — specific enough to build from, using only tokens and component contracts already frozen in `PHASE_1` and `PHASE_5`. No React, no HTML, no CSS, no components built, no new colours or fonts chosen.

**How this document stays implementation-ready without writing code:** every visual decision below is expressed by *naming the existing token or contract that applies* (`--text-display-xl`, `--space-12`, `--elevation-2`, the Card anatomy from `PHASE_5` §11, the motion contracts from `PHASE_5` §10) rather than inventing new values. A developer building from this document combines two things: `PHASE_1`/`PHASE_5`'s token and component vocabulary, and this document's instructions for *which* token applies to *which* moment on *this specific page*. Nothing here reopens a value those documents already settled.

---

## 1. Overall Visual Direction

**How the homepage should look, in one line:** Dark, spacious, editorial — closer to a considered brand film than a product catalogue, with commerce arriving exactly where `PHASE_6A` says desire has already formed (Proof), never before.

**Mode:** The storefront-default dark theme (`PHASE_1` §4) governs the entire page — every one of the nine sections, including Acknowledgment (§8) and Footer (§10), stays within this single mode. No section switches to light; visual separation where it's needed (§8) is achieved through containment and contrast, never a theme change.

**How premium is expressed:** Through restraint and correctness, not density — few elements per section, each given room, per `PHASE_5` §2's "premium through restraint." Premium here is legible in what's *absent* as much as what's present: no section crowds more than one dominant idea into view at once.

**How luxury is expressed:** As consideration (`PHASE_3` §9, `PHASE_5` §3) — every section is shaped specifically for what it needs to say, never a repeated template stamped nine times. Luxury shows up as the visible evidence that each section was actually thought through, not templated.

**How warmth is expressed:** Through the radius scale (`PHASE_1` §3.2) applied consistently — generous, human corners on cards and tiles throughout, never sharp geometric edges that would read as clinical. Warmth also shows up in pacing: nothing on this page ever rushes the visitor toward a decision.

**How movement is expressed:** Visually, through consistent directional cues — hover states that lift toward the visitor (`PHASE_5` §10's card motion contract), arrows that point forward, and a scroll rhythm (§11) that never presents a section as a hard stop. `PHASE_6A` §9 already defines Keep Muving's structural meaning on this page; this section is where that becomes visible.

**How whitespace is used:** The homepage draws from the *generous* end of the spacing scale (`PHASE_1` §3.1's `--space-8` through `--space-16`) far more than any other surface (`PHASE_5` §6's cross-surface extension already reserves this register specifically for the storefront) — section padding defaults to `--space-12` on desktop, never compressed to fit more content in, per `PHASE_1` §7's shipped rhythm.

**How visual hierarchy should feel:** Exactly one dominant focal point per section, never two competing for the same attention (`PHASE_5` §3) — stated once here as the page-wide law every section below is built to satisfy individually.

---

## 2. Hero Section — Arrival

*Purpose, psychology, and emotion already fully specified in `PHASE_6A` §4.1 — not repeated.*

- **Content hierarchy:** Brand promise headline first, one supporting line second, one CTA third — nothing else competes in this section. Headline sits at `--text-display-xl`, the scale's largest register, reserved for exactly this one moment on the page (`PHASE_5` §4's rule that Display-scale type is reserved for genuine section orientation).
- **Visual hierarchy:** One dominant visual (image or restrained video) carries the section; typography sits over or beside it, never competing with it for the same visual weight.
- **Media strategy:** Real photography or restrained video per `PHASE_3` §4's direction (real product, real use, cinematic lighting) — full-bleed background (`--container-wide`) with the headline/CTA clamped to `--container-content` (`PHASE_1` §3.6), so the image breathes while the message stays readable at any viewport.
- **Copy hierarchy:** Headline states the brand promise plainly (`PHASE_3` §6 — short, declarative, no adjectives doing the work that specificity should); one supporting line adds just enough context to make the headline concrete.
- **CTA hierarchy:** One Primary-tier button (`PHASE_1` §6's solid-white Primary) — "Shop" or equivalent. No second CTA competing at the same visual weight; the invitation to scroll is implicit, carried by the page's own visual rhythm, not a second button.
- **Trust elements:** None placed here deliberately — per `PHASE_6A` §4.1, visual craft itself is this section's only trust signal.
- **Motion opportunities:** A single, slow, barely-perceptible entrance (fade + gentle rise, `--duration-slow`) on load — nothing louder. If the hero visual is a still image, an optional, extremely slow ambient scale (well under any threshold that would read as "animated") is permitted per `PHASE_3` §4's "slow, deliberate camera movement" video principle, extended to a static image; if it can't be made imperceptibly slow, it's better omitted entirely per `PHASE_1` §8's "nothing moves without a reason."
- **Responsive behaviour:** Full viewport height on desktop; on mobile, height is content-driven rather than forced to 100vh, so the CTA is never pushed uncomfortably far down (`PHASE_5` §13's mobile-first posture for customer-facing surfaces).
- **Success criteria:** Inherited from `PHASE_6A` §4.1 — bounce rate, time-to-first-scroll.

---

## 3. Category Section — Orientation

*Purpose and psychology already specified in `PHASE_6A` §4.2.*

- **Visual purpose:** Prove real breadth at a glance — five tiles, equal visual weight, no tile implying more importance than another (`PHASE_6A` §4.2's content-hierarchy rule).
- **Card behaviour:** Follows the Collection Card contract already shipped and frozen (`PHASE_1` §6) — icon or image, index label, hover arrow — and the general Card anatomy (`PHASE_5` §11: media → content → action slot order), never reordered.
- **Image emphasis:** The category's representative image or icon dominates each tile; text is minimal — name plus, where applicable, a "coming soon" label (`PHASE_2` §4/§6) rather than the tile disappearing.
- **Content hierarchy:** Category name at `--text-display-md`, index/eyebrow label at `--text-caption` — no supporting paragraph; a category tile is an invitation, not an explanation.
- **Hover behaviour:** The standard card motion contract (`PHASE_5` §10) — lift, border glow, `--duration-fast`/`--ease-default` — plus the shipped hover-arrow reveal (`PHASE_1` §6).
- **Mobile behaviour:** A horizontally scroll-snapping row (`PHASE_5` §11's Carousel primitive), not a stacked grid — five tiles don't divide evenly into a two-column grid without leaving an orphaned tile, and a scroll-snap row keeps each tile large enough to stay legible on a small screen while preserving the page's brisk mobile scrolling rhythm (`PHASE_6A` §7).
- **Interaction philosophy:** Each tile is a single, whole click target — no competing sub-links or secondary actions inside a category tile (`PHASE_5` §11's "one clear tap target" anatomy rule).

---

## 4. Featured Products — Proof

*Purpose and psychology already specified in `PHASE_6A` §4.3.*

- **Product card hierarchy:** Exactly the shipped, frozen reference order (`PHASE_1` §6): image, badge, wishlist, quick view, name, USP, rating, price, add-to-cart. Not renegotiated here.
- **Image dominance:** The product photo occupies the clear majority of the card's visual area — held to the same standard regardless of category (`PHASE_3` §4's rule that a floor cleaner gets the same photographic reverence as a fragrance).
- **Pricing presentation:** The shipped `<Price value mrp />` pattern (`PHASE_1` §6) — MRP struck through beside the actual price, discount shown only when genuinely present, never implied.
- **USP presentation:** One sourced, specific line (`PHASE_3` §7) between name and rating — never a generic tagline standing in for it.
- **Ratings:** Shown only where genuine reviews exist behind them; a product with no reviews yet omits the rating element entirely rather than displaying an empty or zero state that would read as a quiet negative signal.
- **CTA emphasis:** Add-to-cart is the card's one Primary-tier action; Quick View and Wishlist sit at Icon-tier (`PHASE_5` §11's button hierarchy) — never competing with add-to-cart for visual weight.
- **Hover behaviour (desktop):** A restrained image transition (secondary photo swap or subtle zoom) on hover, with Wishlist/Quick View icons revealing on hover — but both must also be reachable and visible on keyboard focus (§13), since hover-reveal is a desktop enhancement, never the only way to access them.
- **Comparison strategy:** None. This is a curated set, not a comparison tool (`PHASE_6A` §4.3) — no side-by-side or checkbox comparison UI belongs on the homepage; that's a category-page-level concern, if it's ever built at all.
- **Mobile behaviour:** A horizontally scroll-snapping row, same reasoning as Category (§3) — cards stay large enough to read comfortably, and the homepage's curated set (a handful of products, not the full catalogue) suits a scroll row better than a dense grid, which is reserved for an eventual full "Shop All" listing page, not this moment.

---

## 5. Why Choose MUV — Reassurance

*Purpose and psychology already specified in `PHASE_6A` §4.4.*

- **Visual storytelling approach:** A small number of icon-plus-claim pairs, arranged in a grid — never a paragraph of prose; `PHASE_6A` §4.4 already limits this section to a small number of concrete claims, and the visual treatment enforces that same restraint.
- **Icon strategy:** Thin-lined, quiet, one per claim (`PHASE_5` §8) — the icon illustrates the claim stated beside it in words; it never stands alone as the evidence.
- **Information hierarchy:** Each claim's short headline sits at `--text-display-md`, one supporting line at `--text-body-md` — identical treatment across every claim, since no single claim should visually outrank another (§1's "one dominant focal point" rule applies at the *section* level here, not within it — the claims are peers).
- **Reading flow:** A simple grid scan, left-to-right/top-to-bottom, equal visual weight throughout.
- **Motion opportunities:** Scroll-reveal via the shipped IntersectionObserver `Reveal` component (`PHASE_1` §8), staggered lightly per claim as the section enters view — restrained, never a distracting cascade.

---

## 6. Brand Story — Origin

*Purpose and psychology already specified in `PHASE_6A` §4.5.*

- **Visual mood:** Deliberately quieter and slower than the sections around it — this is the one section on the page built for lingering, not scanning.
- **Content rhythm:** Generous whitespace around a short passage of text, set in the narrow reading container (`--container-narrow`, `PHASE_1` §3.6) rather than the page's standard content width — a visual signal, before a word is read, that this is a reading moment rather than a browsing one.
- **Photography approach:** One considered image, not a gallery — chosen for what it says about the brand's belief (`PHASE_3` §1), never generic lifestyle stock.
- **Reading experience:** Image and text arranged asymmetrically side by side on desktop (`PHASE_5` §3's Balance principle), stacking vertically on mobile — short enough to read without the section itself feeling long.
- **Emotional objective:** Affinity, not conversion (`PHASE_6A` §4.5) — no CTA is visually emphasized here; if a link to a fuller story exists, it stays text-tier, never button-tier.

---

## 7. Reviews / Social Proof — Evidence

*Purpose and psychology already specified in `PHASE_6A` §4.6.*

- **Presentation strategy:** A real aggregate rating (an actual number, not just filled stars — `PHASE_3` §7's rule against unverifiable claims like "loved by thousands") alongside a small set of real review snippets.
- **Authenticity principles:** Never filtered to only-positive; a genuine neutral review is shown if it exists rather than hidden (`PHASE_3` §7, restated here as this section's non-negotiable precondition). If genuine review volume is too thin to fill this section credibly, the section runs smaller or is held back entirely — never backfilled with anything invented.
- **Reading hierarchy:** The reviewer's actual words are the visual lead — star icons support the text, never substitute for it (`PHASE_5` §8's icon philosophy).
- **Interaction behaviour:** A light horizontal scroll (`PHASE_5` §11 Carousel) through review snippets — no heavy filtering or sorting UI; that level of interaction belongs on a dedicated reviews view, not the homepage.
- **Trust emphasis:** A "verified purchase" indicator is shown only where the underlying order data genuinely supports it — never implied or added decoratively if that verification doesn't actually exist behind it.

---

## 8. Business Section — Acknowledgment

*Purpose and psychology already specified in `PHASE_6A` §4.7.*

- **Professional tone:** Visually calmer and more contained than the sections around it — signaling "this is a related but distinct address" without leaving the page's single design system (`PHASE_5` §16, article 1 — there is never a second visual language, even here).
- **Visual separation:** A contained panel or bordered block rather than a full-bleed section like its neighbors — the containment itself is the signal that this section speaks to a different visitor, achieved through layout, not through a theme or component change.
- **Information hierarchy:** One short headline, one line of institutional capability, one CTA — nothing more (`PHASE_6A` §4.7's tight content hierarchy, applied visually).
- **CTA treatment:** Secondary-tier button (`PHASE_1` §6), deliberately not Primary-tier — Primary is reserved for the Shop path (`PHASE_5` §11's rule against two Primary-weight buttons competing in one view), and this section is not competing for that role.
- **Relationship to the consumer journey:** Visually adjacent to, but distinct from, the surrounding B2C sections — present in the main scroll (not exiled to the footer only, per `PHASE_6A` §4.7) but never rendered in a way that competes with or interrupts the primary narrative around it.

---

## 9. Newsletter — Invitation

*Purpose and psychology already specified in `PHASE_6A` §4.8.*

- **Visual simplicity:** One input field, one button, no imagery competing with the ask — the section's modesty is itself appropriate to how small a commitment it's requesting (`PHASE_6A` §4.8).
- **Input behaviour:** A single email field with inline, specific validation (`PHASE_2` §9's real-time/specific validation principle, applied here) — never a generic "invalid" state.
- **CTA emphasis:** Secondary-tier visual weight — this section never competes with Shop for Primary-tier prominence.
- **Trust messaging:** One honest, short line about what subscribing actually means (frequency, content) — no pre-ticked consent boxes, no bundling this signup with anything the visitor didn't explicitly ask for.
- **Success feedback:** A quiet toast confirmation (`PHASE_1` §6's Sonner-based Toast) — brief and understated, matching `PHASE_3` §5's rule that success acknowledgment is quiet satisfaction, never celebratory.

---

## 10. Footer — Foundation

*Purpose and psychology already specified in `PHASE_6A` §4.9. `PHASE_1` §6 already names the Footer as a shipped reference implementation — this section states the principles it already follows, not new ones.*

- **Hierarchy:** Organized by function — Shop, Company, Support, Business, Legal — each cluster visually equal, none dominating; the footer's job is completeness, not persuasion.
- **Grouping:** Columns/clusters labeled consistently with the primary navigation's own taxonomy (`PHASE_4B`), so a term never means one thing in the header and another in the footer.
- **Navigation:** Every page that genuinely exists in the sitemap is reachable from here — `PHASE_4B` §11's "everything discoverable" principle applied specifically to the footer as the page's most exhaustive link surface.
- **Trust elements:** Real company and GST/business information, visibly present rather than in the smallest possible type (`PHASE_3` §7's proactive transparency).
- **Legal visibility:** Policy/terms/privacy links set at `--text-caption` — present and legible, never hidden, but appropriately quiet relative to the footer's functional links.
- **Business links:** "For Business" repeated here as the standing second entry point (`PHASE_6A` §4.9), independent of whether the visitor saw or scrolled past Acknowledgment (§8) above.
- **Social links:** A quiet icon row, one consistent icon style (`PHASE_5` §8), each carrying an accessible label — present, never competing with the footer's primary navigational job.

---

## 11. Motion Opportunities

*Every rule below is an application of `PHASE_5` §10's already-frozen motion system and per-component contracts to this specific page — no new easing, duration, or technique is introduced.*

| Element | Motion | Governing contract |
|---|---|---|
| **Hero** | Slow fade + rise on load; optional imperceptible ambient image scale | `--duration-slow`, `PHASE_5` §10 |
| **Category / Product cards** | Lift + border glow on hover/focus | `PHASE_5` §10's card motion contract, `--duration-fast`/`--ease-default` |
| **Buttons** | Press feedback only, never lift (lift is reserved for cards) | `PHASE_5` §10 |
| **Product images** | Restrained zoom or secondary-photo swap on hover | `PHASE_1` §8 (opacity/transform only) |
| **Section entrances (Why Choose MUV, Origin, Evidence)** | Staggered scroll-reveal via the shipped `Reveal` component | `PHASE_1` §8 |
| **Category / Product mobile rows** | User-driven scroll-snap only — **no autoplay**, ever | `PHASE_3` §3's Calm principle; autoplay would also conflict with `prefers-reduced-motion` |
| **Newsletter success** | Brief, quiet toast — no celebratory animation | `PHASE_3` §5's Success Animation rule |
| **Scrolling** | Native, smooth, never hijacked or scroll-jacked | `PHASE_3` §5 |
| **Loading** | Progressive per section as the visitor scrolls; hero LCP element prioritized | `PHASE_1` §9 |

---

## 12. Responsive Behaviour

*Section order is fixed across every breakpoint (`PHASE_6A` §10, article 8) — nothing below changes that. Only density, column count, and per-section layout adapt, per `PHASE_1` §3.6's breakpoint scale and `PHASE_5` §7/§13.*

- **Desktop (`lg`/`xl`, 12-column):** Full editorial density — Hero at full viewport height, Category as a 5-across row, Featured Products at dense-commerce width (`PHASE_1` §7's `lg:grid-cols-4`-style density), Why Choose MUV as a multi-column claim grid, Origin as a two-column image/text split.
- **Laptop (`lg`, narrower end):** Same structure as desktop, with tighter gutters (`PHASE_1` §3.6) — no section recomposes, only spacing compresses slightly.
- **Tablet (`md`, 8-column):** Category and Featured Products step down to 2–3 visible items per view rather than the desktop count; Origin's two-column split narrows but doesn't yet stack; Why Choose MUV's claim grid reduces to two columns.
- **Mobile (base, 4-column):** Hero becomes content-driven height (§2); Category and Featured Products become horizontal scroll-snap rows (§3, §4); Why Choose MUV's grid becomes single-column; Origin's image/text stacks vertically; Acknowledgment's panel becomes full-width within the mobile container; Footer's columns stack into a single scrollable list, grouped labels preserved.

---

## 13. Accessibility

*`PHASE_5` §12's governing principle — accessibility is inherited from the token/component layer, not authored per screen — applies here in full. This section states what that means specifically for this page's structure.*

- **Reading order:** DOM order matches visual order in every section — no visual-only reordering that would desync a screen reader's flow from what's seen on screen.
- **Keyboard flow:** Linear through all nine sections; every interactive element (CTAs, category tiles, product cards, carousel controls) is reachable by keyboard. The Category and Product scroll-snap rows (§3, §4) provide explicit keyboard navigation (arrow keys or sequential tab stops) — swipe/drag is never the only way to move through them.
- **Focus visibility:** The dedicated focus-ring token (`PHASE_1` §3.4) appears on every interactive element — critically, on hover-revealed elements (Wishlist/Quick View icons, §4) as well, which must become visible on keyboard focus exactly as they do on mouse hover.
- **Screen reader expectations:** Each of the nine sections is a labeled landmark; every image carries meaningful, descriptive alt text (`PHASE_2` §12); a star rating is announced with its actual numeric value, not only conveyed visually.
- **Contrast expectations:** WCAG AA (`PHASE_1` §9/§12, `PHASE_5` §5) holds even in the page's quietest zones — footer legal text, captions, eyebrow labels — contrast is never sacrificed for a "quieter" visual register.
- **Touch interactions:** Every scroll-snap row (§3, §4, §7) remains fully swipeable and shows a visible affordance that more content follows — a partial next-item peek or pagination indicator — never a fully hidden gesture the visitor has to discover.
- **Reduced motion:** Every motion in §11 ships a `prefers-reduced-motion` fallback (`PHASE_1` §8) — carousels in particular default to instant, unanimated positioning when reduced motion is requested.

---

## 14. Homepage Visual Constitution

Permanent, binding on every future visual implementation of this page:

1. **One visual focus per section.** No section presents two elements competing for the same attention.
2. **Whitespace is intentional.** The homepage draws from the spacing scale's generous register by default — density is never added simply to fit more in.
3. **Photography before decoration.** Where a real image can carry a moment, it does — decorative gradients or abstract graphics never substitute for real product or brand photography.
4. **Motion communicates, or it's cut.** Every animation on this page answers `PHASE_5` §10's "what does this communicate" test — restated here because this page has more motion opportunity than any other single screen, and so more temptation to add motion that doesn't earn its place.
5. **Components stay consistent.** Every card, button, and carousel on this page uses the exact contract already frozen in `PHASE_5` §11 — this page never forks a one-off variant "just for the homepage."
6. **Content is the hero.** Real products, real photography, real claims, real reviews carry the page — the visual system supports them, it never performs instead of them.
7. **Section order never changes by device.** Density and layout adapt (§12); the nine-stage sequence itself (`PHASE_6A` §3) does not.
8. **No section is padded to look complete.** A section with insufficient real content (per `PHASE_6A` §3's Evidence/Community discipline) runs smaller, later, or not at all — never backfilled with filler to hit a visual target.
9. **Business/Institutional visibility never borrows Primary-tier weight.** Acknowledgment (§8) stays Secondary-tier by design, always — its visibility on the page is a legitimacy signal, not a competing conversion path.
10. **Dark mode is the whole page, without exception.** No section on this page ever switches to light mode; visual separation is achieved through containment and layout, never a theme change.

---

## 15. Approval Checklist

Every future homepage implementation must satisfy, before shipping:

- [ ] Does every section present exactly one dominant visual focus (§1, §14 article 1)?
- [ ] Does every value used trace to an existing `PHASE_1`/`PHASE_5` token — no new colour, font, spacing, or motion value invented (this document's opening note)?
- [ ] Does every card, button, and carousel use its already-frozen component contract, with no one-off homepage variant (§14 article 5)?
- [ ] Does every animation on the page pass `PHASE_5` §10's "what does this communicate" test (§11, §14 article 4)?
- [ ] Is section order identical across every breakpoint, with only density and layout adapting (§12, §14 article 7)?
- [ ] Is every interactive element — including hover-revealed and carousel controls — fully reachable and visible by keyboard (§13)?
- [ ] Does contrast hold at WCAG AA even in the page's quietest visual zones (§13)?
- [ ] Is the Business/Institutional section still visually Secondary-tier, never competing with the Shop path (§8, §14 article 9)?
- [ ] Does every review, rating, and claim shown trace to something real, with no section padded to look complete (§7, §14 article 8)?
- [ ] Does it remain compatible with `PHASE_1`–`PHASE_6A` in full?
- [ ] Does it violate any article of the Homepage Visual Constitution (§14)? If so, it does not proceed.

---

## Deliverables Checklist

1. ✅ Overall Visual Direction — §1
2. ✅ Hero Section — §2
3. ✅ Category Section — §3
4. ✅ Featured Products — §4
5. ✅ Why Choose MUV — §5
6. ✅ Brand Story — §6
7. ✅ Reviews / Social Proof — §7
8. ✅ Business Section — §8
9. ✅ Newsletter — §9
10. ✅ Footer — §10
11. ✅ Motion Opportunities — §11
12. ✅ Responsive Behaviour — §12
13. ✅ Accessibility — §13
14. ✅ Homepage Visual Constitution — §14
15. ✅ Approval Checklist — §15

**No React. No HTML. No CSS. No components built. No new colours or fonts. This is the visual specification for the homepage only — frozen pending approval.**
