# MUV Test Infrastructure Root Cause

## Evidence summary

| Test Group/File | Prisma Clients Observed | Concurrency | Cleanup Pattern | P2024/P2028 Evidence | Likely Cause |
|---|---:|---:|---|---|---|
| Global setup/application tests | One application singleton per Vitest worker via `lib/prisma.ts` | `fileParallelism:false`; CLI `maxWorkers=1`, `maxConcurrency=1` in Phase 0.3 | Per-file fixture cleanup; some files call singleton `$disconnect()` | Pool limit 5/timeout 10 seen in Phase 0.2 | Remote latency plus long/unfinished queries; disconnecting shared singleton is inconsistent across files |
| Product editor | One singleton | One file/worker/test | Restores real test-DB product in `afterAll`, then disconnects | Update and cleanup exceed 60s; async leak points to `productContent.upsert` | Query/row contention or DB latency; not a short Vitest timeout |
| Narrow permission | One singleton | One file/worker; sequential tests | Flag/user cleanup in `afterAll` | Full file: Founder lookup hangs; isolated positive control passes 13.98s | Cumulative remote DB/pool contention; application assertion is sound |
| Institutional | One singleton | One file/worker; ordered UAT | In-file cleanup | Full isolated file 14/14 pass in 33.01s | Earlier group timeout was contention; 5/15s limits too short for measured 5.9s operations |
| Finance Wave 1 | One singleton | One file/worker | Immutable finance records plus flag cleanup | P2028: 5s interactive transaction expired after 48.531s | Remote transaction/query latency; Vitest timeout is not root fix |
| Finance group | One worker but seven files sequentially | DB work and setup transactions | Per-file hooks | P2024 and six 10s hook timeouts | Remote pool/fixture pressure and short hooks |

## Exact cause statement

There is not one duplicate-client explosion. The application singleton limits each worker to one PrismaClient, and Phase 0.3 used one worker. Failures arise from remote Neon latency/contention interacting with a five-connection URL pool, 10-second pool acquisition, short Vitest hooks/tests, and a 5-second Prisma interactive-transaction timeout. Certain files also mutate shared singleton records or a shared product, making prior killed/overlapping runs capable of contention. The current suite’s per-file `$disconnect()` practice is inconsistent with a shared global client and can add lifecycle variability, but no universal teardown hang exists because static and MUV AI groups exit normally.

## Safety decision

No pool parameter, `DATABASE_URL`, application Prisma client, transaction timeout or production service was changed. A global test-timeout increase would mask product/transaction stalls and was rejected. Supported command controls were verified from Vitest 4.1.10 and used only at execution time.

