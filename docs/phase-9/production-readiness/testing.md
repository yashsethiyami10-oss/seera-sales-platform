# Testing

No automated test runner exists in this repository (unchanged finding from every prior module).

## Build verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Failed on first attempt (2 real type errors — see below), clean after fixing |
| `npm run build` | Clean production build, 72 routes, first attempt after the `tsc` fix |

### A real type error, caught and fixed

`tsc` caught a genuine bug: `security-validator.ts` used `[...source.matchAll(/export async function
(\w+)\(/g)].map((m) => m[1])` to extract exported function names — TypeScript correctly types a regex
capture group as `string | undefined` (a pattern *could* fail to capture), so the resulting `string[]`
was actually `(string | undefined)[]`, rejected everywhere a bare `string` was required downstream. Fixed
by adding `.filter((n): n is string => !!n)` after the `.map()` in both call sites
(`checkStaffActions()`, `checkTrustedInputValidation()`) — a real fix, not a suppression.

## Manual verification script

`npx tsx`, calling every `lib/production/*` function directly. Unlike Modules 6 and 8, **nothing in this
module depends on next-auth's `auth()`/`headers()`** — every function was exercised fully end-to-end, no
skips, no request-scope limitation. **43 checks, 43 passed, 0 failed**, after one self-caught bug was
fixed (see below):

```
PASS  health: reports exactly 5 layers
PASS  health: KNOWLEDGE layer healthy (real DB check)
PASS  health: RETRIEVAL layer healthy (smoke logic check)
PASS  health: INTELLIGENCE layer healthy (smoke logic check)
PASS  health: EXECUTION layer healthy (full pipeline smoke run)
PASS  health: EXPERIENCE layer healthy (real DB check)
PASS  health: overallStatus reflects worst layer
PASS  version: architectureVersion is MUV AI v1.0
PASS  version: exactly 9 module versions registered
PASS  version: buildVersion read from package.json
PASS  version: deploymentTimestamp is a valid ISO string
PASS  flags: FUTURE_CHANNELS defaults to false
PASS  flags: EXPERIENCE_PLATFORM defaults to true
PASS  flags: updateFeatureFlags applies the override
PASS  flags: override persists across subsequent getFeatureFlags() calls (in-memory)
PASS  diagnostics: exactly 5 checks
PASS  diagnostics: overallStatus PASS
PASS  diagnostics: MODULES_LOADED passed
PASS  diagnostics: VERSION check passed (9 modules registered)
PASS  security: exactly 7 checks
PASS  security: overallStatus PASS
PASS  security: STAFF_ACTIONS passed (Module 6/7 actions gated)
PASS  security: CUSTOMER_ACTIONS passed (Module 8 RBAC split intact)
PASS  security: SAFETY_ENFORCEMENT passed (Module 7 short-circuit intact)
PASS  security: RESPONSE_LEAKAGE passed (Module 8 safety boundary intact)
PASS  security: TRUSTED_INPUT_VALIDATION passed
PASS  performance: pipelineLatencyMs is a positive number
PASS  performance: withinThresholds true for a synchronous, DB-free pipeline
PASS  performance: responseSizeBytes > 0
PASS  performance: executionStages reflects the 5-stage normal pipeline
PASS  performance: memoryUsageMb is a positive number
PASS  deployment: exactly 6 checks
PASS  deployment: REQUIRED_VARIABLES passed (DATABASE_URL/AUTH_SECRET set)
PASS  deployment: REQUIRED_SERVICES passed (DB reachable)
PASS  deployment: DATABASE_READINESS passed (schema applied)
PASS  deployment: ready reflects all checks passing
PASS  governance: 8 frozen modules (Modules 1-8)
PASS  governance: Module 9 not yet in approvedModules
PASS  governance: Module 7 shows CORRECTED_AND_APPROVED
PASS  governance: deploymentStatus matches deployment validator's own ready flag
PASS  audit: moduleStatus marks Module 9 as IN_PROGRESS
PASS  audit: moduleStatus marks Module 1 as FROZEN
PASS  audit: bundles health/security/performance/governance/version/readiness

43 passed, 0 failed
```

Script deleted after use (`verify-module9.ts`).

## A self-caught bug in the Security Validator itself

The first run of this script surfaced a real failure: `security: RESPONSE_LEAKAGE` failed, reporting that
`lib/experience/response-model.ts` references `safety.reasons`, `.safetyNotes`, `.violations`,
`responseBlueprint.restrictions`, and `responseBlueprint.escalationNotice`. Investigation showed this was
a bug in the *check*, not in `response-model.ts`: that file's own doc comment *accurately explains, in
prose,* exactly which internal fields it deliberately avoids reading — which means the literal substrings
the check searched for legitimately appear there, as documentation, not as code. `checkResponseLeakage()`
was fixed to strip `/* */` and `//` comments before scanning (`stripComments()`); re-run, clean. Recorded
here rather than silently fixed, per this project's transparency standard — see also
[security.md](./security.md). Module 8's own test suite (32 checks, including 5 adversarial leakage
checks) had already independently proven the real rendering code was clean; this was a false positive in
a *new* check, not a rediscovered real issue.

## Mutation scope confirmed by grep

`grep -E "\.(create|update|delete|upsert)\(" lib/production/*.ts` — zero matches. The only mutable state
in this module is `feature-flags.ts`'s in-memory `Map` (`runtimeOverrides`), never a database write.

## Coverage against this module's own Testing requirements

| Requirement | Verified? |
|---|---|
| Health monitor | ✅ live, all 5 layers |
| Diagnostics | ✅ live, all 5 checks |
| Security validation | ✅ live, all 7 checks, including one self-caught and fixed bug |
| Performance validation | ✅ live, single smoke-timing pass |
| Deployment validation | ✅ live, all 6 checks |
| Governance | ✅ live |
| Audit generation | ✅ live, confirmed bundling of all 6 sub-reports |
| TypeScript | ✅ clean after fixing 2 real errors |
| Production Build | ✅ clean, 72 routes |
| Read-only behavior | ✅ by direct grep — the sole exception (in-memory flag override) is disclosed, not hidden |

## What was not tested, honestly

- **The 8 Server Actions in `actions/production.ts` were not called directly** — the same reason as every
  prior module: `requireStaff()`/`requireAdmin()` need a request context. Their underlying
  `lib/production/*` functions (all the real logic) were tested directly instead; the actions were
  confirmed via `tsc`/`build` to type-check and compile, and read end-to-end to confirm correct wiring and
  the intended `requireStaff()`/`requireAdmin()` split.
- **Health/Diagnostics/Deployment checks were only run against this one development environment** — a
  genuinely different environment (different env vars configured, different DB state) could exercise
  branches (missing vars, unreachable DB, schema not applied) this pass didn't hit, since this
  environment happened to have everything correctly configured. The failure-path logic itself was
  confirmed correct by code reading, not by inducing a real failure.
- **Security Validator's static checks are heuristic, not a full parser** — `sliceFunctionBody()`'s
  "next `export async function`" boundary works for this codebase's consistent style but would misread a
  file that broke that convention. See [known-limitations.md](./known-limitations.md).
