# MUV Floor Cleaner™ — Manufacturing Theory

> Parent-level (shared) Knowledge Object.

---

## KO-FC-THEORY-001 — Manufacturing Process Rationale

- **KOID:** KO-FC-THEORY-001
- **Title:** MUV Floor Cleaner™ — Manufacturing Process Rationale
- **Category:** Manufacturing Theory
- **Tags:** [floor-cleaner, theory, process-rationale, shared, parent]
- **Version:** 1.0
- **Confidence:** MEDIUM — process ORDER is directly sourced; RATIONALE is a reasonable, standard
  inference from general surfactant/emulsion chemistry, not a stated explanation in the SOP
- **Evidence:** SOP Manufacturing SOP (8 steps); Knowledge Library "Mixing Discipline" passage
- **Relationships:** KO-FC-MFG-002, KO-FC-ING-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from KO-FC-MFG-001/002; Knowledge Library "Mixing Discipline" section

**Content:**

The sourced process (water base → surfactant → fragrance/co-material premix → preservative →
colour → silicone-emulsion premix → extended mix → QC/fill) follows a standard, generically-
understood sequencing logic: the surfactant is dissolved into the aqueous base first, fragrance
and its premixed companion material are added next (a common practice to help disperse fragrance
oils evenly), the preservative is added once the base is stable, colour is added before the
silicone emulsion (likely to ensure even colour distribution before the shine-finish component is
introduced), and the silicone emulsion is pre-diluted with water before being added — a
standard practice to prevent the emulsion from destabilizing on direct addition. This is a
generic process-chemistry inference from the stated step order, **not a rationale stated in the
SOP itself** — the SOP gives quantities, order, and mix times, but no "why" explanation for any
step, and no safety rationale at all (unlike Bathroom Cleaner's SOP).

**The one and only variant-specific instruction in the entire process** is Step 5's colour
addition ("Blue for Cloud Walk / Lavender for Velvet Mist") — everything else in the 8-step
sequence is identical regardless of which variant is being produced. This is the structural basis
for this package's Variant Inheritance architecture (`17_Variant_Inheritance_Map.md`): one shared
Parent-level process, one variant-specific override point.

**Relevant Knowledge Library governance context:** the same "Mixing Discipline" passage cited in
prior packages names Floor Cleaner as one of several product categories where "product-specific
order must come from an approved SOP" — this package treats the SOP's own stated 8-step order as
authoritative and does not suggest any deviation from it.
