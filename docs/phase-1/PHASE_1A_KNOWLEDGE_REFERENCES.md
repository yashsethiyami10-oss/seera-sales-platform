# Phase 1A — Knowledge Book References

Every Knowledge Book section actually read and cited during this gap analysis, exactly as required
by the Knowledge Book Method rules in the Phase 1A brief ("cite the exact file and heading," "do not
reread unrelated volumes unnecessarily"). Only sections relevant to the website gap analysis were
read — the full ~20,845-line Master file and ~4,199-line AI Sutra were not read cover-to-cover; see
`MUV_PHASE1_KNOWLEDGE_AUDIT.md` for the full-file inventory from Phase 0.

**A tooling note, for anyone re-running these citations:** the `Grep` tool returned one confirmed
false-positive match against the large Master file during this pass (a phantom "teaser language:
Muving Soon™" hit that a follow-up `Read` at the same location proved did not exist, and three
repeat searches for the same phrase then correctly returned zero matches). Every citation below was
therefore cross-checked with a direct `Read` of the surrounding lines before being used — line numbers
here are `Read`-confirmed, not taken from a single `Grep` hit.

---

## Part I — MUV Philosophy, MUV Darshan™, MUV Sutras™, MUV Tattva™ & Knowledge Governance

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| `.claude/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt`, lines 75–120 | Part I front matter / Table of Contents | General constitution framing — used only to confirm Part I is philosophy/governance, not website-specific; not deep-read this pass (out of scope per "do not reread unrelated volumes") | None |

## Part II — Enterprise Operating System, Website Architecture & Knowledge Governance

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file, lines 877–928 | Part II front matter, Table of Contents | Confirms Part II (source: Volume II — MUV Operating System™) is the primary website-architecture authority | None |
| Master file, lines 928–1058 | Chapter 6 — Digital Operating Foundation | Digital Operating Stack (Founder direction → brand/product truth → CX → commerce → backend → communication → admin → validation) — used for Homepage, Admin Panel, general architecture rows | None |
| Master file, lines 1062–1206 | Chapter 7 — Website Architecture (incl. "Website Architecture Model," "Information Architecture," "Business Engagement," "Premium without Friction," "Content Control," "Responsive Review," "Common Mistakes") | Homepage, Header, Navigation, Footer, Shop, Category pages, Institutional/Business pathway separation, Mobile responsiveness, CMS content-governance | None |
| Master file, lines 1209–1334 | Chapter 8 — Backend, Integration & Automation (incl. "Integration Rule," "Automation," "Automation Control Sheet," "Caching and Freshness," "Validation Gate") | APIs, Notifications, Product/Inventory/Order data-source integrity, caching/CMS revalidation | None |

## Part III — Brand System, Identity & Keep Muving™

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file, lines 1682–1761 | Part III front matter, Table of Contents | Confirms Part III (source: Volume III — MUV Brand Sutra™) as the sole brand-identity authority | None |
| Master file, lines 1771–1801 | Chapter 11 — Brand Origin & Naming, §1 "Brand Identity Foundation," "Brand Identity Statement" | Direct source for "Muv must not be positioned as a detergent-only brand" — *"Muv is a broad care brand built around cleaning, care, movement, and a premium standard—not a name limited to one product category."* | None |
| Master file, lines 1944–1958 | Chapter 12 — Logo & Mark System, §6 "Brand Personality" | Confirms "Premium" is an approved personality trait, not a forbidden word | **Contradicts a legacy project doc** — see Conflicts section below |
| Master file, lines 1960–2058 | Chapter 12, §10 "Visual Identity Principles," §11 "Logo Usage Principles," "Logo Approval Checklist" | Logo/header usage rules — used for Header row (logo governance), not deep-verified against the actual `/logo.png` asset (a visual-asset check is out of this text-based pass's reach) | None |
| Master file, lines 2062–2093 | Chapter 13 — Language, Pronunciation & Tagline, "Pronunciation Standard," "Written Identity" | **Primary citation for brand-casing gaps.** *"Use Muv in customer-facing text where the approved brand form requires a capital M and lowercase uv. The formal titles of the Knowledge Library and registered systems may continue to use approved uppercase styling such as MUV Darshan™."* | None — but see Findings note below on scope (logo wordmark vs. running text) |
| Master file, lines 2094–2143 | Chapter 13, §7 "Tone of Voice," §8 "Messaging System" (incl. "Level 2 — Category Message": *"home care, fabric care, body care, car care, or another approved area"*) | Brand voice consistency; category-naming cross-check | None |
| Master file, lines 2144–2202 | Chapter 13, §9 "Keep Muving™ Philosophy" (incl. "Correct Use," "Incorrect Use," "Relationship with 'Magic in Muv'") | **Primary citation for the "moving" vs. "Muving" spelling gap** — *"Preserve the spelling **Muving**... Changing the spelling to match generic grammar"* is listed under "Incorrect Use." Also the authority for the "Magic in Muv" rule (existing approved labels preserved, no new use). | None |
| Master file, lines 2205–2264 | Chapter 14 — Identity Governance, §12 "Typography System," §13 "Color Philosophy" | Design-system cross-check — confirms no typeface is formally locked and category colour differentiation (lavender/pink/emerald/orange) is "evidence-supported... but not a complete final colour specification" | None — explicitly **not yet binding**, so current single-lavender-accent implementation is not a violation |

## Part V — Products, Research, Innovation & Portfolio

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file — Master Index entries for Chapters 22–23 (confirmed via Master Index, lines ~20765–20766) | "Chapter 22 — Home & Fabric Care Formulation," "Chapter 23 — Personal & Body Care Formulation" | Cross-check only — confirms Part V organizes product formulation by category family; full chapter text not read this pass (formulation/ingredient detail is out of scope for a website gap analysis) | None |

## Part VIII — Sales, Pricing, Distribution & Marketplaces

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file, lines 8302–8360 | Part VIII front matter, Table of Contents | Source for **Institutional Sales / CRM dependency** — explicitly names "CRM" under Chapter 5 ("forecasting, metrics, CRM, decisions, incentives...") and separates institutional/distributor/partner management as its own domain. Full chapters not read this pass — Institutional Sales implementation is explicitly out of scope for Phase 1A. | None |

## Part IX — Customer Experience, Service & Loyalty

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file, lines 9997–10066 | Part IX front matter, Table of Contents, Chapter 41 — Customer Promise & Experience Context (opening) | General CX philosophy (Promise → Interaction → Reality → Interpretation → Trust/Friction → Learning) used for Checkout/Account/Orders/Reviews rows | Volume IX's own TOC is heavily food-service/outlet-oriented (Ch. 42 "Food-Service Product Experience," Ch. 43 "Outlet Culture & Environment") — those two chapters were **not read**, judged not applicable to an e-commerce website gap analysis; flagged in case a future phase needs the physical-retail/outlet CX content |

## Part XII — Technology, Digital Ecosystem, Data & AI

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| Master file, lines ~15470–15519 | Part XII front matter, "Apply it in this order," **"Status Language"** table (Current / Approved / Planned / Experimental / Future Vision / Unknown) | Used as the classification framework for distinguishing "what's actually live" vs. "what's aspirational" throughout this gap analysis | None |
| Master file, lines 15879–16071 | Chapter 60 — Website & Customer Technology System (§3.1 "MUV Digital Flagship™" through §3.9 "Quality Measures," "Action Checklist") | **Primary citation for nearly every technical/CX row** — website architecture responsibilities table, product-information system, content management, customer accounts, commerce/orders/fulfilment, digital experience governance, quality measures | None |

## Muv AI Sutra™ (separate file, referenced for the "MUV AI dependencies" section only)

| File | Heading | Area supported | Ambiguity/conflict |
|---|---|---|---|
| `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` (content already read/cited during the Phase 0 Knowledge Library audit — not re-read line-by-line this pass, per "do not reread unrelated volumes unnecessarily") | Chapter 4 — Muv Knowledge System, §4.2–4.3, §4.10; Chapter 5, §5.4 "Retrieval" | Used only to state the MUV AI dependency gap: the Sutra requires "AI searches canonical knowledge before any external source" and positions the Knowledge Library as senior — **no such retrieval/knowledge-object infrastructure exists anywhere in the current codebase** (confirmed: `lib/recommendations.ts`/`lib/preferences.ts` are plain Prisma queries, unconnected to either Knowledge Book file) | **Carried forward from Phase 0**, not re-litigated: the Sutra's relationship to Part XII's own AI chapters (58–64) remains only partially declared — see `CLAUDE.md`'s "Known conflict" note |

---

## Conflicts and Ambiguities Found This Pass

### 1. "Premium" — legacy project doc vs. Knowledge Book (not a Knowledge-Book-internal conflict, but worth flagging)
`components/storefront/brand-story.tsx`'s own code comment states its copy was *"condensed per PHASE_3 §6's rules (short, declarative, never the word 'premium')"* — referencing the repo's legacy `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`. The Knowledge Book (Chapter 11 §6 "Brand Personality," Chapter 12 §10, and repeatedly elsewhere — 20+ occurrences) treats **"Premium" as an approved, load-bearing personality trait and positioning pillar**, not a forbidden word. Per the constitution rules now in `CLAUDE.md`, the Knowledge Book supersedes the legacy phase doc — this is not an unresolved conflict requiring Founder input, it is a superseded instruction the codebase hasn't caught up to. Recorded here rather than silently resolved, since it affects how future brand-copy work should read `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` (informational/historical only, not binding, where it contradicts the Knowledge Book).

### 2. "Muving Soon™" wording — stated in the Phase 1A brief, not independently located in the Knowledge Book text
The task brief's brand-validation rules state *"Use 'Muving Soon™' instead of 'Coming Soon.'"* This exact phrase was searched for repeatedly across the full Master file (`Grep`, multiple attempts, plus the false-positive noted above) and genuinely does not appear anywhere in either Knowledge Book file. The underlying principle — preserve the "Muving" spelling (Chapter 13 §9) — clearly supports the spirit of the rule, and the website's own homepage already implements "Muving Soon™" verbatim (`app/(storefront)/page.tsx`), so this is very likely an already-settled Founder decision that simply hasn't been written into the Knowledge Book's searchable text yet. Flagged as a minor documentation gap in the Knowledge Book itself (worth adding to Part III or Part IV in a future revision), not as a website defect.

### 3. Volume IX's outlet/food-service framing vs. an e-commerce-only current business
Part IX's Table of Contents devotes two of five chapters to "Food-Service Product Experience" and "Outlet Culture & Environment," implying a physical retail/food-service dimension to Muv's business that has no corresponding surface anywhere in the current website (which is pure e-commerce D2C). Not read in depth this pass since it's out of scope for a website gap analysis, but flagged in case Phase 1B or later planning assumes outlet/retail features are already covered by this volume — they describe a different channel, not the website.
