# Known Limitations

## Two Safety Engine branches are unreachable via genuine Module 6 output

`SafetyOutcome.BLOCKED` and `SafetyOutcome.UNKNOWN` both require conditions that Module 6's own
`cq-engine.ts` and `confidence-engine.ts` invariants make impossible to produce from a real
`buildIntelligence()` call today (see [safety.md](./safety.md) for the full derivation). Both branches
are retained as defensive fallbacks for hand-constructed or corrupted input, not removed as dead code —
but this means, in practice, this module currently only ever produces 6 of its 8 named Safety Outcomes
against real traffic. If Module 6's CQ or Confidence engines are ever changed in a way that breaks either
invariant, these branches would become reachable — this is a feature of the defensive design, not a risk,
but is worth knowing before assuming all 8 outcomes appear in practice. (Post-founder-review: `BLOCKED`'s
short-circuit *mechanism* is now verified end-to-end via a synthetic fixture — see `testing.md` — but the
outcome itself remains unreachable via real Module 6 output, a separate fact from whether the code path
that handles it works correctly.)

## `KNOWLEDGE_POLICY` and `RESPONSE_RULES` policy checks are structural consistency guards, not independent business judgments

Both checks validate invariants that Module 6's own `decision-package.ts` guarantees hold by construction
(`outstandingQuestions`/`requiredInformation` are literally the same array; `decisionReason` is never
empty). Against real input, these two checks are expected to always pass — see [policy.md](./policy.md).
They exist to validate, not to assume; they are not currently a meaningful business-rule gate the way
`SAFETY_RULES` or `BUSINESS_RULES` are.

## No real integration layer exists yet

`ActionResult`, `ResponseBlueprint`, and `ExecutionPackage` are all designed to be consumed by a future
integration layer (WhatsApp/Email/Website/Admin/Orders) that doesn't exist yet. Nothing in this codebase
currently calls `executePipeline()` from any real request path — it is only reachable via its own Server
Action, awaiting a caller. This is expected at this phase, not an oversight.

## `clearanceLayer` defaults to `PUBLIC` when omitted, with no independent verification

Unlike Module 5/6, which derive clearance from a real session via `resolveCallerClearance()`, Execution
Core accepts `clearanceLayer` as a plain caller-supplied parameter (defaulting to the most conservative
value, `PUBLIC`, when omitted). This module trusts whatever `clearanceLayer` its caller passes — it does
not independently re-verify it against a session. This is intentional (Execution Core's whole job is to
consume already-resolved context, not re-derive it), but it does mean a caller with `requireStaff()`-level
access to this module's own actions could, in principle, pass an inflated `clearanceLayer` value. Since
every action here is already `requireStaff()`-gated, this is a staff-trust boundary, not an external one —
worth reviewing if this module is ever exposed beyond staff callers.

## Fixed rule tables and thresholds are hardcoded, not configurable

Every threshold in `safety-engine.ts` (the confidence minimum of 35), and every category-to-target/action
mapping in `escalation-resolver.ts`/`action-engine.ts`, is a hardcoded constant — no admin UI or
database-backed configuration exists for adjusting them. This mirrors the same limitation already
documented in Module 6's `priority-engine.ts`/`cq-engine.ts`.

## No metrics/telemetry for Module 7 itself

Like Module 6 (and unlike Module 5's `KnowledgeRetrievalLog`), this module's own prompt included no
Logging/Metrics section, and none was added. There is no record of how often each Safety Outcome,
Escalation Target, or Action Type occurs. If founder review wants Execution Core's own decision patterns
tracked over time, that is new scope for a future module.

## Response Blueprint's tone and structure guidance is coarse

`toneGuidance` and `suggestedStructure` are both small, fixed lookup tables (9 action types, 4 tone
words) — sufficient to demonstrate the required blueprint pattern, but not a rich content-strategy layer.
A future LLM integration consuming these blueprints will need its own, more detailed prompt engineering
on top of what this module provides — which is by design, since prompt engineering is explicitly excluded
from this module's scope.
