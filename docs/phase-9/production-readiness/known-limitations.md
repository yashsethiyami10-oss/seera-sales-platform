# Known Limitations

## Health/Diagnostic/Deployment checks are smoke tests, not full exercises

A `HEALTHY` layer or a `PASS`ed check confirms its cheap, deterministic entry point behaved as expected —
it does not re-run every branch of the module it's checking. Real depth-of-coverage for each of Modules
5–8 already exists in their own respective test suites (documented in their own `testing.md` files); this
module deliberately does not duplicate that, only re-confirms the surface is still reachable and correct
for one fixed input.

## Feature flag overrides are in-memory, single-instance

`updateFeatureFlags()` writes to a process-local `Map` — resets on deploy/restart, and does not
synchronize across multiple server instances. Identical, disclosed trade-off to `lib/rate-limit.ts`'s own
counters. A real multi-instance deployment needing persistent, shared flag state would need to swap this
for a real config service (e.g. Upstash Redis, or a database table) — not done here, since the module
prompt explicitly ruled out both "a remote feature service" and "new schema automatically."

## Version/Governance data is hand-maintained, not derived

`MODULE_VERSIONS` and `FOUNDER_APPROVAL_STATUS` are fixed constants that must be updated manually as
modules change or new ones are approved — there is no mechanism that automatically detects a module's
architecture changed (e.g. Module 7's own post-founder-review correction) and bumps its recorded version.
This is a deliberate scope boundary ("no automatic migrations," "no database redesign unless necessary"),
not an oversight, but means this registry can silently go stale if not updated alongside future module
work.

## `deploymentTimestamp` has no real source

No deployment pipeline exists in this project. Absent a `DEPLOYMENT_TIMESTAMP` env var, this field
reports the running process's own start time — a reasonable proxy, but not a genuine "when was this
deployed" signal. Always paired with `deploymentTimestampSource` so a caller can tell which kind of value
they received.

## Security Validator's static checks are heuristic

`sliceFunctionBody()` isolates a function's source by string position ("from this export to the next"),
not by actually parsing the AST. It works correctly for this codebase's consistent one-export-per-function
style, but would misattribute code if a file's structure changed significantly (e.g. two functions defined
inline in one export, or non-standard formatting). A more robust future version could use the TypeScript
Compiler API to parse real ASTs instead of string slicing — not done here, to avoid a new heavy dependency
for a self-check tool.

## Performance Validator only times Module 7

Module 5/6/8's own pipelines depend on database access and (for 6/8) a real request scope, which this
validator's design deliberately avoids depending on (see [architecture.md](./architecture.md)). Only
Module 7's Execution Core — fully synchronous, zero I/O — gets a genuine, direct timing measurement.
`moduleTimings` in `PerformanceReport` therefore has exactly one entry today, not five; the field is
shaped as an array specifically so a future version could add more entries (e.g. a DB round-trip timing
for Knowledge/Experience) without changing its type.

## No persisted audit/version history

Every report (`AuditReport`, `SystemHealthReport`, etc.) is computed fresh on each call and returned —
none is written anywhere. There is no way to compare "today's audit" against "last week's audit" without
an external system capturing each call's output. The module prompt explicitly deferred this decision
("if persistent audit/version tables are beneficial: document them only under Architecture
Recommendations") — see this report's own Section 11.

## No live production environment has exercised this module yet

Everything in this module was verified against the single development environment it was built in, which
happens to have all required configuration present and the database schema fully applied. The
failure-reporting paths (missing env var, unreachable DB, schema not applied) were confirmed correct by
code reading, not by inducing a genuine failure in a real environment.
