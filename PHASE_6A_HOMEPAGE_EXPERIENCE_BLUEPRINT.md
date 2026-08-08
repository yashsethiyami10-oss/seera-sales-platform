# MUV™ — Phase 6A: Homepage Experience Blueprint™
### Version 1.0 · Status: DRAFT — awaiting approval
### Builds on `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md`, `PHASE_4B_INFORMATION_ARCHITECTURE.md`, `PHASE_4C_PLATFORM_ARCHITECTURE.md`, `PHASE_5_DESIGN_SYSTEM.md` (all frozen, binding)

> This document defines what the MUV homepage communicates, why each section exists, how a visitor should feel while scrolling, and how the page serves the business — not what it looks like. No UI, no wireframes, no colour, no typography, no spacing, no code.

**Relationship to `PHASE_2_CUSTOMER_EXPERIENCE.md` §5:** that section already established the homepage's core skeleton — its purpose ("a trust-and-orientation device," not a catalogue), a five-step information hierarchy (brand promise → category orientation → curated proof → trust reinforcement → low-commitment off-ramp), and validated it against the shipped sequence (Hero → Shop by Category → Featured Products → Why Choose MUV → Footer). This phase does not re-derive any of that. It takes that skeleton as fixed, and builds the full, execution-ready blueprint on top of it — extending the four validated sections into a complete nine-section journey, and specifying, per section, the nine dimensions `PHASE_2` §5 didn't go granular enough to cover (psychology, business objective, content hierarchy, both CTA tiers, expected emotion, trust signals, and success metrics). Where a `PHASE_2` §5 position is simply inherited, this document says so and moves on.

---

## 1. Homepage Mission

**Purpose:** The homepage is MUV's handshake — the one page nearly every visitor sees regardless of how they arrived, and the page with the least context to work with (no prior trust, no known intent, no category already chosen). Its job is not to sell a specific product; it's to make "is this legitimate, and is it for me" resolve to *yes* fast enough that the visitor stays for the pages that actually sell.

**Business goals:** Convert cold traffic into oriented visitors (not yet buyers) who reach a category or product page with intent; establish enough brand trust in one scroll that later, higher-friction moments (cart, checkout) start from a position of credibility rather than skepticism; surface the institutional/bulk buying path (`PHASE_2` §2, §4) without letting it dilute the primary consumer narrative; convert the not-yet-ready visitor into a reachable one (newsletter) rather than losing them entirely.

**Customer goals:** Understand what MUV actually is, in a category landscape (home/fabric/body/personal/car) unusual enough for one brand that confusion is the real risk (`PHASE_2` §1); judge quickly whether "affordable luxury" is a real claim or empty positioning; find their own reason to keep going, whatever that reason is — a category, a specific product, a price point, a story.

**Brand goals:** Prove `PHASE_3`'s brand soul in the highest-traffic, lowest-context moment it will ever be tested in. A visitor who never returns still saw, in one scroll, whether MUV is calm, honest, and considered, or generic and try-hard. The homepage is the brand's most repeated single impression — treated with the weight that implies.

**Why the homepage exists, in one sentence:** It is the page that turns "never heard of this brand" into "I know roughly what this is, and I want to see more" — nothing more ambitious than that, and nothing less.

---

## 2. First Impression

**The first five seconds:** Before a single word is consciously read, the visitor should register three things in sequence so fast it feels simultaneous — *this looks considered* (visual craft, not a template), *this is a real, functioning business* (loads fast, nothing broken, nothing straining to look bigger than it is), and *this might actually be relevant to me* (the first screen implies a category or need, not an abstract mood board).

**What customers should immediately understand:** That MUV makes things people use to take care of their home, fabric, body, and car — not what it is *not* (not a single-category brand, not purely a fragrance or beauty brand, not a discount outlet). The five-category breadth is the single hardest thing to communicate in five seconds and the single most important thing to get right (`PHASE_2` §1) — the first screen's job is to imply range without listing it yet.

**What emotions they should feel:** Oriented curiosity, exactly as `PHASE_3` §2's emotional-design table names it for this touchpoint — not excitement, not urgency, not being sold to. Calm confidence that they've landed somewhere worth a few more seconds.

