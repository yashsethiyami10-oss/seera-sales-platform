# Domain 2 — Domain Consistency Audit

---

## Folder/file naming consistency

All 5 chapter folders follow the identical pattern `chapter-0N-<kebab-case-name>/` with the
identical 10-file pipeline shape, reused unchanged from Domain 1. Verified directly — no chapter
deviates.

## KOID namespace consistency

| Chapter | Prefix | Collision check |
|---|---|---|
| 1 | `KO-PM-CH1-` | No collision with CH2–CH5 or any `KO-BI-*` |
| 2 | `KO-PM-CH2-` | No collision |
| 3 | `KO-PM-CH3-` | No collision |
| 4 | `KO-PM-CH4-` | No collision |
| 5 | `KO-PM-CH5-` | No collision |

65 unique KOIDs confirmed via PowerShell (`Select-Object -Unique` count matches total count
exactly) — zero collision with Domain 1's 37 KOIDs either (`KO-PM-` vs `KO-BI-` prefixes are
structurally distinct).

## Knowledge Object schema consistency

Every one of the 65 KOs, across all 5 chapters, carries the identical 12-field schema — the exact
same schema Domain 1 established, reused across a domain boundary without modification (JSON
Stability maintained cross-domain, not just within one domain).

## JSON schema consistency

`knowledge_objects.json` field names identical across all 5 chapters and identical to Domain 1's
own field names: `koid`, `name`, `purpose`, `scope`, `inputs`, `outputs`, `dependencies`,
`relationships`, `governanceRules`, `validationRules`, `version`, `status`, `changeHistory`,
`evidenceClassification`. Zero renamed fields, zero structural drift. `relationships.json` gained
one new key this domain (`crossChapterRelationships`, distinct from `crossDomainRelationships`)
— an additive extension reflecting Domain 2's much higher intra-domain citation density, not a
renamed or removed field.

## Version field consistency

All 65 KOs at `1.0` — no Founder Decision has yet amended any Domain 2 content (unlike Domain
1's `KO-BI-CH3-005`, which sits at `1.1` after `FR-008`).

## Status field consistency

All 65 KOs: `"Founder Review Ready"`.

## Governance-citation consistency

Every KO citing another KO's governance content does so by KOID, never by restating the cited
content — confirmed across all 13 cross-domain citations and 17 cross-chapter citations.

## Result: PASS

No structural, naming, or schema drift found anywhere across the domain's 5 chapters, and none
introduced relative to Domain 1's established conventions.
