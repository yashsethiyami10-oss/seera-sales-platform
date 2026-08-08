# MUV Test-Only Changes Register

No repository test or test-configuration change was applied.

| File | Change | Evidence | Production Impact | Rollback |
|---|---|---|---|---|
| None | Command-level controls only: explicit files, `maxWorkers=1`, no file parallelism, `maxConcurrency=1`, bounded test/hook/teardown timeouts, verbose/leak reporter | Supported by Vitest 4.1.10 help; isolated runs distinguish contention from assertions | NONE | No repository rollback required |

A global timeout change was rejected because product update/cleanup still stall at 60 seconds and finance fails at Prisma’s interactive transaction boundary. A shared `$disconnect()` rewrite was not applied because production client behavior must remain unchanged and the evidence does not prove it is the primary cause.

