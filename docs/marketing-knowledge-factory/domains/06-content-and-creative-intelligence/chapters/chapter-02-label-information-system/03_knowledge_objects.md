# Chapter 2 — Knowledge Objects

---

## KO-CC-CH2-001 — Label Hierarchy

- **Purpose:** Preserve the seven-element packaging hierarchy flow, the front-label six-item
  hierarchy, the back-label information list, and the compliance WARNING.
- **Scope:** Label Hierarchy (Figure 2.1), Front Label, Back Label, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (Label Hierarchy).
- **Outputs:** Figure 2.1 seven-element flow; six front-label items; eleven back-label
  information fields; the WARNING.
- **Dependencies:** None (chapter-opening KO).
- **Relationships:** governs KO-CC-CH2-002 through 006.
- **Governance Rules:** **WARNING:** *"The presence, wording, and legal form of mandatory
  information must be confirmed by the appropriate compliance authority. Design cannot invent
  compliance."*
- **Validation Rules:** Figure 2.1's flow and all hierarchy items preserved; the WARNING never
  softened.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content — Figure 2.1 — Packaging Hierarchy:** Brand → product type → variant → approved
benefit → size → use information → company and mandatory information. The front and back label
perform different jobs.

**Front Label** should help the customer recognise and select the product. **Typical
hierarchy:** 1. Muv identity; 2. product type; 3. variant or fragrance; 4. one or more approved
primary benefits; 5. net quantity; 6. required mark or category cue.

**Back Label** should help the customer understand, use, identify, and contact. **Possible
information includes:** short approved description; directions for use; precautions or
warnings; ingredients or composition where approved and required; manufacturer and marketer
information; customer-care details; website and email; net quantity; batch, manufacturing,
expiry, or best-before fields where applicable; MRP field; barcode area; mandatory
declarations.

> **WARNING** — The presence, wording, and legal form of mandatory information must be
> confirmed by the appropriate compliance authority. Design cannot invent compliance.

---

## KO-CC-CH2-002 — Product Information Structure

- **Purpose:** Preserve the ten-row information-type/governing-source table.
- **Scope:** Product Information Structure, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (Product Information Structure).
- **Outputs:** Ten-row table.
- **Dependencies:** KO-CC-CH2-001.
- **Relationships:** feeds KO-CC-CH2-003.
- **Governance Rules:** None new — a structural source-of-truth reference.
- **Validation Rules:** All ten rows preserved.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:**

| Information Type | Governing Source |
|---|---|
| Brand name and mark | MUV Brand Sutra™ |
| Product name | Approved product record |
| Variant or fragrance | Approved product record |
| Benefit or performance claim | Product and compliance authority |
| Directions | Approved product-use instruction |
| Ingredients | Approved formulation and compliance information |
| Price | Commercial authority |
| Company and contact details | Current company record |
| Barcode | Assigned operational record |
| Dimensions | Measured production specification |

---

## KO-CC-CH2-003 — Claims Control

- **Purpose:** Preserve the six claim-recording fields and the validate-before-not-after rule.
- **Scope:** Claims Control, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (Claims Control).
- **Outputs:** Six claim-recording fields.
- **Dependencies:** KO-CC-CH2-002.
- **Relationships:** feeds KO-CC-CH2-004.
- **Governance Rules:** *"A label is not the place to create persuasive claims first and
  validate them later."* *"Do not convert a general brand promise into a measurable product
  claim."*
- **Validation Rules:** All six fields preserved; both rules never dropped.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** A label is not the place to create persuasive claims first and validate them
later. **For each claim, record:** exact wording; supporting product basis; approval owner;
applicable variant and size; legal or marketplace constraints; effective version. Do not
convert a general brand promise into a measurable product claim.

---

## KO-CC-CH2-004 — MRP and Variable Information

- **Purpose:** Preserve the field-change-scope rule and the variable-data-zone requirement.
- **Scope:** MRP and Variable Information, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (MRP and Variable Information).
- **Outputs:** The field-change rule; variable-data-zone requirement.
- **Dependencies:** KO-CC-CH2-003.
- **Relationships:** feeds KO-CC-CH2-005.
- **Governance Rules:** *"Change the requested field in the requested location. Do not use a
  price correction as permission to redesign unrelated elements."*
- **Validation Rules:** The rule preserved verbatim.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** Pricing and variable production fields require disciplined placement. The Founder
corrected MRP placement and distinguished front-label presentation from back-label changes.
This demonstrates a permanent rule:

> Change the requested field in the requested location. Do not use a price correction as
> permission to redesign unrelated elements.

Variable-data zones should remain clear enough for production printing, stamping, or stickers.

---

## KO-CC-CH2-005 — Dimensions and Measured Artwork & Editable Production Files

