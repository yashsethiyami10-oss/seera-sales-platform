# Domain 1 — Domain Consistency Audit

---

## Folder/file naming consistency

All 5 chapter folders follow the identical pattern `chapter-0N-<kebab-case-name>/` with the
identical 10-file pipeline shape (`README.md`, `01_requirement_analysis.md` through
`09_merge_instructions.md`, `json/` with 5 files). Verified directly — no chapter deviates.

## KOID namespace consistency

| Chapter | Prefix | Collision check |
|---|---|---|
| 1 | `KO-BI-CH1-` | No collision with CH2–CH5 |
| 2 | `KO-BI-CH2-` | No collision |
| 3 | `KO-BI-CH3-` | No collision |
| 4 | `KO-BI-CH4-` | No collision |
| 5 | `KO-BI-CH5-` | No collision |

37 unique KOIDs confirmed via PowerShell (`Select-Object -Unique` count matches total count
exactly).

## Knowledge Object schema consistency

Every one of the 37 KOs, across all 5 chapters, carries the identical 12-field schema (ID, Name,
Purpose, Scope, Inputs, Outputs, Dependencies, Relationships, Governance Rules, Validation Rules,
Version, Status, Change History, Evidence Classification — 14 in the Markdown template counting
Name/ID separately from the JSON's single `koid`/`name` fields, 12 in the Execution Prompt's own
enumeration). No chapter added, removed, or renamed a field.

## JSON schema consistency (JSON Stability)

`knowledge_objects.json` field names identical across all 5 chapters: `koid`, `name`, `purpose`,
`scope`, `inputs`, `outputs`, `dependencies`, `relationships`, `governanceRules`,
`validationRules`, `version`, `status`, `changeHistory`, `evidenceClassification`. Verified by
direct inspection — zero renamed fields, zero structural drift. `relationships.json`,
`dependencies.json`, `validation_results.json`, `manifest.json` similarly hold consistent shape
across all 5 chapters (the only additions — e.g. Chapter 3's `openGapFound`, Chapter 4's
`outOfScopeDeferral`, Chapter 5's `reservedForDomainAudit` — are chapter-specific *extra* keys in
`manifest.json`, additive only, never replacing or renaming an existing key).

## Version field consistency

36 of 37 KOs at `1.0` (first authoring, never touched again). Exactly 1 (`KO-BI-CH3-005`) at
`1.1`, reflecting its single, real, targeted amendment (`FR-008`) — the only version bump in the
domain, correctly tied to the only Founder Decision made against domain content.

## Status field consistency

All 37 KOs: `"Founder Review Ready"`. No KO in an intermediate or draft state.

## Governance-citation consistency

Every KO that references another KO's governance content does so by KOID citation
(`KO-BI-CH1-006`, etc.), never by restating the cited content — confirmed across the "Premium"
chain, the Protection Rules cross-references, and the forward/backward relationship citations.

## Result: PASS

No structural, naming, or schema drift found anywhere across the domain's 5 chapters.
