# MUV Black Phenyl™ — Product Knowledge Package

> Product Family 08 of the MUV Product Knowledge Factory™. Second package built under the
> standard structure introduced for Pure Bleach, with one addition: `14_FOUNDER_GAPS.md`, a
> dedicated, standalone gap register (previously gaps were folded into Missing Knowledge Reports
> and inline "Founder Decision Required" markers only).

---

## Governing documents (authoritative, and the only ones — per Founder Instruction)

- `docs/knowledge-factory/CONSTITUTION.md`
- `docs/knowledge-factory/ARCHITECTURE.md`
- `docs/knowledge-factory/VALIDATION_RULES.md`
- `docs/knowledge-factory/FOUNDER_RULES.md`

## Package structure

| File / Folder | Purpose |
|---|---|
| `00_Source_Register.md` | Every source searched, what was found, what wasn't |
| `01_Requirements.md` | This package's own implementation spec |
| `02_Product_Architecture.md` | Parent product identity, SKU, naming, category |
| `03_Product_Intelligence.md` | Purpose, applications, mechanism, usage, storage, shelf life, limitations |
| `04_Decision_Trees.md` | Product-fit and safety-escalation logic |
| `05_Customer_Conversation.md` | 13 required conversation flows |
| `06_FAQs.md` | Customer-facing FAQ set |
| `07_Objection_Handling.md` | Honest responses to common objections/concerns |
| `08_Safety.md` | Comprehensive safety coverage |
| `09_Founder_Rules.md` | How the global Founder Rules ledger applies to this package |
| `10_LIVE_DATA_MAPPING.md` | Authoritative live source for every commercial field |
| `14_FOUNDER_GAPS.md` | **New** — standalone, dedicated register of every unresolved gap requiring Founder input |
| `11_JSON/` | Machine-readable exports |
| `12_Validation/` | Validation checklist and results |
| `13_Reports/` | Coverage, Validation, KO Statistics, Source Coverage, Missing Knowledge, Product Quality Score, Care Intelligence, Freeze Recommendation |
| `MASTER_Black_Phenyl.md` | Single-page index and status summary |

## KOID prefix

`KO-BP-`

## Naming — no discrepancy this time

Unlike Bathroom Cleaner ("Fresh"), Glass Cleaner ("Crystal"), and Pure Bleach ("Pure"), **both
real sources call this product "MUV Black Phenyl" exactly** — Product Chart row 22 and the SOP
title block both match the Founder-given official name verbatim. No naming resolution was
required.

## Real, confirmed conflict — flagged up front

The Product Chart (row 22) states pack size **500ml**; the Production SOP states pack size
**1L**. (The Chart also ties a historical MRP figure to its 500ml entry — recorded only in
`00_Source_Register.md` as a source citation, never restated here.) This directly corroborates
the pre-existing `lib/knowledge-factory/conflict-service.ts` header comment, which explicitly
names Black Phenyl among products with a known pricing/naming conflict found by hand earlier this
session. Per this task's own "Available Pack Sizes: 1L" instruction (a direct Founder Instruction,
Source Authority #2, matching the SOP), this package treats **1L** as the confirmed pack size —
but the Chart's conflicting 500ml entry is fully documented, not deleted or silently resolved.
See `00_Source_Register.md` and `14_FOUNDER_GAPS.md`.

## Stop Rule

Per the Founder's explicit instruction: after this package is complete, **STOP**. Do not begin
the next Product Family without explicit Founder approval.
