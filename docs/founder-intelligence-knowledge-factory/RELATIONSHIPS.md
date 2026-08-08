# Founder Intelligence Knowledge Factory — Relationships

## Intra-repository chains (per Engine)

- Philosophy: KO-FD-PH-001→002→003→004
- Decision Intelligence: KO-FD-DI-001→002→003→004
- Product Intelligence: KO-FD-PI-001→002→003
- Marketing Intelligence: KO-FD-MI-001→002→003
- Sales Intelligence: KO-FD-SI-001→002→003
- Business Intelligence: KO-FD-BU-001→002→003
- Optimization Intelligence: KO-FD-OP-001→002
- KPI Intelligence: KO-FD-KP-001→002
- Learning Intelligence: KO-FD-LN-001→002
- AI Governance: KO-FD-AG-001→002→003
- Gap Records: KO-FD-GAP-001→002
- All Engines' final KOs, plus both Gap Records, feed KO-FD-000 (closing summary).

## Cross-Engine relationships (within this repository)

| From | Type | To |
|---|---|---|
| KO-FD-PH-003 (Darshan Test) | relatesTo | KO-FD-OP-001/002 (growth tactics must also pass the strategic filter) |
| KO-FD-PH-004 (Doctrine Gate) | grounds | KO-FD-AG-002 (Gap-Record-Not-Invent) |
| KO-FD-DI-003 (Decision Model, populated) | isCanonicalFor | every other Engine's use of the 14-field model |
| KO-FD-DI-004 (Controlled Variation) | relatesTo | KO-FD-MI-003 (Creative Consistency) |
| KO-FD-SI-003 (Objection as Intelligence) | feeds | KO-FD-LN-001/002 (Learning Engine) |
| KO-FD-BU-002 (Spend/Maintain/Experiment/Invest) | feeds | KO-FD-OP-001/002 (Optimization Engine) |
| KO-FD-BU-003 (Revenue Quality) | feeds | KO-FD-KP-001/002 (KPI Engine) |
| KO-FD-OP-002 (Invest/Stop Triggers) | feeds | KO-FD-KP-001/002 (KPI Engine) |
| KO-FD-AG-003 (IP Reservation) | crossReferences | KO-FD-GAP-002 (Cross-Repository Arbitration) |

## Cross-repository authoritative references (Marketing Knowledge Factory — informational)

| From | To (Marketing KF) | Status |
|---|---|---|
| KO-FD-MI-001 | KO-PM-CH2-009, KO-CC-CH3-001 | frozen / complete |
| KO-FD-MI-002 | KO-PM-CH1-005, KO-PM-CH2-008 | frozen |
| KO-FD-MI-003 | KO-PM-CH2-013 | frozen |
| KO-FD-SI-001 | KO-SC-CH2-002 | frozen |
| KO-FD-SI-002 | KO-SC-CH2-003 | frozen |
| KO-FD-SI-003 | KO-SC-CH2-005 | frozen |
| KO-FD-BU-003 | KO-SC-CH1-007 | frozen |
| KO-FD-OP-001 | KO-GO-005, KO-PM-CH5-008 | Founder Review Ready / frozen |
| KO-FD-OP-002 | KO-GO-006, KO-PM-CH5-014 | Founder Review Ready / frozen |
| KO-FD-KP-001 | KO-PM-CH5-003, KO-GO-002 | frozen / Founder Review Ready |
| KO-FD-KP-002 | KO-PM-CH5-002 | frozen |
| KO-FD-LN-001 | KO-PM-CH5-010 | frozen |
| KO-FD-LN-002 | KO-PM-CH5-009 | frozen |
| KO-FD-AG-001 | KO-DM-CH10-001, KO-DM-CH10-005 | frozen |
| KO-FD-AG-003 | KO-CC-CH7-001..006, KO-GO-007/008, KO-MO-007 | frozen / Founder Review Ready |
| KO-FD-PI-001 (indirect, via Constitution Art. 3 citation to KO-FD-PH-004) | (Founder philosophy chain) | — |

## Cross-repository authoritative references (Institutional Sales Knowledge Factory)

| From | To | Status |
|---|---|---|
| KO-FD-SI-001 | KO-IS-002 | Founder Review Ready |
| KO-FD-SI-002 | KO-IS-003 | Founder Review Ready |
| KO-FD-SI-003 | KO-IS-005 | Founder Review Ready |
| KO-FD-AG-003 | KO-IS-024..032 | Founder Decision Required (Gap Records, cross-referenced not restated) |

## Cross-repository authoritative references (Product Knowledge Factory — document-level, not KOID-based)

| From | To | Status |
|---|---|---|
| KO-FD-PI-001 | `CONSTITUTION.md` Articles 2-4, `FOUNDER_RULES.md` FR-001 | FROZEN |
| KO-FD-PI-002 | `FOUNDER_RULES.md` FR-005 | FROZEN |
| KO-FD-PI-003 | `FOUNDER_RULES.md` FR-003, FR-004 | FROZEN |

## Forward

KO-FD-000 feeds `FOUNDER_REVIEW.md` and the Global Repository Health Snapshot.

## Integrity check

All 32 Knowledge Objects ≥1 relationship. No orphans. No circular relationship. 43/43 unique
cross-repository KOID citations (30 Marketing KF, 13 Institutional Sales KF) independently
PowerShell-verified against their live registries. All Product Knowledge Factory document
citations independently re-read and quote-checked.
