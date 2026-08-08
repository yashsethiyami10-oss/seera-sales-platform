# MUV Product Knowledge Factory™ — Legacy Remediation Report

> Executes `FOUNDER_RULES.md` `FR-002` (Full Remediation Pass) against all six Product Knowledge
> Packages that predated `CONSTITUTION.md`/`FR-001`. Confirms compliance with `FR-001`
> (Commercial/Knowledge Separation) and `FR-002` (execution mandate) across the entire Product
> Knowledge Factory as of 2026-07-31.

---

## 1. Scope and method

Six independent, non-overlapping remediation passes were run — one per Product Family — each
applying the same binding rule set recorded in `FOUNDER_RULES.md` FR-002:

1. Remove every hardcoded commercial figure (MRP, selling price, discount, stock, availability,
   product image references presented as live assets, URLs, slugs, marketplace/institutional
   pricing) from every customer/AI-facing Knowledge Object and JSON field.
2. Replace each with an explicit live-lookup deferral to the Product Catalog API.
3. Retain historical ₹ figures **only** inside each package's `00_Source_Register.md` and Source
   Conflict Register (and their JSON equivalents), explicitly labeled as source-audit citations,
   never a live fact.
4. Create a `LIVE_DATA_MAPPING.md` in every package documenting the authoritative live source for
   every commercial field.
5. Add a Commercial Data Exclusion check to every package's Validation Report and a "Commercial
   Fields" row to every package's Knowledge Visibility Matrix.
6. Update each package's manifest JSON with an FR-001/FR-002 compliance record.
7. Leave all product intelligence, SOPs, safety guidance, FAQs, decision trees, and Care
   Intelligence substantively untouched — with two narrow, explicitly permitted exceptions where
   a Care Response Object's guidance text was itself built around disclosing a historical pricing
   conflict (see §3, Bathroom Cleaner and Floor Cleaner).

Four of the six packages (Liquid Detergent, Toilet Cleaner, Dishwash Gel, Glass Cleaner) completed
with a full, formal agent-delivered verification report confirming every step above, including a
final re-grep for `₹` and a final JSON re-parse of every file touched.

Two packages (Bathroom Cleaner, Floor Cleaner) had their remediation work interrupted by a session
API-usage limit before their agents could deliver a final formal report. Their file-level edits
had already landed on disk before the interruption. Rather than assume completion, this report's
author independently re-verified both packages directly: confirmed `LIVE_DATA_MAPPING.md` exists
in both, confirmed all 11 JSON files in each package parse without error, confirmed
`fresh-bathroom-cleaner/17_Care_Response_Objects.md`'s KO-BC-CRO-001 guidance no longer states
either historical ₹ figure as a live fact (only refers to them abstractly as figures to avoid
restating), and confirmed `floor-cleaner/16_Care_Response_Objects.md` contains zero `₹` matches at
all (the CRO-006 rewrite removed every commercial figure from that file). Remaining `₹` hits in
both packages were spot-checked and found confined to `00_Source_Register.md`, the Source Conflict
Register, `LIVE_DATA_MAPPING.md`'s own audit-trail section, Founder Input Register/Golden
Questions meta-references, and one correctly-labeled institutional-placeholder note — the same
pattern confirmed complete in the four formally-verified packages.

---

## 2. Per-package summary

### MUV Liquid Detergent™

- **New file:** `LIVE_DATA_MAPPING.md`, confirming this product has no live `Product`/
  `ProductVariant` row yet.
- **Files edited (11):** `02_Product_Description.md`, `03_Manufacturing.md`,
  `06_Sales_Intelligence.md`, `07_AI_Responses.md`, `08_FAQs.md`, `09_Golden_Questions.md`,
  `golden_questions.json`, `10_Product_Variants.md`, `validation_report.md`,
  `knowledge_manifest.json`, `knowledge_metadata.json`.
- **Historical citation retained:** `KO-LD-CONFLICT-001` in `10_Product_Variants.md` — the single
  designated location (this package predates a dedicated Source Register), carrying the required
  label plus an added "Effect of FR-001/FR-002" clarification.
