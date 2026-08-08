# Session Management & Experience Orchestration

## Session lifecycle

`lib/experience/session-manager.ts`. A session is identified by its `id` (cuid), created via
`createSession(channel, customerId)` — `customerId` is resolved server-side from the real auth session
(if any) via the exact guest/logged-in pattern `actions/orders.ts` already established
(`const session = await auth(); if (session?.user) { ... }` else guest/anonymous), never trusted from
client input.

- **Status**: `ACTIVE` → `CLOSED` (via `closeSession()`) or `ACTIVE` → `EXPIRED` (lazily, on read).
- **Expiry**: `getSession()` checks whether an `ACTIVE` session's `lastActivityAt` is older than a fixed
  30-minute inactivity TTL; if so, it updates the row to `EXPIRED` before returning it. No background
  job/cron exists in this project, so lazy-on-read is the only expiry mechanism — consistent with there
  being no scheduled-task infrastructure anywhere else in the codebase.
- **Memory**: `touchSession(sessionId, memoryItems)` persists the accumulated `MemoryItem[]` (Module 6's
  own type) after each turn, capped at the most recent 20 items (`MAX_SESSION_MEMORY_ITEMS`) to bound
  growth for a long-running conversation.

## The Frozen Flow, implemented

`lib/experience/experience-orchestrator.ts`'s `orchestrateExperience()` implements exactly:

```
Customer Input → Experience Request → Modules 5-7 → Execution Package →
Experience Orchestrator → Channel Adapter → Experience Response
```

1. `getSession(request.sessionId)` — resolves the session; throws `SESSION_INACTIVE` (410) if not
   `ACTIVE` (covers both `CLOSED` and lazily-detected `EXPIRED`).
2. Calls Module 6's `buildIntelligence()` directly (not its Server Action — see
   [architecture.md](./architecture.md)), passing the session's accumulated `memoryItems` as Module 6's
   own `memory` input, and **`includeReasoningTrace: false`** — Module 6's reasoning trace is explicitly
   staff-only ("never expose internal reasoning"); a customer-facing orchestration path must never
   request it.
3. Calls Module 7's `executePipeline()` directly, with `clearanceLayer` hardcoded to `"PUBLIC"` — never
   configurable from this function's caller (see [architecture.md](./architecture.md)).
4. Calls `buildExperienceResponse()` (the Response Model — see
   [safe-rendering.md](./safe-rendering.md)) to produce the channel-neutral `ExperienceResponse`.
5. Appends this turn as a new `CONVERSATION`-type `MemoryItem` and persists the updated (capped) memory
   via `touchSession()`.
6. Calls `adaptForWebsite()` (the Channel Adapter) and returns its output — the final `Experience
   Response` per the Frozen Flow diagram.

## What this function deliberately never does

It never inspects `decisionPackage` or `executionPackage` fields itself to make a judgment call — every
field is passed straight through to `buildExperienceResponse()`, which is the one place in this module
responsible for turning them into safe content. This satisfies "must not alter decisions or bypass Module
7 safety" structurally: there is no branch in the orchestrator itself that could suppress or override
what Module 7 decided.
