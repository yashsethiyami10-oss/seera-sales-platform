# Domain 4 — Domain Consistency Audit

## Structural consistency

| Check | Result |
|---|---|
| Every chapter uses the identical 15-file pipeline (README + 01-09 + 5 JSON) | ✅ 5/5 chapters |
| Every KO carries all 12 standard fields | ✅ 65/65 KOs (including the citation-only `KO-SC-CH5-008`) |
| JSON field names identical across all chapters/domains | ✅ |
| KOID namespace convention (`KO-SC-CH{N}-{NNN}`) followed exactly | ✅ 5/5 chapters |
| Evidence Classification taxonomy used correctly | ✅ — all 65 KOs classified Verified (including `KO-SC-CH5-008`, whose Verified status covers the citation's accuracy, not new source content); no Derived/Founder Decision Required KOs exist in this domain |

## Terminology consistency

- "Volume" vs. "Part" used interchangeably, matching the source document's own usage (Chapter
  40's own "Next:" line says "Volume IX" while headings read "Part IX") — not normalized away.
- Governance-deferral phrasing ("Volume V and Volume VI own...", "Franchise/legal and capital
  architecture belong to their owning volumes") consistently preserved verbatim.
- The domain README's own naming-gap note ("Sales & Channel Intelligence" ↔ Part VIII's real
  title "Sales, Pricing, Distribution & Marketplaces") mirrors the identical naming-gap pattern
  already established for Domains 1-2, applied consistently.

## Disclosed departures from Domains 1-2's pattern (intentional, not inconsistency)

| Departure | Reason | Disclosed in |
|---|---|---|
| One chapter (`KO-SC-CH5-008`) is citation-only, with zero new source content | CRM System subsection already fully covered by frozen Domain 3; Zero Duplicate Knowledge required citing, not re-transcribing | Domain README (written before Chapter 1 was authored), Chapter 5 README, `01_requirement_analysis.md`, `07_self_challenge.md` |
| Chapter 5 has 19 KOs, far more than the typical 8-15 | Preserves both the CRM citation KO and Part VIII's own closing Part Summary as an addressable KO (`KO-SC-CH5-019`), on top of Chapter 40's own genuinely large 19-subsection body | Chapter 5 README, requirement analysis |
| Chapter 2 has 15 KOs (largest "normal" chapter) | Genuinely dense 20-subsection source chapter, not padded | Chapter 2 README |
| `relatesTo` used instead of `complementsNotDuplicates` for several intra-domain cross-chapter links | These are the same source Part's own internal echoes across its own chapters, not independently-authored convergent content — a real, disclosed distinction from the cross-domain pattern | `01_relationship_integrity_audit.md` |

All four departures are structural, source-driven, and explicitly disclosed at the point they
occur — none is a silent inconsistency.

## Cross-domain terminology check

Domain 4's one specific-KOID citation to Domain 3 (`KO-CI-CH6-001`/`002`) uses the exact KOID
and naming conventions that frozen domain established — no renamed or reinterpreted
terminology introduced. Volume-name-only references to Domains 1-3 (Volume III, Marketing,
Customer Experience) match the source's own Volume-numbering scheme exactly.

## Result

**PASS.** Structural, terminological, and disclosed-departure consistency all verified.
