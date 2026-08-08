# MUV Pure Bleach™ — Safety

> Comprehensive safety coverage per the Founder's explicit list. Sourced content is quoted
> verbatim and clearly attributed; everything else is marked Unknown/Founder Decision Required.
> **This package never generates unsupported medical advice** — for any real exposure incident,
> the correct AI behavior is always to direct the person to a professional or emergency service,
> never to supply an invented first-aid step.

---

## KO-PB-SAFETY-001 — Source Safety Content (verbatim)

- **KOID:** KO-PB-SAFETY-001
- **Confidence:** HIGH — verbatim from source
- **Evidence:** SOP §7 "Storage & Safety" (complete section, quoted in full — nothing trimmed)
- **Source:** `MUV_Bleach_SOP_10L_Batch_500ml.docx`

**Content (verbatim, complete section 7):**

> "Store below 30°C away from direct sunlight. Do not mix with acids or ammonia-based cleaners.
> Wear gloves, eye protection and protective clothing during manufacturing. Ensure adequate
> ventilation."

This is the **most substantial safety source of any of the seven product families** built this
session — more than five of the six prior products' SOPs had. It is, however, written for
manufacturing personnel, not consumers, except for the storage condition and mixing restriction,
which reasonably describe the finished product too.

---

## KO-PB-SAFETY-002 — Safe Handling

- **KOID:** KO-PB-SAFETY-002
- **Confidence:** MIXED — manufacturing PPE sourced; consumer handling not sourced
- **Evidence:** KO-PB-SAFETY-001
- **Source:** SOP §7

**Content:** Manufacturing-stage handling requires gloves, eye protection, protective clothing,
and adequate ventilation (sourced). **Consumer-stage handling guidance (e.g. whether household
gloves are recommended for typical use) is not sourced — Founder Decision Required.**

---

## KO-PB-SAFETY-003 — Mixing Restrictions

- **KOID:** KO-PB-SAFETY-003
- **Confidence:** HIGH — directly sourced, the single strongest real safety fact in this package
- **Evidence:** KO-PB-SAFETY-001
- **Source:** SOP §7

**Content:** **"Do not mix with acids or ammonia-based cleaners."** This is the one unambiguous,
directly-sourced consumer-relevant safety rule in this entire package. The SOP does not explain
the mechanism or name a resulting hazard (e.g. it does not say "produces toxic gas") — this
package does not add that explanation, even though it is generally true of hypochlorite-acid
reactions, because it is not stated in the source. The rule itself ("do not mix") is sourced and
must always be communicated as-is. See `04_Decision_Trees.md` for the cross-product application
of this rule (MUV Toilet Cleaner™, Bathroom Cleaner™, Glass Cleaner™ all contain a sourced acid
ingredient).

---

## KO-PB-SAFETY-004 — Eye Contact

- **KOID:** KO-PB-SAFETY-004
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required, HIGH PRIORITY**

**Content:** **Unknown.** No first-aid instruction for eye contact exists in any source. Correct
AI behavior: acknowledge the report, do not offer a home-remedy first-aid step, direct the person
to rinse with clean water and seek professional/medical or emergency guidance immediately, and
escalate to a human per `04_Decision_Trees.md` KO-PB-DT-004. ("Rinse with water and seek medical
attention" is offered here as the same category of ordinary, universally-known safety-escalation
advice used for any household chemical exposure — not a MUV-specific or medically prescriptive
instruction.)

---

## KO-PB-SAFETY-005 — Skin Contact

- **KOID:** KO-PB-SAFETY-005
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No source-specific skin-contact first-aid instruction exists. Same
escalation behavior as KO-PB-SAFETY-004.

---

## KO-PB-SAFETY-006 — Inhalation

- **KOID:** KO-PB-SAFETY-006
- **Confidence:** N/A — not sourced, though the "ensure adequate ventilation" manufacturing
  instruction is a related, sourced fact
- **Evidence:** KO-PB-SAFETY-001
- **Source:** SOP §7 (ventilation instruction only — no inhalation-exposure first-aid guidance)

**Content:** **Unknown for consumer inhalation first aid.** The SOP's "ensure adequate
ventilation" instruction is a real, sourced manufacturing-side precaution, but no source
addresses what to do if someone reports respiratory irritation from the finished product. Same
escalation behavior as KO-PB-SAFETY-004.

---

## KO-PB-SAFETY-007 — Accidental Ingestion

- **KOID:** KO-PB-SAFETY-007
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required, HIGHEST PRIORITY**

**Content:** **Unknown.** No ingestion first-aid guidance exists anywhere. This is the single
highest-severity gap in this package — any real report of ingestion must escalate to emergency
services/poison control immediately, with no attempted home-remedy guidance from the AI
whatsoever (e.g. never suggest inducing vomiting or a specific antidote — this is exactly the
category of "unsupported medical advice" this package is instructed never to generate).

---

## KO-PB-SAFETY-008 — Child Safety

- **KOID:** KO-PB-SAFETY-008
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No child-specific safety/storage guidance exists. General caution
(store out of reach of children) can be offered as ordinary household-chemical common sense,
clearly labeled as general guidance, not a MUV-confirmed instruction.

---

## KO-PB-SAFETY-009 — Pet Safety

- **KOID:** KO-PB-SAFETY-009
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No pet-specific safety guidance exists. Same treatment as child safety —
general caution offered as ordinary guidance, not a MUV claim.

---

## KO-PB-SAFETY-010 — Storage

- **KOID:** KO-PB-SAFETY-010
- **Confidence:** HIGH — directly sourced
- **Evidence:** KO-PB-SAFETY-001
- **Source:** SOP §7

**Content:** "Store below 30°C away from direct sunlight." No other storage detail (humidity,
orientation, ventilation for stored product) is sourced.

---

## KO-PB-SAFETY-011 — Spill Management

- **KOID:** KO-PB-SAFETY-011
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No source addresses household spill cleanup procedure.

---

## KO-PB-SAFETY-012 — Disposal

- **KOID:** KO-PB-SAFETY-012
- **Confidence:** N/A — not sourced
- **Evidence:** None
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** See `03_Product_Intelligence.md` KO-PB-INTEL-013.

---

## KO-PB-SAFETY-013 — Emergency Guidance (AI behavior, not medical content)

- **KOID:** KO-PB-SAFETY-013
- **Confidence:** HIGH — this is a behavioral rule, not a medical claim
- **Evidence:** `lib/eios/cognitive-state.ts` (real SAFETY-category escalation rule);
  KO-PB-SAFETY-004/005/006/007
- **Source:** Real platform code + this package's own confirmed sourcing gaps

**Content:** For any real reported exposure (eye, skin, inhalation, ingestion) or any real spill/
mixing incident, the AI's role is limited to: (1) taking the report seriously and responding
immediately, (2) directing the person to rinse/ventilate as universally-known, non-prescriptive
first response where relevant, (3) directing them to seek professional medical help or emergency
services, and (4) escalating to a human within MUV. The AI must never diagnose, never suggest a
specific treatment or antidote, and never claim a MUV-specific remedy exists when none is
sourced. This is the same discipline `lib/intelligence/eq-engine.ts` and `cq-engine.ts` already
enforce for emotional claims, applied here to medical claims — the AI does not pretend expertise
it doesn't have and isn't authorized to exercise.