**How Keep Muving™ should be *experienced*, not read:** The tagline itself may or may not appear on screen in the first five seconds — that's a copy decision, not this document's concern. What matters is that the *feeling* of forward motion is already present before the word is ever seen: the page loads without a stall (performance *is* the first, most literal expression of "keep moving" — `PHASE_1` §9's LCP/priority discipline exists for exactly this moment), nothing on screen demands effort to parse, and the layout already implies "there's more below" rather than presenting as a closed, complete statement. A visitor who scrolls without being told to has already experienced Keep Muving once, wordlessly, before reading a single sentence about it.

---

## 3. Homepage Story

Nine stages, each earning the next. `PHASE_2` §5 validated the first four positions against the shipped sequence; stages five through nine extend that skeleton to the full ambition this phase sets out.

1. **Arrival** *(Hero — inherited from `PHASE_2` §5, position 1)* — resolve legitimacy and category relevance before anything else is asked.
2. **Orientation** *(Shop by Category — inherited, position 2)* — resolve "which of these five is mine," turning breadth from a confusion risk into a strength.
3. **Proof** *(Featured Products — inherited, position 3)* — make the promise concrete: real products, real prices, real craft.
4. **Reassurance** *(Why Choose MUV / trust reinforcement — inherited, position 4)* — answer whatever doubt is left once desire exists, before asking for more commitment.
5. **Origin** *(Brand Story — new)* — for the visitor still here after four sections' worth of orientation and proof, this is the moment they've earned the deeper "why." Placed *after*, never before, orientation — a visitor who doesn't yet know what MUV sells has no use for who MUV is; that would slow the exact moment `PHASE_2` §1 says must resolve fast.
6. **Evidence** *(Proof of trust — reviews/ratings, real only — new)* — a second, more concrete trust layer, distinct from Reassurance's *claims* (§4's "Why Choose MUV") — this section is other people's *experience*, positioned once the brand's own claims have already been heard, as independent confirmation of them.
7. **Acknowledgment** *(Business/Institutional — new)* — a short, dignified section confirming MUV serves hotels, hospitals, restaurants, and bulk buyers too (`PHASE_2` §2), positioned late because it is not the primary visitor's concern, but present on the homepage itself — not only in the footer — because an institutional visitor scanning the page for legitimacy deserves to see themselves acknowledged, not just filed under a footer link (`PHASE_3` §9's "nobody's purchase is treated as the afterthought").
8. **Invitation** *(Newsletter — inherited, position 5)* — the low-commitment off-ramp for the visitor who isn't ready to buy today, unchanged from `PHASE_2` §5.
9. **Foundation** *(Footer — inherited)* — continuity, full navigation, policies, and the second, always-available business entry point.

**Deliberate deviations from a generic template, stated explicitly:** A separate "Benefits" section is *not* included — it would duplicate Reassurance (Why Choose MUV already carries that job) and add a section purely for the sake of having one, which `PHASE_3` §10 names directly as an anti-pattern (over-designed pages). A "Community" section (UGC, social feed, customer photos) is **deliberately excluded from the committed sequence** — not because the idea is wrong, but because `PHASE_3` §7's Trust Philosophy forbids any trust signal that isn't real, and a community section only earns its place once genuine, sufficient user-generated content exists to fill it; building the section before the content exists would force either padding it with something inauthentic or shipping a visibly thin section, both worse than not having it. It is named here as a **future addition**, not a present one — to be added through `PHASE_4A` §12's Decision Framework once real content exists to justify it.

---

## 4. Homepage Sections

Each of the nine stages, specified in full.

