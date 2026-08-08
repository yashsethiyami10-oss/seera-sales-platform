# MUV Dishwash Gel™ — Manufacturing Theory

> This file explains the *rationale* behind the process order documented in
> `06_Manufacturing_SOP.md` — why steps happen in this sequence, at a generic industrial-
> chemistry level. As with `04_Ingredients_and_Functions.md`, this is generic background
> context, not a MUV-specific confirmed statement, and is clearly distinguished from the
> verbatim SOP content.

---

## KO-DW-THEORY-001 — Process Rationale

- **KOID:** KO-DW-THEORY-001
- **Title:** MUV Dishwash Gel™ — Manufacturing Process Rationale
- **Category:** Manufacturing Theory
- **Tags:** [dishwash-gel, manufacturing-theory, process-rationale]
- **Version:** 1.0
- **Confidence:** LOW (as generic theory, not MUV-confirmed) / HIGH (for the one point that is
  directly source-confirmed — the salt/thickness relationship)
- **Evidence:** Generic surfactant-gel formulation industry knowledge, applied to explain the
  SOP's own real, sourced step order (KO-DW-MFG-002) — not a new fact about MUV's process.
- **Relationships:** KO-DW-MFG-001, KO-DW-MFG-002, KO-DW-ING-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`'s own step order; generic
  context not independently sourced

**Content:**

The SOP's 13-step order (see `06_Manufacturing_SOP.md`) follows a sequence commonly seen in
surfactant-gel formulation generally: water/chelator/alkali charge first, primary and secondary
surfactants added next (LABSA, SLES, CAPB, CDEA), a humectant (Glycerine) and a pH check/
adjustment stage, a preservative stage, then colour and fragrance last (to avoid degradation
from earlier higher-shear or higher-pH stages), with the salt-based thickening step performed
last and explicitly tied by the SOP itself to reaching a target viscosity ("Add salt solution
slowly **until desired thickness**").

**What is directly source-confirmed (HIGH confidence):**
- The pH check occurs after surfactant addition and before preservative/colour/fragrance
  addition (Step 9, between Glycerine at Step 8 and Phenoxy Ethanol at Step 10).
- Salt addition is explicitly tied to achieving "desired thickness" — the one point in this file
  where the *rationale* for a step is stated in the source itself, not inferred.

**What is generic industry context, not MUV-confirmed (LOW confidence):**
- Why colour/fragrance are added last (avoiding degradation) — plausible, standard practice, but
  not stated as the reason in the source document.
- Why EDTA/Caustic Soda are charged early (typical for these material classes) — same caveat.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Confirmation of the actual engineering/chemistry rationale from MUV's own formulation team,
  rather than this package's generic industry-pattern inference
- Any deviation history — has this order ever been changed, and why

---

## KO-DW-THEORY-002 — Comparison to Sibling Products' Process Structure

- **KOID:** KO-DW-THEORY-002
- **Title:** MUV Dishwash Gel™ — Process Structure vs. Liquid Detergent / Toilet Cleaner
- **Category:** Manufacturing Theory
- **Tags:** [dishwash-gel, cross-product, comparison]
- **Version:** 1.0
- **Confidence:** HIGH (as a structural comparison of already-sourced facts across three
  packages)
- **Evidence:** Cross-reference against KO-LD-MFG-001/002 (Liquid Detergent) and KO-TC-MFG-001/002
  (Toilet Cleaner), both already built and frozen this session.
- **Relationships:** KO-DW-MFG-002, KO-DW-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Cross-reference of three already-built knowledge packages

**Content:**

| Aspect | Liquid Detergent | Toilet Cleaner | Dishwash Gel |
|---|---|---|---|
| Batch size | 10 L | 10 L | 10 L |
| Process steps | 11 | 5 | 13 (most granular) |
| In-process QC checkpoint | 1 (pH ≈ 6, target point only) | 0 (none) | 1 (pH 6.5–7.5, a real range with two-directional correction) |
| Safety section in SOP | None | Yes (4 bullets) | None |
| SOP-stated pricing | Yes (generic, conflicted with chart) | Yes (matches chart) | No — chart is sole pricing source |
| Finishing step | Salt, tied to thickness (10 min mix) | Perfume (15 min mix) | Salt, tied to thickness (15 min final mix) — same finishing logic as Liquid Detergent |

This table is included because it is itself real, useful knowledge — a genuine structural
pattern across MUV's three audited SOPs so far — assembled entirely from already-sourced facts
in this and the two prior packages, not new invented content.
