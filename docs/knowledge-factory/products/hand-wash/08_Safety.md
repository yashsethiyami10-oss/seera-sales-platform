# MUV Hand Wash™ — Safety

> First package built under `FR-005` (Safety Critical Product Classification). Five of the six
> mandatory fields live here (Safety, Contraindications, First Aid ×3, Storage, Shelf Life); the
> sixth (Usage) is `03_Product_Intelligence.md` KO-HW-INTEL-003. **The source SOP contains zero
> safety content of any kind** — confirmed by reading the complete document body (four sections:
> Product Variants, Batch Formula, Production Process, Fragrance/Colour Guide — no fifth "Safety"
> section exists). Per `FR-005`, this absence is documented field-by-field below, not as one
> general note (the pattern Body Wash used, before `FR-005` existed). This package never
> generates unsupported medical, dermatological, antibacterial, or skin-safe claims to fill any
> of these gaps.

---

## KO-HW-SAFETY-001 — Source Safety Content Overview

- **Confidence:** N/A — genuinely zero content, not merely unextracted
- **Evidence:** Complete SOP body read, all four sections
- **Source:** None found — **Founder Decision Required, CRITICAL PRIORITY**

**Content:** **Unknown, confirmed absent rather than merely unsearched.** No PPE instruction, no
mixing restriction, no ventilation instruction, no consumer-facing safety guidance of any kind
exists anywhere in the SOP, the Product Chart, the Knowledge Library, or either AI Sutra file.
This matches the severity of Body Wash's own finding.

---

## KO-HW-SAFETY-002 — Safety (`FR-005` mandatory field 2 of 6)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, CRITICAL PRIORITY**

**Content:** **Unknown.** No manufacturing PPE requirement and no consumer handling/safety
guidance exist in any source. No hazard, SDS, or exposure-assessment reference exists for this
product (contrast with Pure Bleach, Black Phenyl, and White Phenyl, all of which had at least a
short sourced safety passage).

---

## KO-HW-SAFETY-003 — Contraindications (`FR-005` mandatory field 3 of 6)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**
- **Evidence:** Knowledge Library governance rule (`00_Source_Register.md` §3)

**Content:** **Unknown.** No contraindication (specific skin conditions, concurrent product use,
known-allergen interaction) is sourced for any variant. This package strictly follows the real,
sourced Knowledge Library rule (line 12614) forbidding unsupported "safe," "non-toxic,"
"chemical-free," or "dermatologically tested" claims — extended per `FR-005` to explicitly cover
antibacterial and skin-safe claims as well. The AI never generates a contraindication answer or
dermatological advice; any real question of this kind is always routed to a qualified
professional.

---

## KO-HW-SAFETY-004 — First Aid: Eye Contact (`FR-005` mandatory field 4 of 6, part a)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGH PRIORITY**

**Content:** **Unknown.** Correct AI behavior for a real report: acknowledge it, direct the person
to rinse with clean water and seek professional/medical guidance if irritation persists, and
escalate per KO-HW-SAFETY-011.

---

## KO-HW-SAFETY-005 — First Aid: Skin Irritation (`FR-005` mandatory field 4 of 6, part b)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, CRITICAL PRIORITY (this is the product's
  primary, intended contact route)**

**Content:** **Unknown.** No source addresses what to do if the product causes irritation.
Correct AI behavior: acknowledge the report, do not offer an invented dermatological remedy,
recommend discontinuing use, and direct the person to a healthcare professional. See
`05_Customer_Conversation.md` KO-HW-CONV-011.

---

## KO-HW-SAFETY-006 — First Aid: Accidental Ingestion (`FR-005` mandatory field 4 of 6, part c)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Any real report of ingestion must escalate to emergency services/poison
control immediately, with no attempted home-remedy guidance from the AI.

---

## KO-HW-SAFETY-007 — Storage (`FR-005` mandatory field 5 of 6)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No storage condition (temperature, light, humidity) exists anywhere for
any pack size or variant.

---

## KO-HW-SAFETY-008 — Shelf Life (`FR-005` mandatory field 6 of 6)

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No shelf-life duration, expiry-date policy, or stability claim exists in
any source. This is a real, complete absence — not even a "see label" pointer exists, unlike some
prior products.

---

## KO-HW-SAFETY-009 — Child Safety

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** General caution (store out of reach of children, as ordinary household-
product common sense) can be offered, clearly labeled as general guidance, never a MUV-confirmed
instruction.

---

## KO-HW-SAFETY-010 — Antibacterial / Protective Claim Status (Life Shield)

- **Confidence:** N/A — explicitly, deliberately unconfirmed
- **Evidence:** `00_Source_Register.md` §1–§4, §9; `FOUNDER_RULES.md` FR-005 (which names this
  exact risk by example)
- **Source:** None found — **Founder Decision Required, CRITICAL PRIORITY**

**Content:** **No source — Product Chart, SOP, Knowledge Library, or AI Sutra — assigns any
antibacterial, protective, or germ-killing property to Life Shield, or to any other variant.**
Life Shield's only documented differentiator from the other three variants is its colour (Pink)
and its name. `FR-005` explicitly names this exact scenario as a risk to guard against: a
"Shield"-type variant name must never be assumed, by the AI or in any generated content, to imply
antibacterial or protective function. This finding must be treated as a live constraint on every
customer-facing surface (conversations, FAQs, decision trees, marketing copy) until the Founder
either supplies a real source or confirms no such claim exists.

---

## KO-HW-SAFETY-011 — Emergency Guidance (AI behavior, not medical content)

- **Confidence:** HIGH — a behavioral rule, not a medical claim
- **Evidence:** `lib/eios/cognitive-state.ts`; KO-HW-SAFETY-004/005/006
- **Reused pattern:** behavioral rule reused from Pure Bleach's `KO-PB-SAFETY-013`, Black
  Phenyl's `KO-BP-SAFETY-013`, White Phenyl's `KO-WP-SAFETY-013`, Body Wash's `KO-BW-SAFETY-010`
  — see `13_Reports/10_Knowledge_Reuse_Summary.md`

**Content:** For any real reported irritation, eye contact, ingestion, or dermatological concern,
the AI: (1) takes the report seriously and responds immediately, (2) directs the person to
discontinue use and rinse where relevant, as universally-known, non-prescriptive first response,
(3) directs them to seek professional dermatological/medical help, and (4) escalates to a human
within MUV. The AI never diagnoses, never suggests a specific treatment, and never claims a
MUV-specific remedy, safety guarantee, or antibacterial/protective effect exists when none is
sourced — this discipline applies with particular force here, given the total absence of sourced
safety content, the direct skin-contact nature of this product category, and the specific,
Founder-anticipated risk of an assumed antibacterial claim for Life Shield.
