# MUV Black Phenyl™ — Safety

> Comprehensive safety coverage. Sourced content is quoted verbatim; everything else is marked
> Unknown/Founder Decision Required and logged in `14_FOUNDER_GAPS.md`. **This package never
> generates unsupported medical or chemical advice.**

---

## KO-BP-SAFETY-001 — Source Safety Content (verbatim)

- **Confidence:** HIGH — verbatim from source
- **Evidence:** SOP §7 "Safety" (complete section, quoted in full — nothing trimmed)
- **Source:** `MUV_Black_Phenyl_SOP_10L_Batch.docx`

**Content (verbatim, complete section 7):**

> "Use gloves, goggles and protective clothing. Handle raw materials according to their safety
> data sheets. Ensure adequate ventilation during manufacturing."

Three sentences, the entire safety content in this source. Notably, it references real Safety
Data Sheets ("handle raw materials according to their safety data sheets") without including
their content — those SDS documents are not part of any source searched for this package. See
`14_FOUNDER_GAPS.md`.

---

## KO-BP-SAFETY-002 — Safe Handling

- **Confidence:** MIXED — manufacturing PPE sourced; consumer handling not sourced
- **Evidence:** KO-BP-SAFETY-001

**Content:** Manufacturing-stage handling requires gloves, goggles, and protective clothing
(sourced). **Consumer-stage handling guidance is not sourced — Founder Decision Required.**

---

## KO-BP-SAFETY-003 — Mixing Restrictions

- **Confidence:** N/A — not sourced (a real difference from Pure Bleach, which had an explicit
  mixing restriction)
- **Evidence:** None found in this SOP
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Unlike MUV Pure Bleach™'s SOP (which explicitly restricted mixing with
acids/ammonia), this SOP contains **no mixing restriction of any kind**. This package does not
assume the same restriction applies here — Black Phenyl's own formulation contains no stated acid
or ammonia component, but compatibility with other cleaning products (MUV's own or third-party)
is simply not addressed in any source, and must not be asserted as safe by omission.

---

## KO-BP-SAFETY-004 — Eye Contact

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGH PRIORITY**

**Content:** **Unknown.** Correct AI behavior: acknowledge the report, do not offer a home-remedy
first-aid step, direct the person to rinse with clean water and seek professional/medical or
emergency guidance immediately, and escalate per `04_Decision_Trees.md` KO-BP-DT-004.

---

## KO-BP-SAFETY-005 — Skin Contact

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same escalation behavior as KO-BP-SAFETY-004.

---

## KO-BP-SAFETY-006 — Inhalation

- **Confidence:** N/A for consumer inhalation first aid; MEDIUM for the related manufacturing
  ventilation instruction
- **Evidence:** KO-BP-SAFETY-001 (ventilation instruction only)

**Content:** The SOP's "ensure adequate ventilation during manufacturing" instruction is real and
sourced, but no source addresses what to do if someone reports respiratory irritation from the
finished product. Same escalation behavior as KO-BP-SAFETY-004.

---

## KO-BP-SAFETY-007 — Accidental Ingestion

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required, HIGHEST PRIORITY**

**Content:** **Unknown.** Any real report of ingestion must escalate to emergency services/poison
control immediately, with no attempted home-remedy guidance from the AI whatsoever.

---

## KO-BP-SAFETY-008 — Child Safety

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** General caution (store out of reach of children) can be offered as
ordinary household-chemical common sense, clearly labeled as general guidance, not a MUV claim.

---

## KO-BP-SAFETY-009 — Pet Safety

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** Same treatment as child safety.

---

## KO-BP-SAFETY-010 — Storage

- **Confidence:** N/A — not sourced
- **Evidence:** None found anywhere in the SOP
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.** No storage condition (temperature, light, humidity) exists in this SOP
at all — a real, notable difference from Pure Bleach, which had a sourced storage instruction.

---

## KO-BP-SAFETY-011 — Spill Management

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-BP-SAFETY-012 — Disposal

- **Confidence:** N/A — not sourced
- **Source:** None — **Founder Decision Required**

**Content:** **Unknown.**

---

## KO-BP-SAFETY-013 — Emergency Guidance (AI behavior, not medical content)

- **Confidence:** HIGH — behavioral rule, not a medical claim
- **Evidence:** `lib/eios/cognitive-state.ts`; KO-BP-SAFETY-004/005/006/007

**Content:** For any real reported exposure or spill/mixing incident, the AI: (1) takes the
report seriously and responds immediately, (2) directs the person to rinse/ventilate as
universally-known, non-prescriptive first response where relevant, (3) directs them to seek
professional medical help or emergency services, and (4) escalates to a human within MUV. The AI
never diagnoses, never suggests a specific treatment or antidote, and never claims a MUV-specific
remedy exists when none is sourced.
