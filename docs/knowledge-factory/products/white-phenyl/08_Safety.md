# MUV White Phenyl™ — Safety

> Comprehensive safety coverage. Sourced content is quoted verbatim from White Phenyl's own SOP —
> **not copied from any other product**, per this task's explicit instruction. Everything else is
> marked Unknown/Founder Decision Required and logged in `14_FOUNDER_GAPS.md`. This package never
> generates unsupported medical or chemical advice.

---

## KO-WP-SAFETY-001 — Source Safety Content (verbatim)

- **Confidence:** HIGH — verbatim from source, independently extracted
- **Evidence:** SOP §7 "Safety" (complete section, quoted in full — nothing trimmed)
- **Source:** `MUV_White_Phenyl_SOP_10L_Batch.docx`

**Content (verbatim, complete section 7):**

> "Wear gloves, safety glasses and apron during manufacturing. Use adequate ventilation. Handle
> chemicals according to their safety data sheets."

Three sentences, the entire safety content in this source. **Structurally similar to, but not
identical wording from, Black Phenyl's own safety section** (which reads: "Use gloves, goggles
and protective clothing. Handle raw materials according to their safety data sheets. Ensure
adequate ventilation during manufacturing.") — both cover PPE, ventilation, and an SDS reference,
in a different sentence order and with different specific PPE items named (gloves/safety
glasses/apron vs. gloves/goggles/protective clothing). This confirms each product's safety text
was independently sourced from its own SOP, not templated or copy-pasted — consistent with this
task's explicit "do not copy safety guidance from previous products" instruction. Like Black
Phenyl, this SOP references real Safety Data Sheets without including their content. See
`14_FOUNDER_GAPS.md`.

---

## KO-WP-SAFETY-002 — Safe Handling

- **Confidence:** MIXED — manufacturing PPE sourced; consumer handling not sourced
- **Evidence:** KO-WP-SAFETY-001

**Content:** Manufacturing-stage handling requires gloves, safety glasses, and an apron
(sourced). **Consumer-stage handling guidance is not sourced — Founder Decision Required.**

---

## KO-WP-SAFETY-003 — Mixing Restrictions

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No mixing restriction exists in this SOP, the same gap found for Black
Phenyl (unlike Pure Bleach, which had an explicit restriction). Compatibility with other cleaning
products is not addressed either way.

---

## KO-WP-SAFETY-004 — Eye Contact

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGH PRIORITY**

**Content:** **Unknown.** Correct AI behavior: acknowledge the report, direct the person to rinse
with clean water and seek professional/medical or emergency guidance immediately, and escalate
per `04_Decision_Trees.md` KO-WP-DT-004.

---

## KO-WP-SAFETY-005 — Skin Contact

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same escalation behavior as KO-WP-SAFETY-004.

---

## KO-WP-SAFETY-006 — Inhalation

- **Confidence:** MIXED (real manufacturing ventilation instruction) / N/A (consumer inhalation
  first aid)
- **Evidence:** KO-WP-SAFETY-001

**Content:** The SOP's "use adequate ventilation" instruction is real and sourced, but no source
addresses what to do if someone reports respiratory irritation from the finished product. Same
escalation behavior as KO-WP-SAFETY-004.

---

## KO-WP-SAFETY-007 — Accidental Ingestion

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGHEST PRIORITY**

**Content:** **Unknown.** Any real report of ingestion must escalate to emergency services/poison
control immediately, with no attempted home-remedy guidance from the AI whatsoever.

---

## KO-WP-SAFETY-008 — Child Safety

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** General caution (store out of reach of children) can be offered as
ordinary household-chemical common sense, clearly labeled as general guidance, not a MUV claim.

---

## KO-WP-SAFETY-009 — Pet Safety

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-SAFETY-010 — Storage

- **Confidence:** N/A — not sourced
- **Evidence:** None found anywhere in the SOP
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No storage condition exists in this SOP at all — the same gap found
for Black Phenyl.

---

## KO-WP-SAFETY-011 — Spill Management

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-SAFETY-012 — Disposal

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-WP-SAFETY-013 — Emergency Guidance (AI behavior, not medical content)

- **Confidence:** HIGH — behavioral rule, not a medical claim
- **Evidence:** `lib/eios/cognitive-state.ts`; KO-WP-SAFETY-004/005/006/007
- **Reused pattern:** behavioral rule reused from Pure Bleach's KO-PB-SAFETY-013 / Black Phenyl's
  KO-BP-SAFETY-013 — see `13_Reports/08_Knowledge_Reuse_Summary.md`

**Content:** For any real reported exposure or spill/mixing incident, the AI: (1) takes the
report seriously and responds immediately, (2) directs the person to rinse/ventilate as
universally-known, non-prescriptive first response where relevant, (3) directs them to seek
professional medical help or emergency services, and (4) escalates to a human within MUV. The AI
never diagnoses, never suggests a specific treatment or antidote, and never claims a MUV-specific
remedy exists when none is sourced.
