# Version Registry

`lib/production/version-registry.ts` — `getVersionRegistry()`.

## "No automatic migrations."

Every version field is either a fixed constant, bumped manually alongside a real change, or read from an
existing file/env var — nothing here inspects `prisma/schema.prisma` or runs a migration command to
derive its answer.

## Fields

| Field | Source |
|---|---|
| `architectureVersion` | Fixed constant `"MUV AI v1.0"` |
| `aiVersion` | Fixed constant `"MUV AI v1.0"` (same value today; kept as a separate field since architecture and AI capability versions are conceptually distinct and may diverge later) |
| `schemaVersion` | Fixed constant `"1.0"` — bumped manually alongside genuine `schema.prisma` changes, never derived |
| `buildVersion` | Read from `package.json`'s own `version` field via `fs.readFileSync` (currently `"1.0.0"`) |
| `moduleVersions` | `MODULE_VERSIONS` — one entry per Module 1–9, each `"1.0"` today |
| `deploymentTimestamp` | `DEPLOYMENT_TIMESTAMP` env var if set; otherwise the running process's own start time |
| `deploymentTimestampSource` | `"env"` or `"process-start"` — always disclosed alongside the timestamp itself |

## Why `deploymentTimestamp` is honestly qualified

No real deployment pipeline exists in this project (infrastructure provisioning is explicitly out of this
module's scope) — there is no genuine "when was this deployed" signal available at runtime. Rather than
fabricate one, this field reports the process's own start time when no `DEPLOYMENT_TIMESTAMP` env var is
supplied, and always labels which source produced the value via `deploymentTimestampSource` — a caller
can tell the difference between a real deploy timestamp and a process-start proxy.

## Module version bumping is manual, by design

`MODULE_VERSIONS` is a hand-maintained map. Module 7's own post-founder-review correction (the safety
short-circuit fix) is a concrete example of a change that, had this registry existed at the time, would
have warranted bumping that one entry to `"1.1"` — this registry does not attempt to detect that
automatically; a future module or process change is expected to update it deliberately.
