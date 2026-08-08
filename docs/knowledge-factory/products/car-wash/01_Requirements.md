# MUV Car Wash™ — Requirements

> Implementation spec, traceable to the Founder's Product Family 12 task (the "Founder Freeze +
> Product Family 12 Final Execution Prompt"). Recorded before authoring any Knowledge Object.

---

## Product scope

- **Product Family:** MUV Car Wash™ (Category: Car Care) — **single-variant product**, no
  fragrance/colour sub-name, per direct Chart + SOP agreement.
- **Pack Sizes:** 500ml, 5L — confirmed identically by both Chart and SOP, no conflict.
- **Final product family of the current repository**, per the Founder's explicit framing.

## Governance to follow exactly

`CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md` (`FR-001`–`FR-006`,
all ACTIVE). Reuse every frozen architecture exactly — folder structure, KO schema, JSON schema,
validation framework, naming conventions, reporting format, freeze workflow, tracking documents.
No redesign. Generate only Car Wash–specific knowledge.

## Variant architecture — Not Applicable

`FR-004` (Variant Inheritance Architecture) does not apply: there is one formula, filled into two
pack sizes, with zero variant-specific process steps anywhere in the SOP. No Parent/Variant KO
split, no Variant Inheritance Map, no Variant Availability Matrix are authored for this package —
this is a deliberate absence, matching the task's own "variant override logic (only where
genuinely required)" instruction, not an oversight.

## Single Source of Truth (`FR-006`)

Usage Instructions, Safety Instructions, Contraindications, First Aid, Storage Conditions, and
Shelf Life are never authored as static content — each is referenced via:

```
Source: Website Product Master
Authority: CMS
Retrieval: Runtime
Status: Single Source of Truth
```

This package discloses plainly (per `ARCHITECTURE.md` §5.3) that this CMS source
(`ProductIntelligence`) is not yet populated for this product — the reference pattern is
architecturally correct, not evidence the content already exists. See `08_Safety.md`,
`14_FOUNDER_GAPS.md`.

## Mandatory rules applied throughout

1. **Never Invent.** Never fabricate chemistry, infer missing safety information, or infer
   unsupported commercial/functional claims (see Claims Validation below).
2. **Source First / Repository First.**
3. **Care Intelligence.** Truth → Safety → Care → Clarity → Actionability → Validation.
4. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).**
5. **Knowledge Reuse First (`FR-003`).** Compared against all eleven prior packages; Pure Bleach
   (the original single-SKU, no-variant package) given particular weight as the closest
   structural precedent. Full account in `13_Reports/08_Knowledge_Reuse_Summary.md`.
6. **`FR-005`** is ACTIVE but this task does not explicitly classify Car Wash as a Safety Critical
   Product the way Hand Wash's task did — the Never-Invent discipline against unsupported safety/
   claims is still applied precautionarily, but the six-mandatory-field enumeration behavior
   `FR-005` introduced is superseded by `FR-006`'s CMS-reference mechanism for this package
   regardless of classification. See `09_Founder_Rules.md` KO-CW-FR-005.
7. **`FR-006`**, first package built entirely under this rule from inception.

## Claims Validation requirement (new emphasis, explicit in this task)

Every commercial or functional claim must be evidence-based. The SOP's QC criteria support
"clear glossy liquid," "rich foam," and "smooth finish on vehicle" as sourced facts. **Terms with
no source anywhere — "wax," "gloss-lock," "paint-safe," "scratch-free" — are never used,** even
though they appear in the unrelated `prisma/seed.ts` "MUV Shield" record (`00_Source_Register.md`
§3). See `03_Product_Intelligence.md` KO-CW-INTEL-008.

## Product Intelligence coverage required

Product purpose, cleansing/foam mechanism, formula, manufacturing process, QC, packaging, claims
validation, compatibility (vehicle surface types — only if verified), category positioning —
`03_Product_Intelligence.md`.

## Customer conversation flows required (12)

General inquiry, pack size selection, price inquiry, usage inquiry (CMS reference), ingredient
inquiry, safety inquiry (CMS reference), compatibility inquiry, claims inquiry (wax/gloss-lock —
not sourced), comparison request (vs. MUV Shield — different products), complaint/quality issue,
storage/shelf-life inquiry (CMS reference), institutional/bulk-use inquiry —
`05_Customer_Conversation.md`.

## Safety requirement

Usage/Safety/Contraindications/First Aid/Storage/Shelf Life referenced via the `FR-006` CMS
pattern, not authored inline. `08_Safety.md` also retains the reused emergency-guidance
behavioral rule (real AI behavior, not delegated content) and a Claims Validation cross-reference.

## Required end-of-package outputs (9 — no Variant Statistics/Availability Report, not applicable)

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Source Coverage Report
5. Missing Knowledge Report
6. Product Quality Score
7. Care Intelligence Report
8. Knowledge Reuse Summary
9. Freeze Recommendation

All nine live in `13_Reports/`.

## Repository discipline

Validate only newly created/modified files. No repository-wide regeneration. Reuse frozen modules
wherever possible. Generate only the delta required for this Product Family.

## Stop Rule

After this package is complete: **STOP.** This is the final product family of the current
repository. Do not begin a new product family, repository refactoring, repository optimization,
or documentation expansion without explicit Founder approval.
