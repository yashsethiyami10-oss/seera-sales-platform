# Feature Flag Manager

`lib/production/feature-flags.ts` — `getFeatureFlags()`, `updateFeatureFlags(partial)`.

## The 5 fixed flags

`EXPERIENCE_PLATFORM`, `FOUNDER_REVIEW`, `ANALYTICS`, `FEEDBACK`, `FUTURE_CHANNELS` — exactly the 5 named
in the module prompt. Defaults: the first 4 are `true` (all correspond to capabilities Modules 6–8 already
built and delivered); `FUTURE_CHANNELS` is `false` (no channel beyond Website — Module 8 — exists yet).

## "Use deterministic configuration. No remote feature service."

Base values come from env vars (`FEATURE_EXPERIENCE_PLATFORM`, `FEATURE_FOUNDER_REVIEW`,
`FEATURE_ANALYTICS`, `FEATURE_FEEDBACK`, `FEATURE_FUTURE_CHANNELS` — `"true"`/`"1"` for on, anything else
or unset falls back to the default above). No network call, no third-party flag service — a deployment's
flags are fully determined by its own environment.

## Why `updateFeatureFlags()` is the one mutation in this module

The module prompt requires a working `updateFeatureFlags()` action, but also says "prefer computation
over storage" and "do not introduce new schema automatically" — ruling out a new database table. Env vars
can't be changed at runtime by a Server Action either. The only way to make `updateFeatureFlags()`
genuinely do something is in-process mutable state: a module-level `Map<FeatureFlagKey, boolean>`
(`runtimeOverrides`), checked first by `getFeatureFlags()` before falling back to the env-derived default.

This is the *exact same pattern* `lib/rate-limit.ts` already established and this codebase already
accepts: "fine for a single server instance... counters live in process memory... reset on
deploy/restart." `updateFeatureFlags()` inherits the identical trade-off, documented the same way. See
[known-limitations.md](./known-limitations.md).

## `updateFeatureFlags(partial)`

Accepts a partial object (any subset of the 5 keys) via `updateFeatureFlagsSchema` — a `.strict()` Zod
object requiring at least one key, rejecting unknown keys outright (not silently ignored). Returns the
full, resulting `FeatureFlags` object (all 5 keys) after applying the override — never just the changed
subset, so a caller always sees the complete current state.
