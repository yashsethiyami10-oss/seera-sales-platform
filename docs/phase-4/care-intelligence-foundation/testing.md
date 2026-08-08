# Testing

This repository has no automated test runner (unchanged finding from Modules 1–3). Nothing below is
claimed as CI-style automated coverage — it is direct verification against real tooling and the real
database, reported exactly as run.

## Build verification

| Command | Result |
|---|---|
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` (run twice — once before, once after an unrelated concurrent schema change landed mid-module; both times valid) |
| `npx prisma db push --skip-generate` | `Your database is now in sync with your Prisma schema.` (both runs) |
| `npx prisma generate` | `✔ Generated Prisma Client` (both runs) |
| `npx tsc --noEmit` | Exit code 0, zero errors (three runs across this module's development — clean each time) |
| `npm run build` | Clean production build |

## Manual verification script

`npx tsx`, importing the real Zod schemas from `lib/validations/care-intelligence.ts`, run directly
against the real database, deleted after the run. **29 checks, 29 passed, 0 failed:**

```
PASS: Valid createCareIntelligence payload parses
PASS: Invalid slug format rejected
PASS: updateCareIntelligence rejects a non-lifecycle status value (PUBLISHED not allowed here)
PASS: DRAFT -> PUBLISHED directly blocked
PASS: REVIEW -> PUBLISHED allowed
PASS: PUBLISHED -> ARCHIVED only
PASS: ARCHIVED terminal
PASS: Duplicate slug detectable before insert
PASS: Created CIF item + v1 DRAFT
PASS: All structured sections + all 4 relation types populated
PASS: Related product not duplicated (no price field on the relation)
PASS: Omitted array (requiredInformation) left untouched by a careActions-only update
PASS: Provided array (careActions) fully replaced, not appended
PASS: Moved to REVIEW
PASS: Editing a REVIEW version without explicit status silently reverts it to DRAFT
PASS: v1 published
PASS: Editing a PUBLISHED version would be blocked by loadEditableVersion
PASS: v1 content still intact after v2 published (never overwritten)
PASS: v1 status now ARCHIVED (history preserved)
PASS: Full version history preserved (2 versions)
PASS: Exactly one PUBLISHED version at a time
PASS: Restoring from an archived version does not touch the currently published version
PASS: Restore created a genuinely new version (v3), not a mutation of v1 or v2
PASS: Public query returns our test PUBLIC item
PASS: Confidential item absent from Layer-PUBLIC query
PASS: Public projection excludes every internal-only field
PASS: Invalid product reference rejected
PASS: Deleting CareIntelligence cascades all versions and child sections
PASS: Cascade delete of CareIntelligence does NOT delete the referenced Product (reference, not ownership)

29 passed, 0 failed
```

All test data (1 temporary product, 1 PIF, 1 PrIF, 1 KnowledgeItem, 1 PUBLIC test item across 3
versions, 1 CONFIDENTIAL test item) was deleted at the end of the script — the cascade-delete checks
themselves assert the child rows are actually gone, not just that the delete call didn't throw. The
referenced `Product` was separately confirmed to still exist after its referencing `CareIntelligence`
was deleted, before being cleaned up by its own explicit delete call.

## Coverage against this module's own Testing Requirements

| Requirement | Verified? |
|---|---|
| Create Draft | ✅ live |
| Publish | ✅ live |
| Archive | ✅ live |
| Restore | ✅ live, including "does not touch the currently published version" specifically |
| Duplicate | ✅ live |
| Workflow validation | ✅ live (Zod, and the full transition-map) |
| Permission enforcement | ✅ live for the item-level and field-level Layer boundary; ⚠️ **not live-tested** for the STAFF/ADMIN role branches specifically (no session to test against — same limitation as every prior module) |
| Version history | ✅ live |
| Relationship integrity | ✅ live — valid references succeed, an invalid product id is rejected, no catalog data was duplicated onto the relation, and cascade behavior was verified as *reference-safe* (deleting a CareIntelligence item does not delete the Product it referenced) |
| Build validation / Prisma validation / TypeScript validation / Production build | ✅ all four, see table above |

## What was not tested, honestly

- `STAFF`/`ADMIN` RBAC branches against a real session.
- Real concurrent/racing publish calls (the transaction-based atomicity claim is architecturally
  reasoned, not load-tested — same disclosed limitation as Modules 1–3).
- The `escalationPriority`/`CarePriority` enum and the full `CareResolutionCondition` set were exercised
  with only a subset of their possible values in the test run (e.g. `URGENT` priority was never
  assigned) — the fields are typed and validated, just not exhaustively exercised.
