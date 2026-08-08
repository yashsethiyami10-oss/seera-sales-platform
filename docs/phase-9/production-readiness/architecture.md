# Architecture

## Position in the platform

```
Module 5  Knowledge Retrieval Core
Module 6  Intelligence Core
Module 7  Execution Core
Module 8  Experience Platform
Module 9  Production Readiness & AI Governance    <- this module: observes 1-8, changes nothing
```

## Why nothing here calls Module 6's `buildIntelligence()` or Module 8's `orchestrateExperience()`

Both depend on a real Next.js request scope (next-auth's `auth()` → `headers()`) — a limitation already
documented in Modules 6 and 8's own `testing.md` files. Health/diagnostic checks need to run reliably from
any context, including a standalone script or a future health-check endpoint with no guaranteed request
scope. So each layer gets the cheapest check that's still genuinely meaningful without that dependency:

| Layer | What's actually checked | Why |
|---|---|---|
| Knowledge | `prisma.knowledgeItem.count()` | Real DB round-trip, no request scope needed |
| Retrieval | `layerAllowed()` with a fixed clearance object | Pure permission logic, no DB, no request scope |
| Intelligence | `evaluatePriority([], {})` | Pure engine logic, no DB, no request scope |
| Execution | `executePipeline()` against a fixed smoke `DecisionPackage` | Fully synchronous, zero I/O — Module 7's whole design already makes this possible (see Module 7's own `architecture.md`) |
| Experience | `prisma.experienceSession.count()` | Real DB round-trip, no request scope needed |

This is a genuine, disclosed trade-off: these are *smoke tests*, not full pipeline exercises. A layer
reporting `HEALTHY` means "its cheap, deterministic entry point behaves as expected," not "every code path
in that module was just exercised." See [known-limitations.md](./known-limitations.md).

## `buildSmokeDecisionPackage()` is shared, not duplicated

`health-monitor.ts` exports it; `performance-validator.ts` imports and reuses the exact same fixture
rather than defining its own — "do not create duplicate abstractions" applied literally.

## Why the Security Validator reads source files instead of running code

"No penetration testing" rules out any live-attack approach. What's left that's still genuinely useful:
static analysis over this codebase's own committed source — the same `grep`-based verification technique
every module's own `testing.md` has used to confirm properties like "read-only enforcement" throughout this
project, just packaged as a callable, repeatable check instead of a one-off manual command. Concretely,
`security-validator.ts` reads `actions/intelligence.ts`, `actions/execution.ts`, `actions/experience.ts`,
`lib/rbac.ts`, `lib/execution/execution-orchestrator.ts`, and `lib/experience/response-model.ts` as plain
text and checks for structural properties (every export calls `requireStaff()`, the safety short-circuit
is present, no internal field names appear outside comments). See [security.md](./security.md) for the
full check list, and note the one self-caught bug in [testing.md](./testing.md) — the first version of the
`RESPONSE_LEAKAGE` check flagged `response-model.ts`'s own accurate doc comment as a false positive,
fixed by stripping comments before scanning.

## Why Feature Flags use an in-memory override, not a new table

The module prompt is explicit: *"Database: Prefer computation over storage. Do not introduce new schema
automatically."* `updateFeatureFlags()` needs some mutable state to be meaningful at all — env vars can't
be changed at runtime by a Server Action. The only way to satisfy both constraints is the exact pattern
`lib/rate-limit.ts` already established in this codebase for comparable in-process state: a module-level
`Map`, single-instance, resets on deploy/restart, documented as such. This is not a workaround; it's the
same trade-off this project already made once and accepted.

## Why Governance/Version data is hand-maintained constants, not derived

"No automatic migrations" (Version Registry) and "no database redesign unless necessary" (Governance
Manager) both point the same direction: `MODULE_VERSIONS` and `FOUNDER_APPROVAL_STATUS` are fixed,
hand-maintained records of this project's own actual history (e.g. Module 7 is recorded as
`CORRECTED_AND_APPROVED`, reflecting the real founder-review correction that happened), not something
computed by inspecting git history or a database (this checkout has no `.git`, and no approval-workflow
table exists or was requested). Updating them is a manual step alongside a future module's own delivery,
the same way `SCHEMA_VERSION` is bumped manually alongside a real schema change.

## File structure

`lib/production/` (10 files, exactly as recommended, no monolithic file): `types.ts`,
`health-monitor.ts`, `version-registry.ts`, `feature-flags.ts`, `diagnostics.ts`,
`security-validator.ts`, `performance-validator.ts`, `deployment-validator.ts`, `audit-builder.ts`,
`governance-manager.ts`. Plus `lib/validations/production.ts` and `actions/production.ts`.

## Why Module 9's Server Actions take no input (mostly)

Every prior module's actions followed a uniform `functionName(input: unknown)` signature. The Module 9
prompt itself writes the required actions with empty parens — `getSystemHealth()`, `runDiagnostics()`,
etc. — a deliberate, meaningful difference: these are operational status queries with nothing for a
caller to supply, not computations over caller-provided domain objects. Only `updateFeatureFlags(input)`
takes real input, and is validated through Zod exactly like every other module's mutating actions.
