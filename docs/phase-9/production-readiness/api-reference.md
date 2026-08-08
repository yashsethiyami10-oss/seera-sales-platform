# API Reference

All 8 actions live in `actions/production.ts`, all `"use server"`, all staff-or-higher-gated (no
ungated tier — this is operational/founder tooling, never customer-facing), and all return either
`{ success: true, data: {...} }` or the standard `toErrorResponse(err)` shape.

## `requireStaff()`-gated

### `getSystemHealth()`
No input. Output: `{ health: SystemHealthReport }` — see [health.md](./health.md).

### `runDiagnostics()`
No input. Output: `{ diagnostics: DiagnosticsReport }` — 5 checks: `MODULES_LOADED`, `DEPENDENCIES`,
`CONFIGURATION`, `VERSION`, `REFERENCES`.

### `getVersionRegistry()`
No input. Output: `{ version: VersionRegistry }` — see [versioning.md](./versioning.md).

### `getFeatureFlags()`
No input. Output: `{ flags: FeatureFlags }` — see [feature-flags.md](./feature-flags.md).

## `requireAdmin()`-gated

### `validateDeployment()`
No input. Output: `{ deployment: DeploymentReadinessReport }` — see [deployment.md](./deployment.md).

### `generateAudit()`
No input. Output: `{ audit: AuditReport }` — bundles health, security, performance, governance, version,
and readiness into one report. See [governance.md](./governance.md).

### `updateFeatureFlags(input)`
Input: `{ EXPERIENCE_PLATFORM?, FOUNDER_REVIEW?, ANALYTICS?, FEEDBACK?, FUTURE_CHANNELS? }` (all
`boolean`, at least one required, unknown keys rejected). Output: `{ flags: FeatureFlags }` — the full
resulting flag set. The one mutating action in this module (in-memory only — see
[feature-flags.md](./feature-flags.md)).

### `getGovernanceStatus()`
No input. Output: `{ governance: GovernanceStatus }` — see [governance.md](./governance.md).

## Performance Validator — not exposed as its own action

`runPerformanceValidation()` (`lib/production/performance-validator.ts`) is called internally by
`generateAudit()` — it was not given its own top-level Server Action, since the module prompt's own
required action list does not name one for it separately (unlike Health/Diagnostics/Deployment/
Governance/Version/Flags, each of which the prompt explicitly names an action for). Its `PerformanceReport`
is reachable via `generateAudit()`'s `data.audit.performance` field.

## Auth summary

| Action | Auth |
|---|---|
| `getSystemHealth` | `requireStaff()` |
| `runDiagnostics` | `requireStaff()` |
| `getVersionRegistry` | `requireStaff()` |
| `getFeatureFlags` | `requireStaff()` |
| `validateDeployment` | `requireAdmin()` |
| `generateAudit` | `requireAdmin()` |
| `updateFeatureFlags` | `requireAdmin()` |
| `getGovernanceStatus` | `requireAdmin()` |

`requireStaff()` (ADMIN or STAFF) covers day-to-day operational visibility; `requireAdmin()` (ADMIN only)
covers founder-level concerns — deployment readiness, the full audit, governance status, and the one
mutation — mirroring `CLAUDE.md`'s own documented distinction ("destructive or business-sensitive
actions"). Every action independently calls its own guard — none relies on being called from within
another already-checked action, per this codebase's standing rule.
