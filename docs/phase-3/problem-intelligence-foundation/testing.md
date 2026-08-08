# Testing

This repository has **no automated test runner** (`CLAUDE.md`, reconfirmed for this module: no
`jest`/`vitest`/`playwright` in `package.json`, no `tests/` directory). Nothing below is claimed as
automated coverage in a CI sense — it is direct verification against real tooling and the real database,
reported exactly as run.

## Build verification

| Command | Result |
|---|---|
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| `npx prisma db push --skip-generate` | `Your database is now in sync with your Prisma schema. Done in 615ms` |
| `npx prisma generate` | `✔ Generated Prisma Client (v5.22.0)` |
| `npx tsc --noEmit` | Exit code 0 — clean, zero errors, on the first run |
| `npm run build` | Clean production build, all existing routes plus this module's code compiled successfully |
| Existing lint (`npm run lint`) | Not run — `CLAUDE.md` and this project's own history note ESLint is not configured in this repository; not claiming a result for a command that doesn't apply |

## Manual verification script

Written as `test-prif-logic.tmp.ts`, run via `npx tsx`, importing the real Zod schemas from
`lib/validations/problem-intelligence.ts` (not a reimplementation) and executing directly against the
real PostgreSQL database using the same Prisma Client the application uses. Deleted after the run — no
test artifacts left in the repository. 31 checks, 31 passed, 0 failed:

```
PASS: Valid createProblemIntelligence payload parses
PASS: Invalid slug format rejected
PASS: Invalid symptom payload rejected
PASS: DRAFT -> PUBLISHED directly blocked
PASS: REVIEW -> PUBLISHED allowed
PASS: PUBLISHED -> ARCHIVED only
PASS: ARCHIVED terminal
PASS: Duplicate slug detectable before insert
PASS: Created PrIF item + v1 DRAFT
PASS: Cause confirmed by question (m2m connected)
PASS: Exclusion conflict detectable for productB before allowing a PRIMARY relationship
PASS: Override-justified relationship for an otherwise-excluded product created
PASS: Product data not duplicated onto relationship row
PASS: All 11 structured section types populated on v1
PASS: v1 published
PASS: Editing a PUBLISHED version would be blocked by loadEditableVersion
PASS: v2 cause reconnected to v2's own duplicated question (not v1's)
PASS: v1 content still byte-identical after v2 published (never overwritten)
PASS: v1 status now ARCHIVED (history preserved, not deleted)
PASS: Full version history preserved (2 versions)
PASS: Exactly one PUBLISHED version at a time
PASS: Exclusion rules not lost on the archived version during versioning
PASS: High-risk safety metadata retained on v1 (riskLevel MODERATE)
PASS: Retrieve current published version returns v2
PASS: Retrieve an older (v1) version by versionNumber
PASS: Public query returns our test PUBLIC item
PASS: Confidential item absent from Layer-PUBLIC query
PASS: Public projection excludes internalHandlingNotes/escalationReason
PASS: Invalid product reference rejected by FK constraint
PASS: Deleting a Product cascades its ProblemExclusionRule rows
PASS: Deleting ProblemIntelligence cascades all versions and child sections

31 passed, 0 failed
```

All test data (2 temporary products, 1 PUBLIC test item across 2 versions, 1 CONFIDENTIAL test item) was
deleted at the end of the script's run — confirmed by the cascade-delete checks themselves, which assert
the child rows are actually gone, not just that the delete call didn't throw.

## Coverage against the module's own Testing Requirements

| Requirement | Verified? |
|---|---|
| Create a valid PrIF draft | ✅ live |
| Reject invalid data | ✅ live (Zod, in-process) |
| Reject duplicate slug where prohibited | ✅ live (uniqueness detectable before insert; the actual `ConflictError` throw in `createProblemIntelligence` is type-checked but not exercised through a real action call — see below) |
| Add symptoms/causes/questions/mistakes/product relationships/exclusions/usage guidance/outcomes/prevention guidance/safety rules | ✅ live, all 11 child types populated on one version |
| Submit draft for review | ✅ live |
| Publish approved version | ✅ live |
| Prevent overwriting published version | ✅ live logic check (the exact guard `loadEditableVersion` uses) |
| Create a new draft from a published version | ✅ live, including the question→cause m2m reconnect specifically |
| Preserve full history | ✅ live |
| Retrieve the current published version | ✅ live |
| Retrieve an older version | ✅ live |
| Archive without deleting history | ✅ live |
| Prevent multiple current published versions | ✅ live |
| Public retrieval exposes only Layer A | ✅ live (item-level) + verified by inspection (field-level projection, see permissions.md) |
| Internal data is protected | ✅ verified by inspection of the actual `select` clause in `getPublishedProblemIntelligence` |
| Confidential data is restricted | ✅ live (absent from the public query) |
| Unauthorized status changes are rejected | ⚠️ **not live-tested** — requires a real authenticated session; the transition-map logic itself (which status changes are even legal) was verified, but the `STAFF`/`ADMIN` role branch was only type-checked, not exercised. Same disclosed limitation as Modules 1 and 2. |
| Valid product/PIF relationships succeed | ✅ live |
| Invalid references fail | ✅ live (FK constraint violation confirmed) |
| Product data is not duplicated | ✅ live |
| Cascade behavior is safe and intentional | ✅ live, both a leaf cascade (Product deletion → its exclusion rules) and a full-tree cascade (ProblemIntelligence deletion → every version and every child section) |
| High-risk/critical records retain escalation metadata | ✅ live |
| Prohibited recommendations represented correctly | ⚠️ field exists and is typed/validated (`prohibitedRecommendation: Boolean`); not exercised with a `true` value in the test run — a straightforward gap to close, not a design uncertainty |
| Exclusion rules not lost during versioning | ✅ live |

## What was not tested, honestly

- The `STAFF`/`ADMIN` RBAC branches inside every action (as opposed to the business-logic checks they
  guard) — no session to test against without a test runner.
- `addProblemEvidenceSource` — doesn't exist (see [known-limitations.md](./known-limitations.md)), so
  nothing to test.
- `prohibitedRecommendation: true` specifically, as a value (see table above).
- Real concurrent/racing publish calls — the transaction-based atomicity claim in
  [lifecycle.md](./lifecycle.md) is architecturally reasoned, not load-tested.
