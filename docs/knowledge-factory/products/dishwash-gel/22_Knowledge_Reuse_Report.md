# MUV Dishwash Gel™ — Knowledge Reuse Report

> First applied as a dedicated register this product family. Reports what was reused
> (by pattern/relationship reference) from Liquid Detergent™ and Toilet Cleaner™ versus what
> is genuinely new to this product, and what duplication was deliberately avoided.

---

## Reused Knowledge (via cross-package pattern/relationship reference, not copy-paste)

Every product-family package this session shares certain STRUCTURAL patterns because they all
sit on top of the same real, unmodified platform code — reusing the pattern means citing the
same underlying platform behavior rather than re-deriving it, while still writing product-scoped
KOIDs (since each package must stand alone and be individually approvable):

| Pattern | Reused from | Applied in Dishwash Gel as |
|---|---|---|
| Support ticket process (`SupportTicket` + `ProductIssueReport`) | KO-LD-SAFETY-007, KO-TC-SAFETY-007 | KO-DW-SUPPORT-001, KO-DW-COMPLAINT-001 |
| AI escalation rule structure (SAFETY-category always escalates) | KO-LD-AI-005, KO-TC-AI-005 | KO-DW-AI-002 |
| AI confidence-tier rule (HIGH/MEDIUM/LOW/N/A, cross-checked against `lib/intelligence/confidence-engine.ts`) | KO-LD-AI-006, KO-TC-AI-006 | KO-DW-AI-003 |
| "Product not yet catalogued" sales-intelligence disclosure | KO-LD-SALES-001, KO-TC-SALES-001 | KO-DW-SALES-001 |
| Placeholder-institutional-price exclusion discipline (`consumption-rules.ts`) | KO-TC-SALES-001 (₹130/Ltr TOILET_CLEANER) | KO-DW-SALES-001 (₹150/Ltr DISHWASH) |
| No-hallucination raw-material abbreviation caveat | KO-LD-MFG-001, KO-TC-MFG-001 | KO-DW-MFG-001, KO-DW-ING-001 |
| Source Register / clean-result recording discipline | Toilet Cleaner's `Source_Conflict_Register.md` (first package to record a clean match explicitly) | `18_Source_Conflict_Register.md`, `20_Competitor_Reference_Register.md` |

**Nothing was copy-pasted verbatim across packages** — each product family's actual data
(ingredients, pricing, process steps) is unique and separately sourced; only the *governance
pattern* (how to handle a gap, how to record a clean check, how escalation/confidence rules are
structured) is reused, exactly as the instruction intends by "inheritance or relationship
references," not literal duplication of content that would be wrong for a different product.

## New Knowledge Objects (genuinely new to this product family)

- All product-specific facts: KO-DW-IDENT-001 through KO-DW-IDENT-005, KO-DW-VAR-001/002/003,
  KO-DW-MFG-001/002/003, KO-DW-ING-001, KO-DW-QC-001, KO-DW-SAFETY-001 through 004,
  KO-DW-PKG-001, KO-DW-STORAGE-001, KO-DW-TRANSPORT-001, KO-DW-SHELF-001, KO-DW-SALES-001/002/003,
  KO-DW-MKT-001, KO-DW-SUPPORT-001, KO-DW-FAQ-001, KO-DW-AI-001/002/003, KO-DW-TROUBLE-001,
  KO-DW-COMPLAINT-001, KO-DW-GQ-001, KO-DW-NAME-001, KO-DW-COMPETITOR-001, KO-DW-VISIBILITY-001
- **Two genuinely new content categories** not present as their own files in either prior
  package: `05_Manufacturing_Theory.md` (process rationale) and `07_Batch_Reconciliation.md`
  (real arithmetic reconciliation of sourced inputs vs. sourced fill weights) — these are new
  ways of using already-sourced data, not new invented facts.

## Modified Knowledge Objects

**None.** Per the explicit instruction not to modify Liquid Detergent™ or Toilet Cleaner™
unless specifically instructed, **zero KOIDs in either prior package were edited** during this
work. This report only *references* prior KOIDs (e.g. "KO-LD-AI-005"); it does not alter them.
Confirmed by not opening either prior package's files for editing at any point in this session.

## Duplicate Knowledge Prevented

- Did **not** re-derive the Support-ticket complaint-handling mechanism from scratch a third
  time — cited the same real `lib/support/*` platform code already documented twice.
- Did **not** re-explain the EIOS escalation/confidence-tier logic from scratch a third time —
  cited `lib/eios/cognitive-state.ts`/`lib/intelligence/confidence-engine.ts` the same way both
  prior packages did, extending the pattern rather than restating it.
- Did **not** duplicate the "product not yet catalogued, no CustomerIntelligenceProfile data
  exists" disclosure as new research — this is the same real, confirmed platform fact for all
  three products (none of the three has a real `Product` row yet).
- Did **not** invent a new access-control model for `21_Knowledge_Visibility_Matrix.md` — reused
  the real, existing `KnowledgeLayer` enum and RBAC role system rather than designing a
  parallel one.

---

**Reuse ratio (illustrative, not a formal metric):** of this package's ~35 Knowledge Objects,
roughly 7 explicitly cite a reused cross-package pattern in their own Evidence/Relationships
fields (KO-DW-SUPPORT-001, KO-DW-COMPLAINT-001, KO-DW-AI-001/002/003, KO-DW-SALES-001,
KO-DW-ING-001's abbreviation caveat) — the remainder are genuinely new, product-specific content
that could not be reused from either prior package by definition (different ingredients,
different pricing, different process).
