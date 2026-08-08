# MUV Grouped Regression Final Baseline

The current tree contains 48 `*.test.ts` files across 15 directories. Phase 0.2 inventoried 38; therefore totals below are executed-run totals, not a deduplicated complete-suite total. Re-runs and filtered diagnostics are shown separately and must not be summed as unique coverage.

| Group | Exact execution controls | Result | Classification |
|---|---|---|---|
| Static quotation | Explicit file, repository defaults | 18 passed; 0 failed/skipped; 0.699s | PASS |
| Static/auth/integrity Phase 0.2 | Six explicit files, sequential | 55 passed; 4 failed; 82.52s | FAIL — TEST INFRASTRUCTURE |
| Institutional Phase 0.3 | One file; worker/concurrency 1; 60s tests/hooks | 14 passed; 0 failed; 33.01s | PASS |
| Narrow authorization Phase 0.3 | One file; worker/concurrency 1; 60s; leak detection | 15 passed; 1 timed out; 116.16s | FAIL — TEST INFRASTRUCTURE |
| Narrow Founder filtered rerun | Same, one pattern | 1 passed, 15 skipped; 24.80s | PASS diagnostic; not group replacement |
| Product editor Phase 0.3 | One file; worker/concurrency 1; 60s; leak detection | 3 passed; 1 test + cleanup timed out; 130.61s | FAIL — TEST INFRASTRUCTURE |
| Finance Phase 0.2 | Seven files sequential | 6 passed; 12 failed/timeouts; 74 skipped; 155.52s | FAIL — TEST INFRASTRUCTURE |
| Finance Wave 1 Phase 0.3 | One file; worker/concurrency 1; 120s | 17 passed; 1 P2028 failed; 140.67s | FAIL — EXECUTION ENVIRONMENT |
| MUV AI core | Nine explicit files | 85 passed; 0 failed; 57.69s | PASS |
| Commerce/catalog/knowledge | Eight explicit files | No final summary by 300s | BLOCKED — EXECUTION ENVIRONMENT |
| Remaining current files | Not all executed after test inventory grew to 48 | No valid summary | BLOCKED — EXECUTION ENVIRONMENT |

Database identity: isolated Neon test endpoint, hostname distinct from application endpoint; credentials not recorded. Supported Vitest controls were confirmed from installed 4.1.10. No production URL or pool setting changed.

## Non-additive observed totals

For the principal non-filtered completed runs: at least 209 assertions passed (18 + 55 + 14 + 15 + 3 + 6 + 17 + 85), 19 failed/timed out across those executions, and 74 were skipped. These are observational execution totals with overlap between Phase 0.2 groups and Phase 0.3 reruns; they are not a unique-suite certification. Commerce and unexecuted current files have no counts.

