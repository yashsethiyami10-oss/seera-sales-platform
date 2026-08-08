# Domain 3 — Relationship Integrity Audit

## Method
Every KO's `relationships`/`dependencies` field was cross-checked against the live KOID
registries of: this domain's own 7 chapters (51 KOs), frozen Domain 1 (37 KOs), and frozen
Domain 2 (65 KOs). Checked via PowerShell parse of every chapter's `knowledge_objects.json`
plus Domain 1/2's own registries — see verification log below.

## Intra-domain relationship check

| Chapter | Orphan KOs (0 relationships) | Circular relationships |
|---|---|---|
| 1 — Customer Promise & Experience Context | None | None |
| 2 — Food-Service Product Experience | None | None |
| 3 — Outlet Culture & Environment | None | None |
| 4 — Customer Communication & Promotion | None | None |
| 5 — Experience, Franchise & Expansion References | None | None |
| 6 — CRM System (Excerpt) | None | None |
| 7 — Customer Insights & Data Intelligence (Excerpt) | None | None |

Every one of the 51 KOs carries at least one relationship (intra-chapter, cross-chapter, or
cross-domain). No orphan KOs. No circular relationship chains detected in any chapter's own
`relationships.json`.

## Cross-chapter relationship check (within Domain 3)

All cross-chapter citations (Chapter 2→1, 3→1/2, 4→1/3, 5→1/2, 6→1/3, 7→1/4) resolve to KOIDs
that exist in the cited chapter's own registry. Verified by direct KOID lookup against each
source chapter's `knowledge_objects.json`.

Six explicit `complementsNotDuplicates` relationships recorded across the domain, all
independently justified by genuine framing differences (not silent duplication):
- Ch.1 `KO-CI-CH1-004`/`005` vs. Domain 2's Customer-First Thinking/Journey Map (company-wide
  vs. marketing-task framing).
- Ch.6 `KO-CI-CH6-001` vs. Ch.1 `KO-CI-CH1-005` and Ch.3 `KO-CI-CH3-005` (commercial-record vs.
  experience-journey vs. service-operations framing of the same customer).
- Ch.7 `KO-CI-CH7-002` vs. Ch.4 `KO-CI-CH4-005`/`006` (data-governance/BI vs. CX-operations
  framing of largely the same evidence sources).

## Cross-domain relationship check (Domain 3 → frozen Domain 1/2)

| Citation | Source chapter | Target KOID | Verified present in frozen registry? |
|---|---|---|---|
| Brand Promise citation | Ch.1 | KO-BI-CH1-001 | ✅ (Domain 1, 37 KOs) |
| Customer Trust citation | Ch.1 | KO-PM-CH1-005 | ✅ (Domain 2, 65 KOs) |
| Customer-First Thinking citation | Ch.1 | KO-PM-CH1-002 | ✅ |
| Customer Journey Map citation | Ch.1 | KO-PM-CH1-006 | ✅ |
| Repeat Purchase Signals citation | Ch.2 | KO-PM-CH4-008 | ✅ |
| Quality Escalation citation | Ch.2 | KO-PM-CH5-014 | ✅ |

All 6 specific cross-domain KOID citations independently verified to exist, unmodified, in
their respective frozen domain registries. No fabricated citations found. Two additional
chapters (4, 7) cite Volume-name references only (e.g., "Volume VII/Marketing") rather than
specific KOIDs, matching how the source itself refers to those Volumes — this is disclosed in
each chapter's own relationships file as a Volume-name reference, not a false specific-KOID
citation.

## Result

**PASS.** 51/51 KOs relationship-complete. 0 orphans. 0 circular relationships. 6/6 specific
cross-domain KOID citations verified. 0 fabricated citations.
