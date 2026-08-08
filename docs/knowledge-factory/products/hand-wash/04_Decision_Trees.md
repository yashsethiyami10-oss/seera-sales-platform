# MUV Hand Wash™ — Decision Trees

> Product-fit trees plus four variant recommendation logic KOs (one per variant — this Product
> Family has four variants, not three) and one comparison tree. Every tree is availability-aware:
> **no branch ever offers a pack size that KO-HW-AVAIL-001 marks as not real for that variant.**

---

## KO-HW-DT-001 — General Need / Purchase-Fit Tree

- **Confidence:** MEDIUM — structural logic reused from prior single-parent multi-variant
  packages; content is product-specific
- **Evidence:** `02_Product_Architecture.md`

**Content:** Customer wants a hand wash → confirm household vs. institutional use → household:
proceed to fragrance/colour preference (KO-HW-DT-003); institutional: redirect to bulk/5L options
where available (only Silk Blossom and Ocean Fresh have a 5L SKU — Citrus Blast and Life Shield
do not, see KO-HW-AVAIL-001) and flag `lib/inst-sales/consumption-rules.ts`'s generic
`HAND_WASH` category (a placeholder estimate, not variant-aware — see `10_LIVE_DATA_MAPPING.md`)
as the current institutional estimation basis.

---

## KO-HW-DT-002 — Pack Size Selection Tree (availability-aware)

- **Confidence:** HIGH — directly implements the Founder-verified matrix
- **Evidence:** `02_Product_Architecture.md` KO-HW-AVAIL-001

**Content:**

```
Customer names a variant first?
├─ Silk Blossom or Ocean Fresh → offer 500ml, 5L only. Never offer 250ml.
│    If customer asks for 250ml in either variant → KO-HW-CONV-005 (availability inquiry):
│    explain honestly that this combination doesn't exist, do not apologize for a defect,
│    do not imply it's "out of stock" (it's not a stock question — it never existed).
├─ Citrus Blast or Life Shield → offer 250ml, 500ml only. Never offer 5L.
│    If customer asks for 5L in either variant → same honest-absence handling.
└─ Customer names pack size first?
     ├─ 250ml → only Citrus Blast and Life Shield are valid; Silk Blossom/Ocean Fresh are not
       offered at 250ml.
     ├─ 500ml → all four variants valid.
     └─ 5L → only Silk Blossom and Ocean Fresh are valid; Citrus Blast/Life Shield are not
       offered at 5L.
```

---

## KO-HW-DT-003 — Fragrance / Colour Preference Tree

- **Confidence:** MEDIUM — the tree structure is sound; underlying scent-family data is thin
  (colour and name only, no fragrance notes — see KO-HW-INTEL-008)
- **Evidence:** `03_Product_Intelligence.md` KO-HW-INTEL-008

**Content:** Ask preferred colour or general fragrance impression → route to the matching
variant by colour/name only (Silk Blossom = Purple, Ocean Fresh = Blue, Citrus Blast = Yellow,
Life Shield = Pink) → then apply KO-HW-DT-002 to confirm which pack sizes are actually available
for that variant before quoting anything.

---

## KO-HW-DT-REC-SB-001 — Silk Blossom Recommendation Logic

- **Confidence:** MEDIUM — recommend only on sourced attributes (colour, name, 500ml/5L
  availability); no fragrance-note or skin-type basis exists
- **Evidence:** `02_Product_Architecture.md` KO-HW-SB-VAR-500/5L

**Content:** Recommend Silk Blossom when a customer expresses a preference matching "Silk
Blossom" by name or a floral/soft impression consistent with the name alone (never a sourced
fragrance-note claim) — and only offer 500ml or 5L. Never offer 250ml for this variant.

---

## KO-HW-DT-REC-OF-001 — Ocean Fresh Recommendation Logic

- **Confidence:** MEDIUM — same basis
- **Evidence:** `02_Product_Architecture.md` KO-HW-OF-VAR-500/5L

**Content:** Recommend Ocean Fresh for a customer expressing an "aquatic/fresh" impression
consistent with the name alone — and only offer 500ml or 5L. Never offer 250ml for this variant.

---

## KO-HW-DT-REC-CB-001 — Citrus Blast Recommendation Logic

- **Confidence:** MEDIUM — same basis
- **Evidence:** `02_Product_Architecture.md` KO-HW-CB-VAR-250/500

**Content:** Recommend Citrus Blast for a customer expressing a "citrus/energizing" impression
consistent with the name alone — and only offer 250ml or 500ml. Never offer 5L for this variant,
even though the Product Chart shows a conflicting 5L row (see `00_Source_Register.md` §1;
`14_FOUNDER_GAPS.md`).

---

## KO-HW-DT-REC-LS-001 — Life Shield Recommendation Logic

- **Confidence:** MEDIUM (colour/name/availability) / N/A (any antibacterial or protective basis
  — explicitly not sourced)
- **Evidence:** `02_Product_Architecture.md` KO-HW-LS-VAR-250/500; `08_Safety.md`
  KO-HW-SAFETY-010

**Content:** Recommend Life Shield only on sourced attributes: colour (Pink) and name — and only
offer 250ml or 500ml, never 5L. **This tree explicitly must NOT recommend Life Shield on the
basis of an antibacterial, protective, or "kills germs" claim.** If a customer asks whether Life
Shield offers extra protection or germ-killing power, route to `05_Customer_Conversation.md`
KO-HW-CONV-008 (antibacterial-claim inquiry) rather than answering within this recommendation
flow — this is the single highest-risk decision point in this package, per `FR-005`'s explicit
naming of this exact scenario.

---

## KO-HW-DT-COMPARE-001 — Cross-Variant Comparison Tree

- **Confidence:** HIGH — presents only sourced, verifiable facts
- **Evidence:** `02_Product_Architecture.md` KO-HW-FAM-001, KO-HW-AVAIL-001

**Content:** When a customer asks to compare variants, present only: colour, name, and real
available pack sizes per variant (per KO-HW-AVAIL-001). Never present a fabricated
"differentiator" (e.g., claiming Life Shield is "stronger" or Silk Blossom is "gentler") — the
formula, process, and QC standard are identical across all four; the only sourced differences are
colour, name/implied fragrance, and availability.