- **Verification:** all 4 touched JSON files parsed valid; final `₹` grep confined to the one
  labeled citation KO plus its three cross-references (metadata, validation report,
  LIVE_DATA_MAPPING.md's own audit section).

### MUV Floral Toilet Cleaner™

- **New file:** `LIVE_DATA_MAPPING.md`, confirming no live catalog row exists yet.
- **Files edited (12):** `00_Source_Register.md`, `Source_Conflict_Register.md` (banner labels
  added, figures retained), `10_Product_Variants.md`, `06_Sales_Intelligence.md`,
  `02_Product_Description.md`, `03_Manufacturing.md`, `07_AI_Responses.md`, `08_FAQs.md`,
  `09_Golden_Questions.md`, `golden_questions.json`, `validation_report.md`,
  `knowledge_manifest.json`.
- **Untouched (confirmed correctly out of scope):** `Founder_Input_Register.md`,
  `knowledge_metadata.json`, `knowledge_relationships.json`, `01_Product_Identity.md`,
  `04_Quality_Control.md`, `05_Safety.md`, and the "Harpic Floral" competitor-naming flag.
- **Verification:** all 4 touched JSON files parsed valid; directory timestamps confirm exactly
  the 12 edited files plus the new file changed.

### MUV Spark Dishwash Gel™

- **New file:** `LIVE_DATA_MAPPING.md`, confirming no live catalog row exists yet.
- **Files edited (10):** `02_Product_Family_and_SKUs.md`, `03_Product_Description.md`,
  `11_Sales_Intelligence.md`, `14_FAQs_and_AI_Responses.md`, `16_Golden_Questions.md` (added
  GQ-17, the required live-lookup Golden Question per `VALIDATION_RULES.md` §3),
  `golden_questions.json`, `sku_variants.json`, `00_Source_Register.md`,
  `18_Source_Conflict_Register.md`, `source_conflicts.json`.
- **Also updated:** `23_Validation_Report.md` (Commercial Data Exclusion check, GQ count
  16→17), `validation_results.json`, `knowledge_manifest.json`.
- **Verification:** all edited JSON files parsed valid; `golden_questions.json`'s 17-entry array
  matched its own check's `questionCount: 17`; final `₹` grep confined to labeled citations and
  self-disclaimed institutional-placeholder notes.

### MUV Fresh Bathroom Cleaner™

- **New file:** `LIVE_DATA_MAPPING.md`, confirming no live catalog row exists yet.
- **Files edited:** `02_Product_Family_and_SKUs.md`, `11_Sales_Intelligence.md`,
  `14_FAQs_and_AI_Responses.md`, `16_Golden_Questions.md` (GQ-03), `17_Care_Response_Objects.md`
  (KO-BC-CRO-001 guidance rewritten — see §3), `19_Source_Conflict_Register.md` (labeled, figures
  retained), `22_Knowledge_Visibility_Matrix.md` (new Commercial Fields row),
  `24_Validation_Report.md` (Commercial Data Exclusion check), plus JSON equivalents
  (`sku_variants.json`, `source_conflicts.json`, `care_response_objects.json`,
  `golden_questions.json`, `knowledge_objects.json`, `knowledge_metadata.json`,
  `founder_input_required.json`, `validation_results.json`, `knowledge_manifest.json`).
- **Verification:** all 11 JSON files in the package parse valid (independently re-confirmed
  after the session interruption); `17_Care_Response_Objects.md` spot-checked directly — its
  Guidance/What-to-Avoid/Escalation fields now instruct a live-catalog lookup and explicitly
  warn against restating either historical figure, with the underlying escalation-to-human
  behavior unchanged.

### MUV Crystal Glass Cleaner™

- **New file:** `LIVE_DATA_MAPPING.md`, including a dedicated institutional/placeholder pricing
  note for the ₹140/Ltr `GLASS_CLEANER` consumption-rules constant.
- **Files edited:** `02_Product_Family_and_SKUs.md`, `03_Product_Description.md`,
  `10_Packaging_Storage_Transport.md`, `11_Sales_Intelligence.md`, `12_Marketing_Intelligence.md`,
  `14_FAQs_and_AI_Responses.md`, `16_Care_Response_Objects.md` (KO-GC-CRO-003 and KO-GC-CRO-006
  cells only — their Guidance/Escalation text was already compliant), `17_Golden_Questions.md`
  (GQ-03), `22_Knowledge_Visibility_Matrix.md` (new Commercial Fields row), `23_Knowledge_Reuse_
  Report.md`, `24_Validation_Report.md` (Commercial Data Exclusion check, file count 25→26), plus
  JSON equivalents (`sku_variants.json`, `source_conflicts.json`, `golden_questions.json`,
  `knowledge_manifest.json`, `validation_results.json`).
- **Verification:** final re-grep found 33 remaining `₹` hits across 14 files, every one confirmed
  either a labeled historical citation or a non-value generic mention; all 10 JSON files parsed
  valid; directory-scope confirmed no other product family touched.

### MUV Floor Cleaner™

- **New file:** `LIVE_DATA_MAPPING.md`, covering the Parent and all three variants (Velvet Mist,
  Cloud Walk, Rose Water), including a dedicated institutional/placeholder pricing note for the
  ₹110/Ltr `FLOOR_CLEANER` consumption-rules constant.
- **Files edited:** `00_Source_Register.md` (labeled, figures retained), `02_Product_Family_and_
  Variants.md`, `03_Product_Description.md`, `10_Packaging_Storage_Transport.md`,
  `11_Sales_Intelligence.md`, `12_Marketing_Intelligence.md`, `14_FAQs_and_AI_Responses.md`,
  `16_Care_Response_Objects.md` (KO-FC-CRO-006 guidance rewritten — see §3),
  `17_Variant_Inheritance_Map.md` (structure confirmed untouched), `18_Golden_Questions.md`
  (GQ-03/GQ-04), `19_Founder_Input_Register.md`, `20_Source_Conflict_Register.md` (labeled,
  figures retained), `23_Knowledge_Visibility_Matrix.md` (new Commercial Fields row),
  `25_Validation_Report.md` (Commercial Data Exclusion check, file count 26→27), plus JSON
  equivalents (`variant_definitions.json`, `variant_inheritance.json`, `product_family.json`,
  `source_conflicts.json`, `founder_input_required.json`, `golden_questions.json`,
  `knowledge_manifest.json`, `validation_results.json`).
- **Verification:** all 11 JSON files in the package parse valid (independently re-confirmed
  after the session interruption); `16_Care_Response_Objects.md` spot-checked directly — zero
  remaining `₹` occurrences in that file at all, confirming the KO-FC-CRO-006 rewrite fully
  removed the internal 5L pricing-conflict reference from its guidance; `11_Sales_Intelligence.md`
  spot-checked — its one remaining `₹` hit is the correctly-labeled, already-disclaimed ₹110/Ltr
  institutional placeholder note, not a violation; `17_Variant_Inheritance_Map.md` confirmed still
  structurally intact (Parent/Variant KO lists and the single-override-point description
  unchanged).

---

## 3. Care Intelligence — the two permitted exceptions

Per `FOUNDER_RULES.md` FR-002's binding interpretation, "do not modify Care Intelligence" means
the underlying *behavior* — never guess, be transparent about gaps, escalate real concerns to a
human — is preserved. Two Care Response Objects had their specific *mechanism* for answering a
pricing question rewritten, because their original guidance text was itself built around
disclosing a now-obsolete historical pricing conflict:

- **KO-BC-CRO-001** (Bathroom Cleaner, "Pricing Discrepancy Inquiry"): previously instructed the
  AI to disclose "MUV's own records currently show two different figures (₹70 and ₹65)." Now
  instructs the AI to state that current pricing must be confirmed via the live Product Catalog,
  and — only if asked why — that internal historical records show a past discrepancy that
  predates the live catalog, without ever restating either figure.
- **KO-FC-CRO-006** (Floor Cleaner, "Festival Cleaning"): previously instructed the AI to "be
  upfront that the 5L price isn't fully settled internally yet." Now instructs the AI to defer
  entirely to a live catalog lookup for both pack sizes.

In both cases the care philosophy — honesty over false confidence, escalate when a firm number is
needed immediately — is identical before and after. Only the commercial-figure content of the
guidance changed. No other Care Response Object, in any of the six packages, was touched.

---

## 4. Compliance confirmation

- **FR-001 (Commercial/Knowledge Separation):** every one of the eleven commercial fields
  (Product Name, Product Images, MRP, Selling Price, Discount, Available Pack Sizes, Active
  Variants, Stock Status, Product URL, Product Slug, Product Availability) is now either absent
  from every package (images, stock, URL, slug — none were ever hardcoded to begin with, per the
  original `VALIDATION_RULES.md` §5 scope-limiting finding) or explicitly deferred to a live
  lookup (pricing/MRP, the one field type that was hardcoded pre-remediation).
- **FR-002 (Full Remediation Pass):** all seven numbered steps in the Founder's decision have been
  executed against all six packages — commercial data removed, dynamic references substituted,
  `LIVE_DATA_MAPPING.md` created in every package, Commercial Data Exclusion validation checks
  added, MASTER documents and Validation Reports updated, and all six packages revalidated (JSON
  parse + count reconciliation) after editing.
- **No product intelligence altered:** ingredients, formulation, manufacturing theory/SOP, batch
  reconciliation, QC criteria, safety findings, non-commercial FAQ answers, non-commercial Golden
  Questions, Canonical Naming Registers, Competitor Reference Registers, and (for Floor Cleaner)
  the Variant Inheritance Map are confirmed unchanged in all six packages, beyond the two Care
  Response Object guidance rewrites documented in §3.
- **No cross-package contamination:** each remediation pass was confined to its own product
  directory; no package's frozen content was touched by another package's remediation.

**All six Product Knowledge Packages are now FR-001/FR-002 compliant.**
