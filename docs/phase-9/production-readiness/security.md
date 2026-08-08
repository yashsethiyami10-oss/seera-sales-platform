# Security Validator

`lib/production/security-validator.ts` — `runSecurityValidation()`.

## "No penetration testing."

Every one of the 7 checks below is static analysis over this codebase's own committed source text —
`fs.readFileSync` plus string/regex matching, never a live request against a running server, never an
attempted exploit.

## The 7 fixed check areas

| Area | What's checked |
|---|---|
| `AUTHENTICATION_BOUNDARIES` | `requireStaff`/`requireAdmin`/`requireCustomer`/`requireUser` (Module 1's `lib/rbac.ts`) are all present and callable |
| `STAFF_ACTIONS` | Every exported action in `actions/intelligence.ts` and `actions/execution.ts` calls `requireStaff()` |
| `CUSTOMER_ACTIONS` | `actions/experience.ts`'s 5 customer-facing actions do *not* call a staff guard; its 3 staff-facing actions *do* call `requireStaff()` |
| `PERMISSION_INTEGRITY` | The 3 role literals (`ADMIN`, `STAFF`, `CUSTOMER`) all appear in `lib/rbac.ts` |
| `SAFETY_ENFORCEMENT` | `lib/execution/execution-orchestrator.ts` still contains the `BLOCKED`/`RESTRICTED` short-circuit check and calls `buildSafetyShortCircuitPackage` — a regression check for Module 7's founder-corrected behavior |
| `RESPONSE_LEAKAGE` | `lib/experience/response-model.ts`'s *code* (comments stripped first) never references `safety.reasons`, `.safetyNotes`, `.violations`, `responseBlueprint.restrictions`/`.escalationNotice`, or `blueprint.intent` — a regression check for Module 8's tested safety boundary |
| `TRUSTED_INPUT_VALIDATION` | Every action with caller-supplied input (`actions/intelligence.ts`, `actions/execution.ts`, `actions/experience.ts` uniformly; `updateFeatureFlags` in `actions/production.ts` by name) calls `.parse(` on it |

## How function bodies are isolated

`sliceFunctionBody(source, name)` extracts the text from `export async function NAME(` up to the next
top-level `export async function` (or end of file) — sufficient for this codebase's consistent
one-function-per-export style. This is a heuristic slice, not a real parser; see
[known-limitations.md](./known-limitations.md).

## A self-caught bug: comments count as code, until they don't

The first version of `checkResponseLeakage()` searched the raw file text, including comments.
`response-model.ts`'s own doc comment *accurately explains* which fields it avoids reading — which means
it contains the literal forbidden substrings (`safety.reasons`, `.safetyNotes`, etc.) as prose, not as
code. The check flagged this as a false positive. Fixed by stripping `/* */` and `//` comments
(`stripComments()`) before scanning — a deliberately code-only check now. See
[testing.md](./testing.md) for the full before/after. This was a bug in the validator's own precision,
never a real leak — Module 8's own test suite had already proven the actual rendering logic clean.

## `overallStatus`

`PASS` if all 7 pass. `FAIL` if `SAFETY_ENFORCEMENT` or `RESPONSE_LEAKAGE` specifically fail (the two
checks tied to a previously-proven safety guarantee regressing). `WARN` for any other combination of
failures.
