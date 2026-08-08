# MUV Product Knowledge Factory™ — Validation Rules

> Implements `CONSTITUTION.md` Article 5 (Enforcement) for `FR-001` (the Commercial/Knowledge
> Separation). This document adds ONE new mandatory validation check to every future Product
> Knowledge Package's validation process, and separately records — without acting on — the
> compliance gap in the six packages built before this Constitution existed.

---

## 1. Purpose

Every prior Product Knowledge Package has ended with a `2X_Validation_Report.md` file running a
checklist (Source Traceability, JSON Validation, Knowledge Object Integrity, Competitor Scan,
Canonical Naming, Knowledge Reuse, Relationship Graph, Founder Input Register, Source Conflict
Register, and, where applicable, CRO Validation and Variant Inheritance). This document adds one
more mandatory line item to that checklist, permanently, starting with the next Product Knowledge
Package authored after `FR-001`.

---

## 2. The Commercial Data Exclusion Check (new, mandatory, permanent)

**Every future Product Knowledge Package's Validation Report must include:**

```
✓ Commercial Data Exclusion — no Knowledge Object states a specific MRP, selling price,
  discount, product image, stock-status value, or packaging-visual value as a fact.
```

### 2.1 What passes

- "This SKU's pack size is 500 ml" — a knowledge fact (what exists), passes.
- "Pricing: LIVE — resolve from Product Catalog" — an explicit deferral to the live catalog,
  passes.
- "The Product Chart lists this SKU at ₹90 (see Source Register — cited for audit traceability
  of what was found during source research, not asserted as the current AI-facing price)" — a
  **sourcing note inside `00_Source_Register.md` or a Source Conflict Register**, documenting
  what a historical source document said, passes, provided it is clearly scoped to source
  documentation and never repeated as a live, AI-answerable fact in a customer-facing FAQ/AI
  Response/CRO Knowledge Object.
- Golden Questions / AI Response Guidance Knowledge Objects that explicitly instruct the AI to
  fetch price/stock/images live rather than answer from package content — passes, and is now
  **required** (§3).

### 2.2 What fails

- A `02_Product_Family_and_SKUs.md`-style (or `_and_Variants.md`) Knowledge Object stating a
  specific MRP as the answer to "how much does this cost."
- A Sales Intelligence Knowledge Object presenting a ₹ figure as the current price rather than as
  a historical source citation.
- A `sku_variants.json` / `variant_definitions.json` field asserting `pricing.mrpInr` or
  equivalent as a live, AI-usable fact (as opposed to a Source Register citation — see 2.1).
- An FAQ/AI Response/Care Response Object answering a pricing, stock, or image question with a
  static figure instead of instructing a live lookup.
- Any Knowledge Object asserting current stock/availability status as fact (as distinct from the
  already-established, correct pattern of noting "not yet in the online catalogue" as a
  catalogue-*existence* fact, which is a knowledge fact about the product's rollout status, not a
  live stock-quantity claim).

### 2.3 Grep heuristic for validators

