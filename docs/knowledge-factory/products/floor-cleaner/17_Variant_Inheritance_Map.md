# MUV Floor Cleaner™ — Variant Inheritance Map

> **New requirement for this Product Family.** This is the first MUV AI Knowledge Factory™
> package requiring a Variant Inheritance architecture: shared knowledge exists exactly once at
> the Parent level; variant-specific knowledge overrides or extends it. This map shows exactly
> which Knowledge Objects are inherited by which variant, and which are variant-specific
> overrides — including the one variant (Rose Water) where inheritance itself is an open
> question, not an assumption.

---

## KO-FC-INHERIT-001 — Variant Inheritance Map

- **KOID:** KO-FC-INHERIT-001
- **Title:** MUV Floor Cleaner™ — Variant Inheritance Map
- **Category:** Variant Inheritance
- **Tags:** [floor-cleaner, inheritance, architecture, governance]
- **Version:** 1.0
- **Confidence:** HIGH (Velvet Mist/Cloud Walk inheritance structure — directly sourced) / N/A
  (Rose Water inheritance — genuinely unconfirmed)
- **Relationships:** All Parent-level and variant-specific KOs in this package
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from the single shared Production SOP's structure (one document, one
  variant-specific override line)

**Content:**

### Principle

Per this task's explicit instruction, shared knowledge exists ONLY once (at Parent level);
variant-specific knowledge inherits from the Parent and overrides only what genuinely differs.
The source material itself makes this architecture unusually clean for Velvet Mist and Cloud
Walk: **one SOP, one raw materials table, one 8-step process, with exactly ONE variant-specific
line (the colour-addition step).** Rose Water breaks this cleanliness — because it has no source
material at all, this package does **not** assume it silently inherits the shared base formula;
inheritance for Rose Water is itself an open, Founder-decidable question.

### Parent Knowledge Objects (shared, exist exactly once)

```
MUV Floor Cleaner™ (Parent)
│
├─ KO-FC-IDENT-001–005 ............ Product Identity (family-level)
├─ KO-FC-DESC-001/002 ............. Product Description / Positioning
├─ KO-FC-ING-001 .................. Ingredient List & Functional Roles (base formula, minus colour)
├─ KO-FC-THEORY-001 ............... Manufacturing Process Rationale
├─ KO-FC-MFG-001 .................. Raw Material List (base formula, minus colour identity)
├─ KO-FC-MFG-002 .................. Process Steps (8 steps; Step 5 is the override point)
├─ KO-FC-MFG-003 .................. Manufacturing Equipment
├─ KO-FC-RECON-001 ................ Batch Mass Reconciliation
├─ KO-FC-QC-001 ................... Quality Control (documents total absence)
├─ KO-FC-SAFETY-001–004 ........... Safety & Risk (documents total absence)
├─ KO-FC-PKG-001 .................. Packaging Fill Weight (1015g/1L, 5020g/5L)
├─ KO-FC-STORAGE-001 .............. Storage Requirements
├─ KO-FC-TRANSPORT-001 ............ Transportation Requirements
├─ KO-FC-SHELF-001 ................ Shelf Life
├─ KO-FC-SALES-002 ................ Competitor Comparison
├─ KO-FC-MKT-001 .................. Marketing Intelligence (family-level)
├─ KO-FC-SUPPORT-001 .............. Support Process
├─ KO-FC-TROUBLE-001 .............. Troubleshooting (framework)
├─ KO-FC-COMPLAINT-001 ............ Complaint Handling
├─ KO-FC-FAQ-001 .................. Customer FAQs (family-level)
├─ KO-FC-AI-001–003 ............... AI Response/Escalation/Confidence Rules
└─ KO-FC-CRO-001–006 .............. Parent Care Response Objects (daily cleaning, spills,
                                     odour, kids, pets, festival)
```

### Inheritance by Variant

| Variant | Inherits Parent KOs? | Overrides / Variant-Specific Additions |
|---|---|---|
| **MUV Velvet Mist Floor Cleaner™** | **YES — confirmed.** Sourced from the same single SOP as Cloud Walk; inherits all Parent-level KOs above without modification. | KO-FC-VM-VAR-001 (1L SKU: Lavender colour, pricing LIVE — see `LIVE_DATA_MAPPING.md`), KO-FC-VM-VAR-002 (5L SKU: Lavender colour, pricing LIVE — see `LIVE_DATA_MAPPING.md`; historical Chart/SOP discrepancy recorded in `20_Source_Conflict_Register.md` CONFLICT-001), KO-FC-CRO-007 (variant experience CRO) |
| **MUV Cloud Walk Floor Cleaner™** | **YES — confirmed.** Same basis as Velvet Mist. | KO-FC-CW-VAR-001 (1L SKU: Blue colour, pricing LIVE — see `LIVE_DATA_MAPPING.md`), KO-FC-CW-VAR-002 (5L SKU: Blue colour, pricing LIVE — see `LIVE_DATA_MAPPING.md`; historical Chart/SOP discrepancy — largest gap of any product/variant this session — recorded in `20_Source_Conflict_Register.md` CONFLICT-002), KO-FC-CRO-008 (variant experience CRO) |
| **MUV Rose Water Floor Cleaner™** | **UNCONFIRMED — an open question, not an assumption.** The variant's name and family membership are real (direct Founder Instruction), but nothing in any source confirms it uses the shared base formula, process, fill weights, or any other Parent-level manufacturing/QC/safety fact. This package does **not** mark Rose Water as inheriting the Parent KOs above. | KO-FC-RW-VAR-001 (name/family-membership only; every attribute REQUIRES FOUNDER INPUT), KO-FC-CRO-009 (honest-disclosure variant CRO) |

### The single override point, precisely

Within the shared SOP, exactly one instruction differs by variant:

> Step 5: **"Add colour (Blue for Cloud Walk / Lavender for Velvet Mist)."**

Every other Parent-level fact (raw material quantities, the other 7 process steps, fill weights,
the SOP's own stated MRP line) is identical for both sourced variants. This is why the
architecture is described as "one Parent object, one override point" rather than "three parallel
formulas" — duplicating the raw materials table or process steps per variant would violate the
explicit "never duplicate Parent knowledge" instruction and would not reflect what the source
material actually shows.

### What would change this map

If the Founder supplies real Rose Water source material (a formula, a Product Chart row, or an
explicit instruction that it shares the Velvet Mist/Cloud Walk base), Rose Water would move from
"UNCONFIRMED" to "YES — confirmed" in the table above, and its inheritance would then follow the
same single-override-point pattern (adding a third colour/fragrance branch to Step 5) rather than
requiring a new parallel document. Until then, this map records the honest, current state: two
variants fully inherit, one variant's inheritance status is itself a Founder decision.
