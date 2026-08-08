# Regression Report

Final verified chain:

- Phase 1 explicit static safety script: 12/12 checks passed.
- Phase 1 static/hardening tests: 29/29 passed.
- Phase 1 guarded TEST integration: 27/27 passed.
- Phase 2-5 isolated acceptance/security: 24/24 passed.
- Phase 2-5 guarded TEST integration: 6/6 passed after the active-workday concurrency correction.
- Unique automated Vitest tests: 86/86 passed (29 + 27 + 24 + 6).
- Additional static safety assertions: 12/12 passed.
- Prisma validate and generate: passed.
- TypeScript `--noEmit`: passed.
- Next.js production build: passed (14 routes/pages generated or compiled).
- Migration destructive-SQL scan: no DROP/TRUNCATE/DELETE in migrations 003-007.
- Production DB writes: none.
- MUV baseline/runtime-dependency verification: passed.

One initial Phase 1 integration setup hook exceeded its 90-second Neon allowance; no assertion failed. The unchanged 27-test suite passed after increasing only hook timeout to 180 seconds. One cross-phase rerun exposed an expired interactive transaction in Start Day; migration 006 replaced it with an atomic partial unique index and the 6/6 integration suite then passed.
