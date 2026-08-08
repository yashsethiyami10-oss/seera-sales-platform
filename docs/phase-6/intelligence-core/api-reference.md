# API Reference

All 10 actions live in `actions/intelligence.ts`, all `"use server"`, all call `await requireStaff();`
as their first line (ADMIN or STAFF role — see `lib/rbac.ts`), all validate input through the matching
schema in `lib/validations/intelligence.ts`, and all return either `{ success: true, data: {...} }` or
the standard `toErrorResponse(err)` shape (`{ success: false, error: { message, code } }`).

## `buildIntelligence(input)`

Runs the full 8-stage pipeline. Input: `intelligenceRequestSchema` (`retrieval` context object plus
optional `customerMessage`/`customerGoal`/`conversationContext`/`businessContext`/
`institutionalContext`/`websiteContext`/`memory[]`). Output: `{ decisionPackage: DecisionPackage,
clearanceLayer: string }`. `includeReasoningTrace` is hardcoded `true` at this entry point — the full
package, trace included, since the caller is already confirmed staff.

## `evaluatePriority(input)`

Input: `{ retrievedKnowledge: RetrievalResult[], customerMessage?, customerGoal?, businessContext?,
institutionalContext? }`. Output: `{ priority: PriorityResult }`.

## `buildContext(input)`

Input: `{ retrievedKnowledge: RetrievalResult[], conversationContext?, customerGoal?, businessContext?,
institutionalContext?, websiteContext? }`. Output: `{ context: IntelligenceContext }`.

## `resolveMemory(input)`

Input: `{ memory?: MemoryItem[] }`. Internally calls `resolveCallerClearance()` itself (the only one of
the 10 actions that resolves clearance independently, since it isn't called from within
`buildIntelligence()`'s already-resolved clearance in this entry point). Output: `{ memory:
MemoryResolution }`.

## `evaluateEmotion(input)`

Input: `{ customerMessage?: string }`. Output: `{ eq: EQResult }`.

## `evaluateCare(input)`

Input: `{ priority: PriorityResult, eq: EQResult, context: IntelligenceContext }`. Output: `{ cq:
CQResult }`.

## `buildDecision(input)`

Input: `{ priority: PriorityResult, context: IntelligenceContext, memory: MemoryResolution, eq: EQResult,
cq: CQResult }`. Output: `{ decision: DecisionResult }`.

## `buildDecisionPackage(input)`

Input: `{ priority, context, memory, eq, cq, decision, reasoningTrace }` (all prior-stage outputs plus a
trace array). Internally recomputes `confidence` (via `evaluateConfidence`) and `explainability` (via
`explainDecision`) from the supplied inputs before assembling — the caller doesn't need to have those
two ready-made. `includeReasoningTrace` is hardcoded `true` at this entry point. Output: `{
decisionPackage: DecisionPackage }`.

## `evaluateConfidence(input)`

Input: `{ evidenceCount: number, maxPossibleEvidence: number, missingInformation: string[] }`. Output:
`{ confidence: ConfidenceEvaluation }`.

## `explainDecision(input)`

Input: `{ priority, eq, cq, decision, reasoningTrace }`. Output: `{ explainability:
ExplainabilityMetadata }`.

## Auth summary

| Action | Auth | Notes |
|---|---|---|
| `buildIntelligence` | `requireStaff()` | Runs full pipeline; trace always included |
| `evaluatePriority` | `requireStaff()` | |
| `buildContext` | `requireStaff()` | |
| `resolveMemory` | `requireStaff()` | Also independently resolves its own clearance |
| `evaluateEmotion` | `requireStaff()` | |
| `evaluateCare` | `requireStaff()` | |
| `buildDecision` | `requireStaff()` | |
| `buildDecisionPackage` | `requireStaff()` | Recomputes confidence + explainability internally |
| `evaluateConfidence` | `requireStaff()` | |
| `explainDecision` | `requireStaff()` | |

Every action independently calls `requireStaff()` — none relies on being called from within another
already-authorized action, per this codebase's standing rule that every exported Server Action is
independently callable as its own RPC endpoint (see `CLAUDE.md`).