### 1. Arrival (Hero)
- **Purpose:** Resolve legitimacy and premium positioning before anything else is asked of the visitor.
- **Customer psychology:** "Did I land somewhere legitimate?" — the single highest-stakes, highest-bounce-risk moment in the entire journey (`PHASE_2` §3).
- **Business objective:** Minimize bounce rate on first-touch landing; establish the emotional register (calm, considered) that every later section inherits.
- **Content hierarchy:** Brand promise first — an emotional hook, not a product spec or a category list (`PHASE_2` §5).
- **Primary CTA:** A single "Shop" or "Explore" action, for the visitor already oriented enough to act.
- **Secondary CTA:** An implicit invitation to scroll (never a hard-sell CTA competing with the primary one) — the entire rest of the page *is* the secondary CTA.
- **Expected emotion:** Oriented curiosity (`PHASE_3` §2).
- **Trust signals:** Visual craft itself is the trust signal here — before any specific claim is readable, competent, considered design is already communicating "real business" (`PHASE_2` §5's "emotional trust first").
- **Success metrics:** Bounce rate, time-to-first-scroll (`PHASE_2` §14).

### 2. Orientation (Shop by Category)
- **Purpose:** Answer "which of these five is relevant to me" — the direct resolution to `PHASE_2` §1's single biggest homepage risk (breadth reading as confusion).
- **Customer psychology:** "Do they actually have range, or is this a gimmick?" (`PHASE_2` §8) — discovering real breadth, not being asked to already know what they want.
- **Business objective:** Route the visitor toward *a* category — any category — since a visitor who picks one is dramatically more likely to convert than one still evaluating the whole brand in the abstract.
- **Content hierarchy:** All five categories presented with equal visual weight — no category (including ones still "coming soon," `PHASE_2` §4/§6) is hidden or deprioritized, since an absent category reads as a gap in the brand, not a deliberate omission.
- **Primary CTA:** Selecting a category tile.
- **Secondary CTA:** None needed — the category grid *is* the action; adding a competing CTA here would fragment attention `PHASE_3` §3's Clarity principle explicitly warns against.
- **Expected emotion:** Discovering real breadth (`PHASE_2` §8) — curiosity resolving into confidence that this is a real, multi-category brand.
- **Trust signals:** Breadth itself, shown plainly — five real categories, not five aspirational labels.
- **Success metrics:** Category-to-product click-through (`PHASE_2` §14).

### 3. Proof (Featured Products)
- **Purpose:** Make the promise concrete — where "premium" gets tested against something real and priced (`PHASE_2` §5).
- **Customer psychology:** "Could this actually be good?" (`PHASE_2` §8) — specific reassurance, not generic hype.
- **Business objective:** Create desire for a specific, purchasable thing — the moment abstract brand impression becomes a concrete product intent.
- **Content hierarchy:** Curated, not exhaustive — a handful of products chosen to represent range across categories, never a "browse everything" dump; each card leads with its real, specific USP (`PHASE_3` §7), never a generic tagline.
- **Primary CTA:** View product / Add to cart, on each card.
- **Secondary CTA:** "Shop all" or equivalent, for the visitor who wants more than the curated set.
- **Expected emotion:** Specific desire, replacing abstract curiosity.
- **Trust signals:** Real photography, real pricing shown without friction, a real (sourced) USP per product (`PHASE_3` §7).
- **Success metrics:** Add-to-cart rate, product-card click-through (`PHASE_2` §14).

### 4. Reassurance (Why Choose MUV)
- **Purpose:** Resolve whatever doubt remains, now that desire has been created — never presented before desire exists, since reassurance offered too early reads as defensive (`PHASE_2` §5).
- **Customer psychology:** The rational check that follows an emotional "I want this" — "is this actually a good decision."
- **Business objective:** Reduce the hesitation that would otherwise surface later, at cart or checkout, where it's far more expensive to resolve (`PHASE_2` §8).
- **Content hierarchy:** A small number of concrete, specific claims (delivery reliability, ingredient honesty, real business legitimacy) — never a longer list that dilutes into generic reassurance (`PHASE_3` §3's Simplicity principle).
- **Primary CTA:** None required — this section's job is belief, not action; forcing a CTA here would rush a moment meant to slow down and reassure.
- **Secondary CTA:** A soft continuation prompt into Origin (§4.5) for the visitor who wants the fuller story.
- **Expected emotion:** Reassured desire (`PHASE_2` §2's Product Page emotion, arriving one section early because the homepage's version of this moment is about the brand, not yet a specific product).
- **Trust signals:** Specific, provable claims only (`PHASE_3` §7) — never adjectives standing in for evidence.
- **Success metrics:** Scroll depth past this section (a proxy for sustained interest, since this section has no direct click event of its own).

### 5. Origin (Brand Story)
- **Purpose:** Give the still-engaged visitor the deeper "why" — who MUV is and what "Keep Muving" actually means (`PHASE_3` §1), earned by everything that came before it.
- **Customer psychology:** "Is there something real behind this, or is it just good marketing?" — the moment a considered visitor starts evaluating the brand's substance, not just its products.
- **Business objective:** Convert brand impression into brand *affinity* — the layer that makes a visitor choose MUV over a functionally similar competitor later, even when this section itself drives no immediate click.
- **Content hierarchy:** Short and specific — MUV's actual belief (maintenance deserves care, not shame — `PHASE_3` §1), never a long corporate "about us" essay; length here is a trust signal in reverse — a story that goes on too long starts to feel like it's compensating.
- **Primary CTA:** None, or a quiet "Our Story" link to a fuller page for the visitor who wants more — the section itself should not feel like it's selling.
- **Secondary CTA:** None — a second CTA here would contradict the section's purpose (belief, not conversion).
- **Expected emotion:** Genuine interest, the same register `PHASE_3` §2 assigns to the Blog/Journal touchpoint — "not being sold to."
- **Trust signals:** Restraint and specificity in the writing itself (`PHASE_3` §6) — precision, not adjectives, is what makes a brand story read as true rather than performed.
- **Success metrics:** Dwell time / engagement on this section specifically, and click-through to a fuller brand-story page where one exists.

### 6. Evidence (Proof / Reviews)
- **Purpose:** A second, independent trust layer — other people's experience, distinct from the brand's own claims in Reassurance.
- **Customer psychology:** "Do other people actually trust this, or is it just their word for it?"
- **Business objective:** Convert residual skepticism using a voice the brand doesn't control — independent validation reads as more credible than any self-authored claim, however honest.
- **Content hierarchy:** Real reviews or ratings only, shown as they genuinely are, including neutral ones where they exist — never filtered to only-positive, never fabricated (`PHASE_3` §7, restated here as this section's absolute precondition). Where genuine review volume doesn't yet exist, this section is honestly thinner or omitted, never backfilled with anything invented.
- **Primary CTA:** None — this section supports belief, same as Reassurance.
- **Secondary CTA:** A link to full reviews/ratings on relevant product pages, for the visitor who wants to verify further.
- **Expected emotion:** Confirmed trust — the point where doubt should be substantially resolved.
- **Trust signals:** Genuine, unfiltered social proof is the entire content of this section — its only reason to exist.
- **Success metrics:** Review submission rate is the upstream metric this section depends on (`PHASE_2` §14); downstream, scroll-through rate past this section.

### 7. Acknowledgment (Business / Institutional)
- **Purpose:** Confirm, briefly and visibly, that MUV serves institutional and bulk buyers (`PHASE_2` §2) — without turning the homepage into a second, competing narrative for that audience.
- **Customer psychology:** For an institutional visitor (a hotel or hospital procurement contact, a restaurant owner) — "does this brand actually take businesses like mine seriously, or am I an afterthought?" (`PHASE_3` §9).
- **Business objective:** Surface the higher-predictability, lower-CAC bulk/business channel (`PHASE_4A` §7) without diluting the primary consumer narrative that occupies the rest of the page — low real estate, high legitimacy.
- **Content hierarchy:** A single, short statement of institutional capability plus one path forward — never a parallel product catalogue or full B2B pitch; the fuller business journey belongs to a dedicated page/path (`PHASE_2` §4), not this section.
- **Primary CTA:** "For Business" (or equivalent) — leads to the dedicated bulk/institutional path (`PHASE_2` §4).
- **Secondary CTA:** None — a single clear path is correct for a section this small.
- **Expected emotion:** Recognized, not overlooked — the B2B equivalent of `PHASE_3` §2's "recognized, not surveilled" register for accounts.
- **Trust signals:** Concrete institutional facts where genuinely available (categories served, scale of operation) — never invented client names or numbers.
- **Success metrics:** Business/bulk inquiry conversion, tracked as its own funnel per `PHASE_2` §14 — never folded into general homepage CTA metrics.

### 8. Invitation (Newsletter)
- **Purpose:** The low-commitment off-ramp for the visitor who isn't ready to buy today — inherited unchanged from `PHASE_2` §5.
- **Customer psychology:** "I'm not buying right now, but I wouldn't mind hearing more."
- **Business objective:** Convert an otherwise-silent exit into a reachable contact — losing this visitor's attention entirely is worse than giving them a low-friction way to stay in touch.
- **Content hierarchy:** One field, one clear value statement for signing up — never a form that itself becomes a new source of friction.
- **Primary CTA:** Email submission.
- **Secondary CTA:** None.
- **Expected emotion:** No pressure — this section should feel optional in tone as well as function; any urgency language here would violate `PHASE_3` §6's forbidden patterns outright.
- **Trust signals:** A clear, honest statement of what they're signing up for (frequency, content) — never a vague "join us."
- **Success metrics:** Newsletter signup rate (`PHASE_2` §14's exit-prevention lens).

### 9. Foundation (Footer)
- **Purpose:** Continuity, not a hard stop — full navigation, policy transparency, and the always-available second entry point to the business/bulk path (`PHASE_2` §4/§5).
- **Customer psychology:** "If I need something later, will I be able to find it?"
- **Business objective:** Cover every remaining navigational and trust need in one place — company info, policies, support, business path — so nothing is ever genuinely unreachable from the homepage.
- **Content hierarchy:** Company legitimacy info, policy links, support, and business entry point, organized by what a visitor would actually look for, not by internal site structure (`PHASE_4B` §11).
- **Primary CTA:** None dominant — this is a utility section, not a conversion moment.
- **Secondary CTA:** "For Business" link (the footer's standing role as the second B2B entry point, `PHASE_2` §4).
- **Expected emotion:** Reassured continuity — leaving without buying doesn't have to mean leaving the relationship (`PHASE_2` §5's Exit Prevention).
- **Trust signals:** Real company information, real policies, visibly present rather than buried (`PHASE_3` §7's proactive transparency).
- **Success metrics:** Footer link click-through (a proxy for whether visitors trust the brand enough to explore policy/company detail).

---

## 5. Scroll Journey

**Curiosity → trust:** Arrival creates curiosity by resolving legitimacy; Orientation converts it into engagement by proving real breadth; Proof turns engagement into specific desire for a real, priced thing. By the end of Proof, the visitor has moved from "is this legitimate" to "I want something specific" — curiosity has already become desire before trust is even directly addressed.

**Trust becomes purchase intent:** Reassurance and Evidence exist specifically to convert desire into intent by removing the rational objections that would otherwise surface later (`PHASE_2` §8). Origin deepens *why* to trust, which matters less for this specific visit and more for whether the visitor returns — brand affinity is a multi-visit asset, not a single-scroll one.

**Purchase intent becomes action:** Intent, once formed in Reassurance/Evidence, needs almost no further push — which is exactly why Acknowledgment, Invitation, and Foundation carry no aggressive CTA of their own. A visitor who has already formed intent will act on the CTAs already offered upstream (in Orientation, Proof); the closing sections exist to serve visitors who *haven't* formed intent yet, offering them a graceful landing (bulk path, newsletter, footer) instead of a repeated hard sell.

**The overall shape:** Two peaks, not a single ramp. Emotional intensity rises through Arrival→Proof (curiosity to desire), settles through Reassurance→Evidence (desire being rationally confirmed, a calmer register), rises briefly again for the still-engaged visitor in Origin (affinity), then tapers deliberately through Acknowledgment→Invitation→Foundation — a controlled descent, never an abrupt stop, consistent with `PHASE_2` §5's rule that no section is allowed to end on an unanswered question.

---

## 6. Conversion Strategy

**The governing rule:** exactly one *primary* conversion path exists on the homepage — toward shopping — reinforced at three points (Arrival's CTA, Orientation's category selection, Proof's add-to-cart), never competing with itself. Every other CTA on the page is secondary by design, not by accident.

- **Shop / Discover buttons:** Introduced early and repeated (Arrival, Orientation, Proof) because this is the path most visitors are on — repetition here is reinforcement, not redundancy, since each instance meets the visitor at a different readiness level (`PHASE_2` §5's CTA Strategy).
- **Business CTA:** Introduced exactly once on the homepage itself (Acknowledgment), plus once more, always, in Foundation — never in the primary scroll path above it, because a B2B CTA competing for attention against the B2C shopping path would blur the "who is this page for" clarity `PHASE_2` §1 demands resolve fast.
- **Newsletter:** Introduced last (Invitation), specifically because it's the *lowest*-commitment ask on the page — offering it earlier would present a smaller commitment before the visitor has even been given the chance to make the bigger one (an actual purchase intent), which would read as MUV expecting the visitor to leave.
- **Social proof / Reviews:** Introduced after the brand's own claims (Evidence follows Reassurance) — proof from others is more persuasive placed *after* the brand has already stated its case, not before, since it then reads as confirmation rather than as the opening argument.
- **Featured products:** Introduced early (Proof, position 3) — deliberately before Reassurance, because desire should exist before the brand starts defending itself; reassurance offered before desire reads as pre-emptively defensive.
- **Offers/discounts:** Not a dedicated homepage section — per `PHASE_3` §6's forbidden patterns (no manufactured urgency, no discount-marketing voice), any real, honest discount belongs inside Proof's product cards (where MRP-vs-price is already a shipped, honest pattern) rather than as a separate homepage "SALE" section that would shift the page's register from considered to promotional.
- **Education (brand story, ingredient/process content):** Introduced mid-to-late (Origin) — after desire and before the final soft asks, since education serves affinity more than immediate conversion, and belongs where the visitor has already chosen to stay engaged.

---

## 7. Mobile Experience

*Mobile is the primary surface for this brand (`PHASE_2` §11, `PHASE_5` §13) — every rule below assumes mobile is the reference experience, not an adaptation of desktop.*

- **Thumb zones:** The one CTA that matters most in any given section (Shop, category selection, add-to-cart) sits within comfortable one-handed reach — never pushed to a corner that requires a re-grip (`PHASE_2` §11).
- **Scrolling rhythm:** The nine-section sequence (§3) holds on mobile exactly as on desktop — section *order* never changes by surface, since that order is a narrative decision, not a layout one. What changes is density: sections compress vertically (`PHASE_5` §6/§7's mobile spacing tokens) and each section shows fewer simultaneous items (e.g., Proof shows fewer product cards per view, Orientation's five categories stack rather than spread) so scrolling stays brisk rather than tall.
- **Section priority:** No section is dropped on mobile — dropping a section would mean the mobile visitor (the majority of this brand's traffic) gets a lesser experience than the desktop visitor, which contradicts treating mobile as primary. What's allowed to compress is *content volume within* a section, never the section's presence.
- **Loading strategy:** The Arrival section's hero image is the one true LCP element (`PHASE_1` §9) — everything below loads progressively as the visitor scrolls, so the page never front-loads more than the first screen actually needs. This is Keep Muving applied literally to performance (§2) — a mobile visitor on a slower connection should never feel the page stall.
- **CTA positioning:** Primary CTAs stay anchored near natural pause points in the scroll (end of Arrival, within each Orientation tile, on each Proof card) rather than requiring the visitor to scroll back up to act — mobile scrolling is one-directional in practice, and a CTA that requires backtracking is a stall.

---

## 8. Trust Strategy

**Where trust is earned, and why, across the sequence:** Trust escalates in the same order `PHASE_2` §5 already established — emotional trust first (Arrival's visual craft, before a single claim is read), then breadth trust (Orientation proving five real categories), then product-level evidence (Proof's specific USPs), then explicit brand reassurance (Reassurance's concrete claims), then independent confirmation (Evidence's real reviews), then relationship depth (Origin's story, which matters more for return visits and referrals than this one), then institutional legitimacy (Acknowledgment, for the visitor evaluating MUV as a supplier, not a shopper), then continuity (Foundation's policy transparency).

**What belongs at each stage:**
- Arrival: nothing explicit — craft itself is the signal.
- Orientation: real range, shown, not claimed.
- Proof: real photography, real pricing, sourced USPs.
- Reassurance: specific, provable claims (`PHASE_3` §7) — never adjectives.
- Origin: restraint in the writing itself, per `PHASE_3` §6.
- Evidence: genuine reviews only, including any neutral ones that exist.
- Acknowledgment: concrete institutional facts, never invented client names.
- Invitation: an honest statement of what signing up actually means.
- Foundation: real company info and real, visible policies.

**Why this order, specifically:** Because each stage's trust signal only lands if the visitor has already been given a reason to care about the claim it's answering — showing reviews (Evidence) before the visitor has any desire for a specific product (Proof) would be evidence for a question they haven't asked yet. Trust here is sequenced to always arrive one step *after* the doubt it resolves becomes live, never before.

---

## 9. Keep Muving™ Integration

Not placed as a slogan — experienced as the shape of the scroll itself, per `PHASE_3` §1's three layers.

**Literal:** The physical motion of scrolling itself is the most literal expression available on this page — a homepage that loads fast and never stalls (§7) is Keep Muving expressed through performance before it's ever expressed through language.

**Metaphorical:** Every section hands the visitor cleanly to the next — Arrival resolves into Orientation, Orientation into Proof, and so on, with no section ending on an unanswered question (`PHASE_2` §5's Exit Prevention). A homepage that ends any section on ambiguity is, structurally, a stall — the exact failure mode the brand name explicitly promises never to be. The forward-only shape of §5's scroll journey — rising, settling, rising again, then tapering deliberately rather than stopping abruptly — is itself the metaphor made structural.

**Emotional:** The visitor arrives with an unspoken, low-grade question ("is this worth my time") and leaves — whichever section they leave from — having *moved somewhere*: toward a product, toward the brand's story, toward a business inquiry, or at minimum toward a newsletter signup that keeps the relationship alive. No exit from this page is a dead end (§3's exclusion of forced, unearned sections exists partly to protect this — a thin, padded "Community" section that visitors can tell is empty would itself be a stall, the opposite of what it's meant to represent). The tagline is earned by the page actually behaving this way, not by appearing in it.

---

## 10. Homepage Constitution

Permanent, binding on every future revision of the homepage:

1. The homepage sells the brand, not a specific product — a visitor should leave oriented and interested, not pressured into a single SKU decision.
2. No section ends on an unanswered question. Every section hands the visitor cleanly to the next.
3. Breadth (five categories) is always shown as range, never allowed to read as confusion — Orientation's job is never optional or diluted.
4. No trust signal appears before it's genuinely real. A thin or empty section is worse than an absent one (§3's Community exclusion is the standing example).
5. Exactly one primary conversion path exists at a time (§6) — every other CTA on the page is deliberately secondary.
6. Institutional/business visitors are acknowledged on the page itself, not only in the footer — visibility here is a legitimacy signal, not a courtesy.
7. No urgency is manufactured, ever — not in copy, not in a countdown, not in an offer's framing (`PHASE_3` §6).
8. Section order is a narrative decision and does not change by device (§7) — only density does.
9. Every claim placed on this page traces to something real and provable (`PHASE_3` §7) — no exceptions for the homepage's high visibility; if anything, a higher bar because of it.
10. The homepage is revisited as the brand and content mature — a new section is added only when it has genuine content to justify it (§3), never to fill a template.

---

## 11. Approval Checklist

Every future homepage revision must satisfy, before implementation:

- [ ] Does the first five seconds still resolve legitimacy and relevance, per §2?
- [ ] Does every section hand off cleanly to the next, with no unanswered question left behind (§3, §10 article 2)?
- [ ] Is there still exactly one primary conversion path, with every other CTA deliberately secondary (§6)?
- [ ] Does every trust signal on the page trace to something real, with nothing padded or invented (§8, §10 article 4/9)?
- [ ] Is the institutional/business path still visibly acknowledged on the page itself, not only in the footer (§10 article 6)?
- [ ] Does the mobile experience preserve every section and its order, adjusting only density (§7)?
- [ ] Does the page still read, top to bottom, as one company (`PHASE_3` §11) and one design system (`PHASE_5` §16)?
- [ ] Is any new section justified by genuine content already in hand, not added to fill a perceived gap (§3, §10 article 10)?
- [ ] Does it remain compatible with `PHASE_1`–`PHASE_5` in full?
- [ ] Does it violate any article of the Homepage Constitution (§10)? If so, it does not proceed.

---

## Deliverables Checklist

1. ✅ Homepage Mission — §1
2. ✅ First Impression — §2
3. ✅ Homepage Story (9-stage sequence, reasoned) — §3
4. ✅ Homepage Sections (all 9, full dimensions) — §4
5. ✅ Scroll Journey — §5
6. ✅ Conversion Strategy — §6
7. ✅ Mobile Experience — §7
8. ✅ Trust Strategy — §8
9. ✅ Keep Muving™ Integration — §9
10. ✅ Homepage Constitution — §10
11. ✅ Approval Checklist — §11

**No UI. No wireframes. No colours. No typography. No spacing. No frontend. No React. No components. No code. This is the experience blueprint for the homepage only — frozen pending approval.**
