# AI Health Monitor

`lib/production/health-monitor.ts` — `getSystemHealth()`.

## The 5 layers

`KNOWLEDGE`, `RETRIEVAL`, `INTELLIGENCE`, `EXECUTION`, `EXPERIENCE` — exactly the 5 named in the module
prompt. Each check returns a `LayerHealth` — `{ layer, status, detail, checkedAt }` — where `status` is
one of 3 fixed values: `HEALTHY`, `DEGRADED` (responded, but not as expected), `UNAVAILABLE` (threw or the
DB round-trip failed).

## What each check actually does

| Layer | Check | Healthy when |
|---|---|---|
| Knowledge | `prisma.knowledgeItem.count()` | The query succeeds (no throw) |
| Retrieval | `layerAllowed("PUBLIC", clearance)` and `layerAllowed("CONFIDENTIAL", clearance)` for a fixed `ANONYMOUS`/`PUBLIC` clearance | First returns `true`, second returns `false` |
| Intelligence | `evaluatePriority([], {})` | Returns `category: "GENERAL_INQUIRY"` (Priority Engine's own documented default for no signal — see Module 6's `priority.md`) |
| Execution | `executePipeline({ decisionPackage: <smoke fixture>, clearanceLayer: "PUBLIC" })` | Returns `executionStatus: "EXECUTED"` |
| Experience | `prisma.experienceSession.count()` | The query succeeds (no throw) |

## `overallStatus`

The worst status across all 5 layers — `UNAVAILABLE` if any layer is `UNAVAILABLE`, else `DEGRADED` if
any is `DEGRADED`, else `HEALTHY`. A single broken layer is never masked by 4 healthy ones.

## What "deterministic" means here, precisely

Every check uses a fixed input and asserts a fixed expected output — no randomness, no external network
call, no dependency on what's actually in the database beyond "the table is queryable." Running
`getSystemHealth()` twice in a row against an unchanged codebase and database produces the same result
both times.

## What this is not

Not a full pipeline exercise. A `HEALTHY` Execution layer means "the Execution Core's full 5-stage
pipeline runs correctly against one benign fixture" — it does not mean every Safety/Policy/Action branch
was just exercised (that's what Module 7's own, much larger test suite already did once, at delivery
time). See [known-limitations.md](./known-limitations.md).
