# MUV Product Knowledge Factory™ — Architecture

> Implements `CONSTITUTION.md` Article 2 (the Commercial/Knowledge Separation, `FR-001`) at the
> system level. This document describes how the two sources of truth are structured today in the
> real codebase, and how they must be joined at answer time — it does not introduce a new system;
> it names and binds the real modules that already exist for this purpose.

---

## 1. The two layers

### 1.1 Commercial Catalog Layer (owns Article 2.1's eleven fields)

- **Data model:** `Product`, `ProductVariant`, `Inventory` (`prisma/schema.prisma`).
  - `Product`: `name`, `slug`, `images: String[]`, `status` (`DRAFT`/`ACTIVE`/`ARCHIVED`).
  - `ProductVariant`: `sku`, `size`, `price: Int`, `mrp: Int`.
  - `Inventory`: `quantity` (stock status is derived from this, not stored as a separate field).
- **Read path (the "live website product catalog" the Founder's rule refers to):**
  - `GET /api/products` (`app/api/products/route.ts`) — list, `status: "ACTIVE"` only, cached
    via `lib/cache.ts`.
  - `GET /api/products/[slug]` (`app/api/products/[slug]/route.ts`) — detail, same
    `ACTIVE`-only rule.
  - Both already compute `inStock` from `Inventory.quantity` and return `price`/`mrp` per
    variant — this is the real, existing mechanism "fetch dynamically from the live MUV website
    product catalog" refers to. Nothing new needs to be built for reads.
- **Write path:** `actions/products.ts` (`createProduct`, `updateProduct`,
  `updateProductVariant`, `addProductVariant`, `deleteProduct`) — admin/staff only, per
  `lib/rbac.ts`.
- **Known real gap, not to be papered over:** `Product.images` exists as a schema field but is
  **not currently included** in either `GET /api/products` or `GET /api/products/[slug]`'s
  response shape. Article 2.1 requires Product Images to be read live — closing this gap (adding
  `images` to both routes' response shape) is an engineering task, not a Knowledge Factory
  content task, and is out of scope for this document to perform unprompted; it is recorded here
  so it isn't silently assumed to already work.

### 1.2 Product Knowledge Factory Layer (owns everything in Article 1's scope)

- **Content-authoring form (current, what exists today):** `docs/knowledge-factory/products/*` —
  the Knowledge Package deliverables (Markdown Knowledge Objects + JSON manifests) built for six
  product families so far. This is where SOPs, formulation, safety, QC, FAQs, Care Response
  Objects, and comparisons live.
- **Live-platform form (real schema, not yet populated from the packages above):**
  `ProductIntelligence` / `ProductIntelligenceVersion.sections` (`prisma/schema.prisma`) —
  already-built, versioned, `DRAFT`/`PUBLISHED`-gated JSON storage whose documented section list
  ("Product Identity, Purpose, Customer Problems Solved, Features, Benefits,
  Ingredients/Composition, Usage Instructions, Safety Information, Do/Don't, FAQs, Objection
  Handling, Comparison Notes, Cross-Sell Suggestions, Storage Instructions, Shelf Life") already
  excludes every Article 2.1 field. `ProductVariantIntelligence` /
  `ProductVariantIntelligenceVersion` provide the same shape at variant granularity, override-only
  against the product-level sections.
- **Governance layer (real, already built):** `lib/knowledge-factory/*` — `source-registry-service.ts`
  (Canonical Source Layer, authority levels `CONSTITUTIONAL`/`OPERATIONAL`/`PRODUCT_TECHNICAL`/
  `EXPERIENCE`/`EXTERNAL`), `conflict-service.ts` (Conflict Queue), `compliance-service.ts`
  (versioned compliance requirements), `governance-service.ts` (approval levels,
  maker/checker), `learning-service.ts` (usage telemetry, recall events, change proposals). None
  of these services store or resolve commercial fields — they govern knowledge content only,
  consistent with Article 2.

---

## 2. How the two layers must be joined at answer time

**Principle: merge at retrieval time, never at authoring time.** A Knowledge Object may say a
product "is sold in a 500ml pack" (a knowledge fact about what exists) — it must never say "and
costs ₹150" (a commercial fact that must be fetched, not authored).

### 2.1 The real precedent this pattern already follows

`lib/retrieval/operational-data-adapter.ts` already implements exactly this pattern for a
different domain: `fetchCustomerIntelligenceSignal()` queries `CustomerIntelligenceProfile` live
via Prisma at retrieval time and folds the result into a `RetrievalResult` with
`relationship: "OPERATIONAL"`, rather than that data ever being pre-baked into stored knowledge
content. `lib/retrieval/types.ts`'s `KnowledgeSourceType` union
(`"KNOWLEDGE" | "PRODUCT_INTELLIGENCE" | "PROBLEM_INTELLIGENCE" | "CARE_INTELLIGENCE"`) already
keeps `PRODUCT_INTELLIGENCE` (content) conceptually distinct from the separate `"PRODUCT"` type
literal used for direct commercial-entity references elsewhere in the retrieval types — the
architecture for this separation already exists in the codebase; Article 2 makes it a binding
rule for the content-authoring side too, and this section names the pattern that should extend
it to products.

### 2.2 Forward-looking implementation note (not built by this document)

A `Product Commercial Data Adapter`, following `operational-data-adapter.ts`'s exact shape,
would query `Product`/`ProductVariant`/`Inventory` live and attach the result alongside whatever
`ProductIntelligence`/Knowledge Factory content is retrieved for the same product — so a customer
asking "what does this cost and is it in stock" gets a live-fetched answer, while "what's in it"
or "is it safe for pets" gets a Knowledge-Factory-sourced answer, in the same response. This is
an engineering task for whichever sprint wires product-facing AI retrieval end to end — it is
recorded here as the intended shape, not implemented by this Constitution update, per the scope
the Founder specified ("update the Constitution, Founder Rules, Architecture documents, and
Validation Rules").

---

## 3. Authoring pattern change for future Knowledge Packages

Where a prior package's `02_Product_Family_and_SKUs.md`-style file recorded a field like:

```
| Pricing (MRP) | ₹150 |
```

a Knowledge Package authored under this Constitution instead records:

```
| Pricing (MRP) | LIVE — resolve from Product Catalog (see VALIDATION_RULES.md §2) |
```

The SKU/Variant Knowledge Object still records everything Article 1 actually owns for that SKU
(pack size existing, colour, fragrance, fill weight, relationship to the parent formula) — it
simply stops recording the commercial figure itself. Once a product is live in the catalog, the
Knowledge Object may reference the real `Product.slug`/`ProductVariant.sku` as a lookup key
instead of a bare description — a reference, not a duplicate, per Article 3.

---

## 4. What does not change

Source Register discipline, Source Authority Order, the No Hallucination Rule, Confidence tiers,
Care Response Objects, Variant Inheritance, Canonical Naming, Competitor Reference scanning,
Knowledge Visibility Matrix (still grounded in the real `KnowledgeLayer` enum and
`lib/retrieval/permissions.ts`), and the per-family Stop Rule are all unaffected by this
Constitution. This document only narrows what a SKU/Variant/Sales Intelligence Knowledge Object
is allowed to assert about commercial figures.

---

## 5. CMS Reference Pattern for Operational Content (`FR-006`, `CONSTITUTION.md` Article 9)

**Principle, same shape as §2:** merge at retrieval time, never at authoring time — now extended
from commercial fields to six operational fields (Usage, Safety, Contraindications, First Aid,
Storage, Shelf Life).

### 5.1 Real system mapping

`ProductIntelligence` / `ProductIntelligenceVersion.sections` (`prisma/schema.prisma`) is the
closest evidence-grounded match for the Founder's term "Website Product Master" — it is a real,
already-built, `DRAFT`/`PUBLISHED`-gated JSON store whose documented section list already
includes "Usage Instructions, Safety Information... Storage Instructions, Shelf Life" (§1.2
above). This is an inference from the real schema, not a confirmed 1:1 naming match — recorded
for Founder confirmation, following the same discipline `FR-001`'s original mapping used.

### 5.2 Authoring pattern for packages built under `FR-006`

Where a pre-`FR-006` package's `08_Safety.md` records:

```
Unknown — Founder Decision Required
```

a package authored under `FR-006` instead records:

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

for each of the six fields, with the same Knowledge Object still recording whatever the Knowledge
Factory genuinely owns for that field (e.g. the manufacturing-side raw-material/process facts a
Safety section might otherwise have surrounded) — the reference replaces the *field-level content
slot*, not the entire Knowledge Object.

### 5.3 Real, disclosed gap (not built by this document)

No `ProductIntelligence`/`ProductIntelligenceVersion` row exists yet for any MUV product family —
confirmed by the same absence already noted in §1.2 ("not yet populated from the packages
above"). The CMS reference pattern is the correct target architecture; it does not itself create
the missing content. A package built under `FR-006` must disclose this in its own Founder Gaps
register rather than let the reference pattern imply the content is populated somewhere real.
