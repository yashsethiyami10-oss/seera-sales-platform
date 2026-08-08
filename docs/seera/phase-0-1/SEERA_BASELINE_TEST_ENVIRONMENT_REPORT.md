# Seera Baseline Test Environment Report

Reviewed: 2026-08-07. Secrets were not printed; only host/database metadata is recorded.

## Environment and isolation

Prisma loads `DATABASE_URL` from `.env` for CLI/application operations. Next.js also sees `.env.local`. Vitest uses `__tests__/muv-ai/test-setup.ts`, which resolves ambient `TEST_DATABASE_URL` then `.env.local`, never falls back to `DATABASE_URL`, parses both targets, rejects identical values and rejects the same normalized endpoint before setting `process.env.DATABASE_URL` to the isolated test URL.

The configured application and test endpoints have different Neon hostnames. Both database names are `neondb`, but host separation makes them distinct endpoints. Direct DNS/TCP checks with approved network access resolved both hosts and reached TCP 5432. No test was redirected to the application database and no guard was weakened.

## Failure investigation

The Phase 0 failures were environment-related: sandboxed execution could not reach the test Neon endpoint. With approved external network access, DNS/TCP connectivity succeeded. The full serial suite then remained active for an extended period without a completion summary and was terminated after the bounded audit attempt; this is not a pass and does not establish a code failure. `vitest.config.ts` intentionally sets `fileParallelism: false` because integration files mutate shared test singleton rows, increasing duration.

## Command results

| Command | Result | Evidence/classification |
|---|---|---|
| `npx.cmd prisma format` | PASS | Schema formatted; no business/schema design change introduced |
| `npx.cmd prisma validate` | PASS | “schema ... is valid”; environment loaded from `.env` |
| `npx.cmd prisma generate` | PASS | Prisma Client v5.22.0 generated |
| `npx.cmd prisma migrate status` | PASS | Exit 0 with approved network access; read-only status check |
| `npx.cmd tsc --noEmit` | PASS | Exit 0 |
| `npm.cmd test` | BLOCKED — execution duration | Isolated test endpoint guard verified; network reachable; full serial run did not yield final suite counts before audit termination |
| `npm.cmd run build` | BLOCKED — execution duration | With network access, command exceeded 300 seconds without a final result; no pass claimed |

## Remediation and remaining dependencies

Remediation performed: used Windows `.cmd` launchers to avoid PowerShell script policy; verified safe environment resolution; obtained approval for external database connectivity; reran database-dependent commands without changing URLs. Remaining dependencies are Neon availability/latency and a reliable bounded strategy for the large serial integration suite/build page-data phase. Do not point tests at production. A future accepted baseline should run in CI or a controlled local environment with captured reporter output, per-file timing and a dedicated isolated test branch/database.

## Suite status

No authoritative passed/failed suite count is available from the final run, so none is claimed. Earlier sandbox run failures were connectivity cascades, not evidence of product defects. Baseline database isolation is verified structurally; baseline database-backed test success remains open and requires explicit Founder acceptance or a completed run.

