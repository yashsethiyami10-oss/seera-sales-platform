# MUV Product Knowledge Factory™ — Constitution

**Status:** BINDING
**Version:** 1.0
**Effective:** 2026-07-31 (Founder Decision, recorded as `FR-001` in `FOUNDER_RULES.md`)
**Supersedes:** Nothing — this is the first formal constitution written for this sub-system.
**Subordinate to:** The MUV Knowledge Book (per `CLAUDE.md`'s "Project Constitution" section) and
any direct, explicit Founder instruction. Nothing in this document overrides those.
**Amends:** Nothing retroactively. See Article 8 for how this applies to the six Product
Knowledge Packages built before this Constitution existed.

---

## Preamble

The MUV Product Knowledge Factory™ (also referred to in prior working sessions as the "MUV AI
Knowledge Factory™") is the system — architecture, Knowledge Object model, and the growing set
of per-product Knowledge Packages under `docs/knowledge-factory/products/` — built to give MUV's
AI a real, sourced, non-hallucinated understanding of its products. This Constitution records a
binding Founder Decision that permanently separates two categories of truth this system must
never confuse: **product intelligence** (what the Knowledge Factory owns) and **commercial data**
(what the live website product catalog owns). This document is the supreme, binding rule for
that separation. It does not redesign the Knowledge Factory's existing architecture — Knowledge
Object format, source-audit discipline, confidence tiers, Care Response Objects, Variant
Inheritance, and every other mechanism established across the six Product Knowledge Packages
built to date remain exactly as they are. This Constitution adds one new, permanent constraint on
top of that architecture.

---

## Article 1 — Purpose and Scope of the Product Knowledge Factory

The Product Knowledge Factory exists to be the single source of truth for **product
intelligence**, and only product intelligence. Its scope is:

- Product knowledge (formulation, manufacturing, ingredients, functional roles)
- Usage guidance
- FAQs
- Safety information
- SOPs
- Decision trees
- Care Intelligence (Care Response Objects and the behavioral discipline behind them)
- Product comparison
- Recommendations

Nothing in this Article changes. Every Knowledge Object category already established across the
six frozen/drafted Product Knowledge Packages (Product Identity, Ingredients, Manufacturing
Theory/SOP, Batch Reconciliation, Quality Control, Safety & Risk, Customer Support, FAQs & AI
Responses, Troubleshooting & Complaints, Care Response Objects, Golden Questions) remains valid
and continues to be authored the same way. What changes, per Article 2, is what those categories
are permitted to contain.

---

## Article 2 — The Commercial / Knowledge Separation (the binding rule)

**The Product Knowledge Factory must NEVER hardcode product MRP, selling price, discount,
product images, stock status, or packaging visuals.**

This is not a style preference — it is a permanent architectural boundary. The Product Knowledge
Factory owns *why* and *how* a product works and is cared for. It does **not** own *what it costs
right now*, *what it currently looks like*, or *whether it is currently available*. Those facts
belong exclusively to the live MUV website product catalog.

### 2.1 — Fields that must always be read live from the website catalog, never stored as
Knowledge Factory content

| # | Field |
|---|---|
| 1 | Product Name |
| 2 | Product Images |
| 3 | MRP |
| 4 | Selling Price |
| 5 | Discount |
| 6 | Available Pack Sizes |
| 7 | Active Variants |
| 8 | Stock Status |
| 9 | Product URL |
| 10 | Product Slug |
| 11 | Product Availability |

Any AI-generated customer-facing answer touching one of these eleven fields must resolve the
value dynamically from the live catalog at answer time. It must never be answered from a static
value written into a Knowledge Object, a `knowledge_manifest.json`, a `sku_variants.json`, a
Source Conflict Register, or any other Knowledge Factory file.

### 2.2 — What this does NOT mean

This rule governs **customer-facing commercial answers and stored knowledge content** — it does
not forbid a Knowledge Object's own internal title, category label, or descriptive prose from
naming a product (e.g. "MUV Fresh Bathroom Cleaner™ — Manufacturing SOP" is a document title, not
a customer-facing commercial claim). Knowledge Packages remain free to organize themselves by
product name. What they may never do is present a specific MRP/price/discount/image/stock
figure as a fact the AI can recite from static content, because that figure is exactly the kind
of value that changes on the website without the Knowledge Factory being told.

### 2.3 — Why (the failure mode this prevents)

A price, image, stock level, or discount recorded inside a Knowledge Object is a snapshot. The
website catalog is not a snapshot — it changes continuously (price revisions, promotions,
restocks, out-of-stock events, image refreshes, slug changes on rename). A Knowledge Factory that
stores a commercial value will silently go stale the first time that value changes on the
website, and nothing in the Knowledge Factory's own validation discipline (source registers,
conflict registers, golden questions) would ever catch that staleness, because the Knowledge
Factory has no mechanism to know the website changed. Reading commercial fields live, every time,
structurally eliminates this failure mode — see Article 5.

---

## Article 3 — Two Sources of Truth, Never Merged

| | Owns | Where it lives (real system) |
|---|---|---|
| **Website Product Catalog** | Commercial truth: name, images, MRP, price, discount, pack sizes, variants, stock, URL, slug, availability | `Product` / `ProductVariant` / `Inventory` (Prisma models, `prisma/schema.prisma`), served live via `GET /api/products` and `GET /api/products/[slug]` (`app/api/products/route.ts`, `app/api/products/[slug]/route.ts`) and mutated only via `actions/products.ts` |
| **Product Knowledge Factory** | Intelligence truth: formulation, SOPs, safety, QC, usage, FAQs, care behavior, comparisons, recommendations | `docs/knowledge-factory/products/*` (the Knowledge Package deliverables), and — once a package is promoted into the live platform — `ProductIntelligence` / `ProductIntelligenceVersion.sections` (`prisma/schema.prisma`) |

These two systems must never be merged into one row, one file, or one JSON blob. A Knowledge
Object may **reference** a product by name or by a future `Product.slug` once one is assigned;
it may never **duplicate** that product's commercial fields.

**Grounding note — this separation already exists in the real schema, this Constitution simply
makes it binding for the Knowledge Factory's own content too.** `ProductIntelligenceVersion.sections`
(the real, already-built JSON structure a Knowledge Package is eventually meant to populate) is
explicitly documented in-schema as covering "Product Identity, Purpose, Customer Problems Solved,
Features, Benefits, Ingredients/Composition, Usage Instructions, Safety Information, Do/Don't,
FAQs, Objection Handling, Comparison Notes, Cross-Sell Suggestions, Storage Instructions, Shelf
Life" — note that MRP, price, images, and stock are conspicuously absent from that list. The real
engineering design already anticipated this separation; this Constitution formalizes it as a rule
the content-authoring side of the Knowledge Factory must also follow, and closes the gap where six
Knowledge Packages built before this Constitution did not yet follow it (Article 8).

---

## Article 4 — Automatic Update Principle

**If the website product data changes, the AI must automatically use the updated values without
requiring any Product Knowledge update.**

This is the direct, testable consequence of Article 2. If a change to `ProductVariant.price` on
the live catalog ever requires a corresponding edit to a Knowledge Factory file for the AI to
answer correctly, Article 2 has been violated somewhere. See `VALIDATION_RULES.md` for how this
is checked.

---

## Article 5 — Enforcement

Enforcement mechanics — what gets checked, when, and how — are specified in
`VALIDATION_RULES.md`, which is itself binding under this Constitution. Implementation-level
detail (how retrieval should merge live commercial data with static knowledge content at answer
time) is specified in `ARCHITECTURE.md`.

---

## Article 6 — Amendment

Only the Founder may amend this Constitution. Any amendment must be recorded as a new, dated
entry in `FOUNDER_RULES.md` before it takes effect. This document (`CONSTITUTION.md`) is then
updated to reflect the amendment, with the prior binding text preserved in `FOUNDER_RULES.md`'s
ledger rather than silently deleted — matching the "never silently resolve/never silently edit"
discipline already established across every Product Knowledge Package built under this Factory.

---

## Article 7 — Relationship to Existing Product Knowledge Package Architecture

This Constitution does not redesign, rename, or deprecate any existing Knowledge Factory
mechanism. Specifically unchanged:

- The Knowledge Object format (KOID, Title, Category, Tags, Version, Confidence, Evidence,
  Relationships, Owner, Approval Status, Review Date, Source).
- The No Hallucination Rule and `REQUIRES FOUNDER INPUT` discipline.
- Source Authority Order, Source Conflict Register format, Canonical Naming Register,
  Competitor Reference Register, Knowledge Visibility Matrix, Knowledge Reuse Report, Care
  Response Objects, Variant Inheritance (for multi-variant families), and Golden Questions.
- The per-product-family Stop Rule (complete one family, wait for Founder approval before the
  next).

What changes, going forward, is narrow and specific: **any field listed in Article 2.1 is no
longer authored as static Knowledge Factory content.** Where a prior package template asked for
a "Pricing (MRP)" value inside a SKU/Variant Knowledge Object, future packages instead record
that the value is commercial and must be resolved live (see `VALIDATION_RULES.md` for the exact
replacement pattern).

---

## Article 8 — Legacy Status of the Six Pre-Constitution Packages

MUV Liquid Detergent™, MUV Floral Toilet Cleaner™, MUV Spark Dishwash Gel™, MUV Fresh Bathroom
Cleaner™, MUV Crystal Glass Cleaner™, and MUV Floor Cleaner™ were built before this Constitution
existed, under the prior (unwritten) assumption that sourced MRP/pricing values belonged in the
Knowledge Factory. They contain commercial data — pricing figures, pricing conflict registers
built around specific ₹ values, SKU pricing tables — that would not be authored the same way
under this Constitution.

**This Constitution does not retroactively edit those six packages.** Per the Knowledge
Factory's own standing rule ("Do NOT modify any previously approved Product Family unless
explicitly instructed"), they are left exactly as they are pending a separate, explicit Founder
decision on remediation. The specific compliance gap in each package, and the two remediation
paths available, are recorded in `VALIDATION_RULES.md` §5 ("Legacy Compliance Register") — that
register is a read/report mechanism only; it takes no action against the frozen files.

---

## Article 9 — Single Source of Truth for Operational Content (`FR-006` amendment)

**Effective:** 2026-07-31 (Founder Decision, recorded as `FR-006` in `FOUNDER_RULES.md`).
**Amends:** Article 1's scope list and Article 3's "Intelligence truth" description, both of
which previously listed Usage guidance, Safety information, and related operational fields as
content the Knowledge Factory itself authors. Per Article 6 (Amendment), the prior text is not
deleted — it remains correct for every package authored before this amendment (see the
Applicability clause below); this Article narrows the rule going forward.

**The binding rule:** for every Product Knowledge Package authored from MUV Car Wash™ (Product
Family 12) onward, the following six fields are **never authored as static Knowledge Factory
content** — they are referenced, not duplicated:

| # | Field |
|---|---|
| 1 | Usage Instructions |
| 2 | Safety Instructions |
| 3 | Contraindications |
| 4 | First Aid |
| 5 | Storage Conditions |
| 6 | Shelf Life |

(Commercial Product Data was already covered by Article 2.1; `FR-006` restates it here as
belonging to the same reference-not-duplicate discipline.)

**Reference format (verbatim, per `FR-006`):**

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

**Real-system mapping (grounded, not invented — see `ARCHITECTURE.md` §5 for full detail):** the
closest evidence-grounded match for "Website Product Master" for these six fields is
`ProductIntelligence` / `ProductIntelligenceVersion.sections` (`prisma/schema.prisma`) — the
Founder's own term does not exactly match a single Prisma model name, so this mapping is recorded
as an inference for Founder confirmation, not an assumed fact.

**Applicability — not retroactive:** `MUV Hand Wash™` (Product Family 11) and every earlier
package retain their existing inline field-by-field content (sourced fact or `Unknown — Founder
Decision Required`, per `FR-005`) exactly as authored. This Article governs authoring from Car
Wash onward only; no remediation pass is ordered by this amendment.

**Real, disclosed limitation:** as of this amendment, no product family has real
`ProductIntelligence`/`ProductIntelligenceVersion` rows populated with any of these six fields for
any product. The reference pattern above is architecturally correct and now mandatory, but it
currently resolves to an empty source. Every package built under this Article must state this
plainly rather than imply the content already exists.