- **Purpose:** Preserve the nine dimension-control elements and the ten editable-file
  requirements.
- **Scope:** Dimensions and Measured Artwork, Editable Production Files, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (Dimensions and Measured Artwork, Editable
  Production Files).
- **Outputs:** Nine dimension-control elements; ten editable-file requirements.
- **Dependencies:** KO-CC-CH2-004.
- **Relationships:** feeds KO-CC-CH2-006.
- **Governance Rules:** *"Approved dimensions must come from the real container or print
  specification."* *"An editable file is not complete merely because objects can be moved."*
- **Validation Rules:** All elements and requirements preserved; both rules never dropped.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content — dimension control includes:** overall artwork size; front and back panel width;
wrap or overlap allowance; bleed and safe zone; seam or curve position; barcode size and quiet
area; variable-data zone; minimum readable text; cutter or dieline reference where relevant.

**An editable file should include:** organised layers; named groups; current logo asset;
editable text or properly supplied fonts; linked or embedded images; defined dimensions;
colour specification; version identifier; no hidden unused alternatives; an exported proof for
comparison.

---

## KO-CC-CH2-006 — Sticker System & Label Approval Gate

- **Purpose:** Preserve the four-row sticker-use table and the eleven-item label approval gate.
- **Scope:** Sticker System, Label Approval Gate, complete.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17 (Sticker System, Label Approval Gate).
- **Outputs:** Four-row sticker table; eleven-item approval gate.
- **Dependencies:** KO-CC-CH2-005.
- **Relationships:** feeds KO-CC-CH2-007.
- **Governance Rules:** *"Stickers must not become a substitute for fixing the master artwork
  when a permanent change is required."*
- **Validation Rules:** All table rows and gate items preserved.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:** Stickers may support variable information, temporary promotion, or controlled
updates. They must not become a substitute for fixing the master artwork when a permanent
change is required.

| Sticker Use | Control |
|---|---|
| Variable price or batch information | Must align with the production process |
| Temporary promotion | Requires start and end control |
| Corrective application | Must be authorized and accurately positioned |
| Brand or benefit sticker | Must not obscure mandatory information |

**Label Approval Gate:**
- [ ] Correct product, variant, and size.
- [ ] Current logo and identity.
- [ ] Front hierarchy is clear.
- [ ] Back information is complete.
- [ ] Claims are approved.
- [ ] MRP and variable zones are correct.
- [ ] Company details are current.
- [ ] Barcode space is usable.
- [ ] Dimensions match the real pack.
- [ ] Physical-size proof is readable.
- [ ] Editable and exported files match.

---

## KO-CC-CH2-007 — Chapter Governance Summary

- **Purpose:** Preserve the chapter's closing governance content.
- **Scope:** Common Mistakes, Best Practices, Action Checklist, Key Takeaways, Chapter Summary.
- **Inputs:** MUV Knowledge Library, Part IV, Ch.17, closing subsections.
- **Outputs:** Consolidated do/don't reference; 7-item Action Checklist; 4 Key Takeaways;
  Chapter Summary.
- **Dependencies:** KO-CC-CH2-001 through 006.
- **Relationships:** Mirrors the established pattern.
- **Governance Rules:** No new rule invented.
- **Validation Rules:** All 7 checklist items in original order.
- **Version:** 1.0
- **Status:** Founder Review Ready
- **Change History:** 2026-07-31 — created.
- **Evidence Classification:** Verified

**Content:**

**Common Mistakes:** Inventing ingredients or claims during design. Copying information from
another size or variant without checking. Changing front and back information inconsistently.
Supplying screenshots instead of editable production files. Using stickers without a removal or
transition plan.

**Best Practices:** Maintain a controlled product-information sheet. Separate fixed and
variable information. Use a label-content approval before visual approval. Proof at actual
size. Keep one approved production package per version.

**Action Checklist:**
- [ ] Verify the product-information source.
- [ ] Confirm front, back, and variable-information zones.
- [ ] Confirm every claim and mandatory detail.
- [ ] Match artwork dimensions to the measured production pack.
- [ ] Check readability at physical size.
- [ ] Align the editable master with the exported proof.
- [ ] Record the approved version.

**Key Takeaways:** A label is an information system before it is a decorative surface. Product
facts, claims, dimensions, and variable data require controlled sources. Front and back labels
must operate as one coordinated system. Approval requires both content accuracy and production
readiness.

**Chapter Summary:** *"The Label Information System converts product truth into a clear
customer and production structure. Its quality depends on hierarchy, accurate sources,
measured dimensions, and controlled files—not on visual appearance alone."* Source's own
transition line: *"Next: Visual Asset Production governs how the real product is represented in
photography, e-commerce, and customer communication"* — the sourced justification for Chapter 3
following next.
