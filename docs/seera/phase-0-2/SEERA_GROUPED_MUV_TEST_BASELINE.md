# Grouped MUV Test Baseline

Environment: `.env.local` `TEST_DATABASE_URL`, structurally distinct from application `DATABASE_URL`; safety guard verified in Phase 0.1. Times are local IST on 2026-08-07. Temporary logs contained no secrets.

| Group | Included files | Start / duration | Result counts | Timeout / last evidence | Classification |
|---|---|---|---|---|---|
| Reporter diagnostic | First seven-file command | ~04:49 / 5.6s | No tests | `--reporter=basic` unsupported by Vitest 4.1.10 | FAIL — TEST INFRASTRUCTURE (command only) |
| Static quotation UI | `sales/quotation-builder-field-labels.test.ts` | 04:52:13 / 0.699s | 1 file; 18 pass | None; clean summary/teardown | PASS |
| Static, auth, integrity | admin editor; enterprise phase2 unit; enterprise UI; institutional | 04:52:38 / 82.52s | 3 files pass, 3 fail; 55 pass, 4 fail | Last: institutional valid-GST flow; P2024 and 5/15s timeouts | FAIL — TEST INFRASTRUCTURE |
| Enterprise finance | 7 finance integration files | 04:54:54 / 155.52s | 7 files fail; 6 pass, 12 fail, 74 skipped | Six `beforeAll` hooks timeout at 10s; wave1 P2024/test timeouts | FAIL — TEST INFRASTRUCTURE |
| MUV AI core | 9 AI files excluding torture | 04:58:23 / 57.69s | 9 files; 85 pass | None | PASS |
| Commerce/catalog/knowledge | 8 admin/commerce/knowledge/sales/storefront files | ~05:00 / 300s | No final counts | No completed test file printed after Vitest RUN | BLOCKED — EXECUTION LIMIT |
| MUV AI torture | Not rerun after core group | N/A | N/A | Prior full run depended on database/session setup | NOT APPLICABLE in remaining window |
| Founder/enterprise remaining | Founder OS and enterprise DB files not covered above | N/A | N/A | Baseline window consumed by bounded diagnosis | BLOCKED — EXECUTION LIMIT |

## Commands

Each group used `npm.cmd test -- <explicit files>` through `Start-Process`, separate stdout/stderr logs and 120–300 second process deadlines. The repository default reporter was used after the unsupported reporter attempt.

## Hanging/failing diagnosis

The first single static file proves Vitest can start and exit normally, so there is no universal open-handle defect. Database-heavy groups show Prisma `P2024`: connection limit 5, pool timeout 10 seconds. Tests retain default 5-second test and 10-second hook deadlines (some institutional tests use 15 seconds); remote Neon latency/pool contention consumes these budgets. Once setup hooks fail, whole files are skipped. The commerce group emitted no file completion, consistent with a long database-heavy first file or child-process/teardown behavior; no application assertion can be inferred.

Potential contributors inspected: shared singleton Prisma client is used by application code; test files create/cleanup many fixtures; Vitest file parallelism is disabled but intra-file DB work and Next/Auth imports still contend; remote providers were not evidenced in failing stacks; the concrete stack is Prisma authorization lookup. No MUV production logic or test safeguard was changed.

## Required remediation baseline

Run each DB integration file individually on a dedicated Neon test branch; record query/pool metrics; use a controlled test-only URL connection limit appropriate to the runner; establish test-only timeout policy based on measured p95; ensure every file disconnects any independently created Prisma client; terminate complete process trees in automation; then rerun grouped and full suites. Timeout increases alone are not proof.

