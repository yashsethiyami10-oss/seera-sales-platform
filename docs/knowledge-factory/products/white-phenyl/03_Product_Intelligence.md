# MUV White Phenyl™ — Product Intelligence

> Every field the Founder asked to be documented. Where no source exists, the field is marked
> **Unknown**, **Not Available**, or **Founder Decision Required**.

---

## KO-WP-INTEL-001 — Product Purpose

- **Confidence:** HIGH — directly sourced
- **Evidence:** SOP §1 "Objective"
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:** Verbatim: *"To manufacture a stable, milky white phenyl floor cleaner with
consistent quality for MUV using a pine oil emulsion system."* One named use (floor cleaner),
with the pine-oil-emulsion formulation approach also stated.

---

## KO-WP-INTEL-002 — Suitable Applications

- **Confidence:** LOW — only "floor cleaner" is sourced
- **Evidence:** KO-WP-INTEL-001
- **Source:** Derived from SOP §1

**Content:** Sourced only as "floor cleaner." No specific floor types, rooms, or soiling
scenarios are named. Anything more specific is **Unknown — Founder Decision Required.**

---

## KO-WP-INTEL-003 — Surface Compatibility

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-INTEL-004 — Cleaning / Active Mechanism

- **Confidence:** HIGH — directly sourced
- **Evidence:** SOP §3 Standard Formula table
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:** Pine Oil (500ml per 10L batch) is listed with the stated functional role "Cleaning &
fragrance." Turkey Red Oil (TRO) is the "Emulsifier"; Non-ionic Surfactant provides "Cleaning &
emulsion stability." These are the source's own stated roles, not further elaborated.

---

## KO-WP-INTEL-005 — Usage Instructions (Consumer)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, largest gap in this package**

**Content:** **Unknown.** The only source is a manufacturing SOP — identical structural gap to
Black Phenyl and Pure Bleach.

---

## KO-WP-INTEL-006 — Dilution

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-INTEL-007 — Contact Time

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-INTEL-008 — Safety Precautions (summary; full detail in `08_Safety.md`)

- **Confidence:** MIXED — real manufacturing-side content sourced; consumer-use safety unsourced
- **Evidence:** SOP §7 "Safety"
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:** The SOP's own Safety section (verbatim in `08_Safety.md`) covers PPE, ventilation,
and a reference to raw material Safety Data Sheets. **This text was independently extracted from
White Phenyl's own SOP, not copied from Black Phenyl's** — the two are structurally similar
(three sentences, same three topics) but use different wording, confirming each product's real
safety content was sourced separately, per this task's explicit "do not copy safety guidance
unless directly supported by verified sources" instruction.

---

## KO-WP-INTEL-009 — Storage

- **Confidence:** N/A — not sourced
- **Evidence:** None found anywhere in the SOP
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same gap as Black Phenyl — no storage condition (temperature, light,
humidity) exists in this SOP at all.

---

## KO-WP-INTEL-010 — Shelf Life

- **Confidence:** N/A — not sourced
- **Evidence:** SOP §6 references an "expiry date" existing on the label, but never states the duration
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same pattern as every prior manufacturing-only-SOP product this session.

---

## KO-WP-INTEL-011 — Packaging

- **Confidence:** HIGH — both pack sizes sourced with no conflict
- **Evidence:** SOP §2, §6
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:** 1L HDPE Bottle and 5L HDPE Can, per direct Founder Instruction matching the SOP
exactly — see `02_Product_Architecture.md` KO-WP-ARCH-002. Fill weight is not stated for either
pack size.

---

## KO-WP-INTEL-012 — First Aid

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGH PRIORITY**

**Content:** **Unknown.** No eye-contact, skin-contact, inhalation, or ingestion first-aid
guidance exists in any source. Like Black Phenyl, the SOP's own safety text references real
Safety Data Sheets that aren't accessible to this package. See `14_FOUNDER_GAPS.md`.

---

## KO-WP-INTEL-013 — Disposal Guidance

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-INTEL-014 — Limitations

- **Confidence:** MEDIUM — an honest characterization of the source material's own scope
- **Evidence:** Whole-SOP read
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content:** The single available source is a manufacturing SOP, structurally identical in scope
to Black Phenyl's and Pure Bleach's — no consumer usage, dilution, contact time, surface
compatibility, first aid, disposal, or storage guidance.

---

## KO-WP-INTEL-015 — Frequently Misunderstood Use Cases

- **Confidence:** HIGH — built from a real, independently confirmed product-distinction fact
- **Evidence:** `00_Source_Register.md` product-identity confirmation finding; Black Phenyl's
  own KO-BP-INTEL-015 (mirror-image finding)
- **Source:** Cross-package fact comparison, both sides independently sourced

**Content:** A customer might reasonably assume **"MUV White Phenyl"** and **"MUV Black Phenyl"**
are simply colour variants of one base product (analogous to Floor Cleaner's Velvet Mist/Cloud
Walk fragrance variants). **They are not** — this package's own audit confirms they are two
genuinely distinct formulations (pine-oil-emulsion vs. black-phenyl-concentrate) with separate
SOPs, separate raw materials, and separate Product Chart entries. The AI must never present them
as variants of one another or answer a White Phenyl question using Black Phenyl facts (or vice
versa).

---

## KO-WP-INTEL-016 — Escalation Conditions

- **Confidence:** HIGH — grounded in real platform escalation code
- **Evidence:** `lib/eios/cognitive-state.ts`
- **Source:** Real platform code

**Content:** Any real report of eye/skin/inhalation/ingestion contact, or a request for first-aid
instructions, always escalates to a human. Full decision-tree logic in `04_Decision_Trees.md`.
