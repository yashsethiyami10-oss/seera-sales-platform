# Domain 4 — Relationship Integrity Audit

## Method
Every KO's `relationships`/`dependencies` field was cross-checked against the live KOID
registries of: this domain's own 5 chapters (65 KOs), and frozen Domain 3 (51 KOs, for the CRM
citation). Checked via PowerShell parse of every chapter's `knowledge_objects.json` plus
Domain 3's own registry — see verification log below.

## Intra-domain relationship check

| Chapter | Orphan KOs (0 relationships) | Circular relationships |
|---|---|---|
| 1 — Pricing & MRP Architecture | None | None |
| 2 — Sales & Distribution | None | None |
| 3 — Marketplace Operations | None | None |
| 4 — Marketplace Content & Conversion | None | None |
| 5 — Commercial Decisions & Channel Evolution | None | None |

Every one of the 65 KOs carries at least one relationship (intra-chapter, cross-chapter, or
cross-domain). No orphan KOs. No circular relationship chains detected in any chapter's own
`relationships.json`.

## Cross-chapter relationship check (within Domain 4)

All cross-chapter citations (Chapter 3→1, 4→1/2/3, 5→1/2) resolve to KOIDs that exist in the
cited chapter's own registry. Verified by direct KOID lookup against each source chapter's
`knowledge_objects.json`. Notably dense internal cross-referencing in Chapter 5 (the domain's
closing chapter), which relates back to Chapters 1 and 2 at eight separate points — expected
for a chapter whose own source explicitly says "Marketplace price must use Chapter 1
architecture" and similar.

Several `relatesTo` (not `complementsNotDuplicates`) relationships were used within this
domain, distinct from the `complementsNotDuplicates` pattern used in Domains 1-3: Domain 4's
internal cross-chapter overlaps (e.g., Chapter 5's Territory Planning vs. Chapter 2's Geographic
Expansion) are genuinely the same source Part's own internal echoes across chapters, not
independently-authored content converging on the same topic — so they are recorded as `relatesTo`
rather than needing the stronger "not duplicates" framing Domains 1-3 required across domain
boundaries.

## Cross-domain relationship check (Domain 4 → frozen Domain 3)

| Citation | Source chapter | Target KOID | Verified present in frozen registry? |
|---|---|---|---|
| CRM System citation | Ch.5 (`KO-SC-CH5-008`) | KO-CI-CH6-001 | ✅ (Domain 3, 51 KOs) |
| CRM System citation | Ch.5 (`KO-SC-CH5-008`) | KO-CI-CH6-002 | ✅ |

Both cross-domain KOID citations independently verified to exist, unmodified, in Domain 3's
frozen registry. This is the domain's single most important integrity check: `KO-SC-CH5-008`
is a citation-only KO by design (see `03_domain_consistency_audit.md`), and its entire purpose
depends on these two citations resolving correctly — confirmed.

Additional Volume-name-only references (Domain 1 via Volume III in Chapter 4; Domain 2/3 via
Marketing/Customer Experience in Chapter 3) do not name specific KOIDs, matching how the source
itself refers to those Volumes — disclosed in each chapter's own relationships file, not
fabricated as false specific-KOID citations.

## Result

**PASS.** 65/65 KOs relationship-complete. 0 orphans. 0 circular relationships. 2/2 specific
cross-domain KOID citations verified. 0 fabricated citations.
