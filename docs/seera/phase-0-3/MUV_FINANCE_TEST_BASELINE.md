# MUV Finance Test Baseline

Database: isolated `TEST_DATABASE_URL` Neon endpoint, not application database. Worker/file/test concurrency: 1. CLI timeouts: test/hook 120s, teardown 60s.

## Wave 1 result

Command: `npx.cmd vitest run __tests__/enterprise-finance/wave1-foundation.integration.test.ts --maxWorkers=1 --no-file-parallelism --maxConcurrency=1 --testTimeout=120000 --hookTimeout=120000 --teardownTimeout=60000 --reporter=verbose`

Duration 140.67s; 17 passed, 1 failed, 0 skipped. Posting, permission, organisation guard, optimistic concurrency, configuration lifecycle, most account rules and fiscal-period controls passed.

The hierarchy-cycle test failed with Prisma P2028. The interactive transaction kept its 5-second application timeout, while 48.531 seconds elapsed before the audit `SalesTimelineEvent` write. This is a precise remote execution blocker. Increasing Vitest timeout cannot repair an expired transaction. Changing the application transaction timeout or transaction contents would affect production finance/governance and is forbidden without separate approval.

## Remaining finance files

The six Stage A/B files retain Phase 0.2 evidence: setup hooks timed out and 74 tests were skipped in the grouped run. They were not individually completed in Phase 0.3 after Wave 1 established the production-affecting transaction blocker. Finance integrity baseline is therefore incomplete and Phase 1 gate remains closed.

