# Memory Resolver

`lib/intelligence/memory-resolver.ts` — `resolveMemory(memory, clearance)`.

## "Do NOT implement long-term storage. Consume only available memory."

This is the literal design of the file: it never reads from or writes to a database. It takes whatever
`MemoryItem[]` the caller supplies in the request (today, in practice, always `[]` or `undefined` — no
surface yet populates real conversation history) and filters it. A future chat/session surface (likely
part of Module 7 or later) owns actually accumulating and persisting memory; this engine only validates
and filters what it's handed.

## Memory types

`CONVERSATION`, `SESSION`, `PERSISTENT` — all three exist in `MemoryItemType`, satisfying the module
prompt's "Conversation Context / Session Memory / Future Persistent Memory" requirement as a type-level
distinction. There is no code path that fetches `PERSISTENT` memory from anywhere; an empty `memory: []`
is the correct default today, and is expected to remain correct until a later module adds real
persistence.

## Filtering rules

1. **Expiration** — any item whose `expiresAt` is in the past is excluded (`Memory Expiration`
   requirement).
2. **Memory Permission** — any item whose `layer` exceeds the caller's resolved clearance is excluded,
   via `layerAllowed()` (Module 5's permission function, reused unmodified — not reimplemented here).

Both exclusions accumulate into `excludedCount` and a human-readable `excludedReasons` array
(`"N item(s) excluded — expired"`, `"N item(s) excluded — exceeded caller's permission layer"`).

## Memory Confidence

`overallConfidenceFor()` computes one `ConfidenceLevel` for the whole resolved set:

- Empty set → `LOW`.
- ≥2 items, all individually `HIGH` confidence → `HIGH`.
- All items `LOW` confidence or missing a confidence value → `LOW`.
- Otherwise → `MODERATE`.

This is a coarse, conservative aggregate — a single high-confidence item alongside nothing else does not
earn `HIGH` overall; the module prompt's "never manufacture confidence" spirit (stated explicitly for
the Confidence Engine, applied here too) means a lone data point stays `MODERATE` at best.

## Where clearance comes from

`resolveMemory()` takes a `CallerClearance` as a parameter rather than resolving it itself — the
orchestrator passes through the same clearance Module 5's retrieval pipeline already resolved in stage 1,
so clearance is derived exactly once per `buildIntelligence()` call, not twice.
