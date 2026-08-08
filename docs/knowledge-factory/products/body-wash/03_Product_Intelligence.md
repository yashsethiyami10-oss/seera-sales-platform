# MUV Body Wash™ — Product Intelligence

> Parent-level (shared) Knowledge Objects, per `KO-BW-INHERIT-001`. Every field the Founder asked
> to be documented is covered — sourced fact or explicit Unknown/Founder Decision Required. This
> package never invents a cosmetic or dermatological claim.

---

## KO-BW-INTEL-001 — Product Purpose

- **Confidence:** HIGH — directly sourced
- **Evidence:** SOP §1 "Objective"

**Content:** Verbatim: *"To manufacture a consistent, safe and premium-quality MUV Body Wash
containing 1% Salicylic Acid using SLES (28% active), HEC thickener and CAPB system."* Note:
"safe" here is an internal manufacturing-objective word, not a consumer-facing safety/
dermatological claim — per the Knowledge Library's own governance rule (quoted in
`00_Source_Register.md`), it is never presented to a customer as a safety guarantee.

---

## KO-BW-INTEL-002 — Skin Cleansing Mechanism

- **Confidence:** HIGH — directly sourced functional roles
- **Evidence:** SOP Formula table

**Content:** SLES 28% (2.6kg per 10kg batch) is the "Primary cleanser"; CAPB (1.0kg) is a "Mild
co-surfactant." These are the source's own stated functional roles — a standard
surfactant-cleansing mechanism, not elaborated further in the source.

---

## KO-BW-INTEL-003 — Key Benefits

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No source states a consumer-facing benefit claim ("gently cleanses,"
"leaves skin soft," etc.). Per this task's explicit instruction, no cosmetic claim is invented to
fill this gap.

---

## KO-BW-INTEL-004 — Suitable Skin Types

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No source states which skin types this product suits or doesn't suit.

---

## KO-BW-INTEL-005 — Usage Instructions (Consumer)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, largest structural gap**

**Content:** **Unknown.** The only source is a manufacturing SOP — it does not state an
application method, lather time, or rinse instruction.

---

## KO-BW-INTEL-006 — Ingredients (verified only)

- **Confidence:** HIGH (the manufacturing Formula table is real and verified) / but explicitly
  **not** a consumer INCI-style ingredient declaration
- **Evidence:** SOP Formula table
- **Source:** `MUV_Body_Wash_SOP_10kg_1percent_Salicylic_Acid.docx`

**Content:** The verified manufacturing Formula (10kg batch): RO/DM Water, SLES 28%, CAPB,
Cocamide DEA, Glycerin, Propylene Glycol, Salicylic Acid (1%), HEC, Preservative, Fragrance,
Colour, pH Adjuster. **This is a manufacturing Bill of Materials, not a consumer-facing
ingredient/INCI declaration** — no INCI names, no supplier, no grade is sourced. This package
does not present it as a label-ready ingredient list. **The "MUV Cleanse" seed-data record's
ingredient list ("Aqua, Sodium Laureth Sulfate, Salicylic Acid (1%), Glycerin, Perfume.") belongs
to a different, non-matching product and is never used here** — see `00_Source_Register.md` §5.

---

## KO-BW-INTEL-007 — Active Ingredients

- **Confidence:** HIGH — directly sourced
- **Evidence:** SOP Formula table, Objective

**Content:** Salicylic Acid, 1% (100g per 10kg batch) — the product's own stated active
ingredient, explicitly named in both the Objective and the Formula table.

---

## KO-BW-INTEL-008 — Fragrance Characteristics

- **Confidence:** MEDIUM — a real, sourced two-word family label per variant; nothing deeper
- **Evidence:** SOP Variant Matrix
- **Source:** `KO-BW-FAM-001`

**Content:** Crimson Veil = "Premium Floral"; Velvet Oak = "Woody Premium"; Midnight Frost =
"Fresh Cooling." **No fragrance notes (top/heart/base), sensory descriptions, or emotional/
lifestyle positioning are sourced for any variant beyond these exact two-word labels** — none are
invented. See `04_Decision_Trees.md` for how this bounds variant recommendation logic.

---

## KO-BW-INTEL-009 — Packaging

- **Confidence:** MIXED — pack sizes sourced; container material not sourced
- **Evidence:** SOP §4 "Filling & Packaging"

**Content:** 250ml and 950ml, both confirmed for all three variants. **Container material (e.g.
HDPE, PET) is not stated anywhere** — a real difference from several prior products' SOPs, which
at least named a material. Label must carry batch number, manufacturing date, expiry date, and
MRP (sourced instruction); a leak test is performed before packing (sourced).

---

## KO-BW-INTEL-010 — Storage

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No storage condition (temperature, light, humidity) exists anywhere in
this SOP.

---

## KO-BW-INTEL-011 — Shelf Life

- **Confidence:** N/A — not sourced
- **Evidence:** SOP §4 confirms an expiry date is printed on the label, but never states the duration
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same pattern as every manufacturing-only-SOP product this session.

---

## KO-BW-INTEL-012 — Limitations

- **Confidence:** MEDIUM — an honest characterization of the source material's own scope
- **Evidence:** Whole-SOP read

**Content:** The single available source is a manufacturing SOP with no consumer-facing usage,
benefit, skin-type, storage, or safety guidance. This is the sparsest and highest-risk-category
source material of any product family this session — sparsest because of the total absence of a
safety section (see `08_Safety.md`), highest-risk-category because of the direct, sustained skin
contact this product category involves.

---

## KO-BW-INTEL-013 — Safety (summary; full detail in `08_Safety.md`)

- **Confidence:** N/A — zero sourced content
- **Source:** None — **Founder Decision Required, CRITICAL PRIORITY**

**Content:** **This SOP contains zero safety content of any kind** — no PPE, no mixing
restriction, no ventilation instruction, no consumer-facing safety guidance. This is the most
severe safety gap of any of the ten product families audited this session. See `08_Safety.md`.

---

## KO-BW-INTEL-014 — Contraindications

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No source states any contraindication (e.g. pregnancy, specific skin
conditions, concurrent use with other actives). This package does not generate unsupported
dermatological advice to fill this gap, even though salicylic-acid-containing products commonly
carry general consumer cautions in the wider market — none of that general knowledge is asserted
here as a MUV-specific fact. The correct AI behavior for any real contraindication question is to
route the customer to a qualified professional (see `08_Safety.md` KO-BW-SAFETY's emergency-
guidance equivalent), never to supply an invented answer.

---

## KO-BW-INTEL-015 — Customer Expectations

- **Confidence:** LOW — built only from the one real, sourced positioning word
- **Evidence:** SOP §1 "premium-quality"

**Content:** The SOP's own Objective describes the product as "premium-quality" — a real, sourced
positioning signal, though not elaborated with specific claims. Beyond this, no source sets
customer expectations (texture, lather, scent longevity, etc.). This package does not invent
sensory expectation-setting content.