A quick, non-exhaustive first pass: grep each Knowledge Package's `.md`/`.json` files for `₹`,
`MRP`, `in stock`, `out of stock`, `discount`, outside of `00_Source_Register.md` and the
Source Conflict Register file. Any hit in a customer-facing file (FAQs, AI Responses, Care
Response Objects, Golden Questions' *expected answers*) is a hard fail. A hit inside a
SKU/Variant/Sales Intelligence Knowledge Object's *stated fact* (not a source citation) is also a
hard fail. A hit that is clearly a historical source citation, correctly scoped, is not a
violation but should still be reviewed for tone (never phrased as "the price is," always phrased
as "the Product Chart recorded" / "the SOP recorded").

---

## 3. Required addition to Golden Questions and AI Response Guidance

Every future package's `Golden_Questions` file must include at least one question testing this
rule directly, e.g.:

> "How much does this product cost right now?" → Expected behavior: the AI does not answer from
> package content; it resolves the current price from the live Product Catalog. FAIL if the AI
> states a ₹ figure sourced from the Knowledge Package instead of indicating a live lookup.

And the `AI Response Guidance` Knowledge Object (previously "KO-XX-AI-001" in every package so
far) must explicitly state this instruction, e.g.:

> "The AI must never answer a price, stock, image, or availability question from this package's
> content. Those eleven fields (Constitution Article 2.1) are always resolved live from the
> Product Catalog at answer time."

---

## 4. Required addition to the Knowledge Visibility Matrix

Every future package's Knowledge Visibility Matrix must add one row:

| Knowledge Category | Layer | ... | MUV AI (customer-facing) |
|---|---|---|---|
| Commercial Fields (MRP/price/discount/images/stock/URL/slug/availability) | **NOT KNOWLEDGE FACTORY CONTENT** — owned entirely by the Product Catalog | n/a | ✅ always live-fetched, never from Knowledge Factory |

This makes the separation visible in the same governance artifact every package already produces,
rather than a rule that only lives in a document nobody re-reads per package.

---

## 5. Legacy Compliance Register — the six pre-Constitution packages

**REMEDIATED.** Per `FOUNDER_RULES.md` `FR-002`, the Founder chose Option 2 (Full Remediation
Pass, §5.1 below) on 2026-07-31, and it has been executed against all six packages. Each package
now has a `LIVE_DATA_MAPPING.md` file, a Commercial Data Exclusion validation check in its own
Validation Report, and every previously-stated pricing figure in customer/AI-facing content
replaced with a live-lookup deferral. See `LEGACY_REMEDIATION_REPORT.md` for the full,
package-by-package account.

| Package | Commercial data (pre-remediation) | Status |
|---|---|---|
| MUV Liquid Detergent™ | 6 SKU pricing figures; a pricing conflict register entry (`KO-LD-CONFLICT-001`, Cool Water: Chart ₹165/₹725 vs SOP ₹155/₹699) | ✅ Remediated 2026-07-31 |
| MUV Floral Toilet Cleaner™ | Clean pricing figures (₹80/500ml, ₹400/5L) stated as fact | ✅ Remediated 2026-07-31 |
| MUV Spark Dishwash Gel™ | Chart-only pricing figures (no SOP price at all — a data gap, not a conflict, but still a stated commercial figure) | ✅ Remediated 2026-07-31 |
| MUV Fresh Bathroom Cleaner™ | Pricing conflict for 500 ml (Chart ₹70 vs SOP ₹65), stated throughout, including in a Care Response Object (KO-BC-CRO-001) | ✅ Remediated 2026-07-31 |
| MUV Crystal Glass Cleaner™ | Clean pricing figure (₹90) stated as fact | ✅ Remediated 2026-07-31 |
| MUV Floor Cleaner™ | Two pricing conflicts (Velvet Mist 5L ₹550/₹549; Cloud Walk 5L ₹600/₹549) and clean 1L pricing (₹150), stated throughout, including in a Care Response Object (KO-FC-CRO-006) | ✅ Remediated 2026-07-31 |

**Notable scope-limiting fact (unchanged by remediation):** none of the six packages asserted a
live stock-quantity claim, and none asserted a real product image asset (every image reference
was already correctly marked "not reviewed/REQUIRES FOUNDER INPUT"). The remediated violation was
specifically **pricing/MRP figures** presented as fact — the actual scope of the fix matches the
scope of the original gap.

### 5.1 Remediation path taken

**Option 2 — Full Remediation Pass** (per `FR-002`): every affected file across all six packages
was edited to remove stated pricing figures from customer/AI-facing Knowledge Objects and JSON
fields, replacing them with an explicit live-lookup deferral to the Product Catalog API. Each
package's own `00_Source_Register.md`/Source Conflict Register retains the original historical ₹
figures verbatim, but now with an explicit label marking them as source-audit citations only,
never a live AI-facing fact — preserving the audit trail while eliminating the live-fact
violation. Each package gained a `LIVE_DATA_MAPPING.md` file, a new "Commercial Fields" row in its
Knowledge Visibility Matrix, a new Commercial Data Exclusion check in its Validation Report, and a
`fr001Fr002Compliance`-style field in its manifest JSON. Two Care Response Objects whose guidance
text was itself built around disclosing a historical pricing conflict (Bathroom Cleaner's
KO-BC-CRO-001, Floor Cleaner's KO-FC-CRO-006) had their guidance rewritten to defer to the live
catalog while preserving the underlying care behavior (never guess, be transparent, escalate to a
human when needed) — the one place this remediation touched Care Intelligence content, and only
its commercial-figure mechanism, not its philosophy.

Option 1 (leave-as-is, reclassify in place) was not taken.

---

## 6. Effective date

This validation rule set has been effective since 2026-07-31 (`FR-001`) for any newly-authored
Product Knowledge Package, and — following the `FR-002` remediation recorded in §5 — now applies
in full to all six pre-Constitution packages as well. No package in the Knowledge Factory
currently contains a stated live commercial figure.

---

## 7. Single Source of Truth Reference Check (new, mandatory from Car Wash onward, per `FR-006`)

**Every Product Knowledge Package authored from MUV Car Wash™ (Product Family 12) onward must
include:**

```
✓ Single Source of Truth Reference — Usage, Safety, Contraindications, First Aid, Storage, and
  Shelf Life are each referenced via the CMS pattern (Source: Website Product Master / Authority:
  CMS / Retrieval: Runtime / Status: Single Source of Truth), never authored as static inline
  content or as an inline `Unknown — Founder Decision Required` marker.
```

### 7.1 What passes

- A `08_Safety.md` Knowledge Object stating the CMS reference block verbatim for each of the six
  fields, plus whatever Knowledge-Factory-owned content (formulation/process facts) genuinely
  surrounds it.
- A `14_FOUNDER_GAPS.md` entry disclosing that the CMS source (`ProductIntelligence`) is not yet
  populated for this product — required, not optional, per `ARCHITECTURE.md` §5.3.

### 7.2 What fails

- Restating a field-by-field `Unknown — Founder Decision Required` marker for any of the six
  fields in a package authored under `FR-006`, instead of the CMS reference block.
- Inventing plausible-sounding Usage/Safety/Storage/Shelf-Life content and presenting it as if it
  came from the CMS.
- Omitting the disclosure that the CMS source is currently unpopulated (§7.1) — silently implying
  the six fields are actually available somewhere live.

### 7.3 Not retroactive

This check does not apply to Product Families 1–11 (including `MUV Hand Wash™`, frozen under the
pre-`FR-006` inline-marker pattern) — see `CONSTITUTION.md` Article 9's Applicability clause.

---

## 8. Effective date (FR-006 addendum)

§7 has been effective since 2026-07-31 (`FR-006`) for every Product Knowledge Package authored
from MUV Car Wash™ onward. It is not applied retroactively to any earlier package.
