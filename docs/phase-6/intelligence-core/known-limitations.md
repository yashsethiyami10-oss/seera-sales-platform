# Known Limitations

## No real memory persistence

`resolveMemory()` consumes only whatever `MemoryItem[]` a caller supplies. No surface today actually
populates conversation/session history — the `memory` field is `[]` or `undefined` in every real call
until a future module builds a real memory store and threads it into `IntelligenceRequest.memory`. This
is by design ("Do NOT implement long-term storage"), not an oversight, but it does mean Memory Resolver's
filtering logic is currently exercised only with hand-constructed test data, not live conversation
history.

## Keyword lexicons are small and English-only

The Priority Engine's 4 keyword lists and EQ Engine's 9-state lexicon are deliberately small, fixed, and
documented (not learned) — sufficient to demonstrate the deterministic classification pattern the module
prompt requires, but not exhaustive. Non-English customer messages, slang, sarcasm, or phrasing outside
the fixed term lists will fall through to the conservative default (`GENERAL_INQUIRY` / `NEUTRAL`) rather
than misclassifying — a deliberate fail-safe, but a real coverage gap if usage volume is high before
lexicons are expanded.

## Orchestrator's full pipeline cannot run outside a Next.js request

`buildIntelligence()` inherits Module 5's requirement of a real request scope (for `resolveCallerClearance()`
→ next-auth `auth()` → `headers()`). This is not specific to Module 6 — it is Module 5's own established
dependency, reused unmodified — but it means the orchestrator's full 8-stage sequencing was verified by
direct code reading plus individually testing each of its 8 stages, not by one live end-to-end script run
(see `testing.md`).

## `businessContext` / `institutionalContext` / `websiteContext` are opaque

These three fields are typed as `Record<string, unknown>` and passed through unchanged by the Context
Engine; downstream engines that read them (only Priority Engine, and only for presence/absence) don't
interpret their contents. If a future module needs structured business/institutional signals (e.g. a
specific distributor tier, a specific franchise agreement clause), this module does not parse or validate
any particular shape for them yet.

## CQ and Priority rule tables are fixed, not configurable

Every threshold and category mapping in `priority-engine.ts` and `cq-engine.ts` is a hardcoded constant.
There is no admin UI or database-backed configuration for adjusting keyword lists, score tables, or care
rules — any tuning requires a code change. This mirrors Module 5's ranking engine, which has the same
property, and is consistent with "prefer computation over storage" — but it is a real limitation if
founder review determines these thresholds need frequent adjustment without a deploy.

## No metrics/telemetry for Module 6 itself

Unlike Module 5 (which added `KnowledgeRetrievalLog`), Module 6's own prompt included no Logging/Metrics
section, and none was added. There is no record of how often each Priority category fires, how EQ states
distribute, or how often escalation is recommended — only Module 5's retrieval telemetry exists
downstream of this module's first stage. If founder review wants this module's own decision patterns
tracked over time, that would be new scope for a future module, not something silently added here.

## Explainability text is staff-facing, not customer-facing

`why`/`reasoning`/`decisionReason` strings throughout this module are written for a founder or staff
reviewer, not for a customer to read — they reference internal category names (`SAFETY`, `CUSTOMER_RISK`)
and internal confidence levels directly. If Module 7 (Execution Core) ever surfaces any of this text
directly to a customer without rewriting it, that would be a Module 7 responsibility to catch, not
something this module guards against — this module's own actions are all `requireStaff()`-gated, so no
customer-facing path exists today that could leak this text.
