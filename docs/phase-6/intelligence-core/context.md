# Context Engine

`lib/intelligence/context-engine.ts` — `buildContext(retrievedKnowledge, request)`.

## Design: deterministic, no AI

Per the module prompt ("Context must be deterministic. No AI."), this engine performs zero inference.
Every output field is either a straight pass-through of a request field or a grouping of already-
retrieved knowledge by `sourceType`. There is no summarization, no ranking, no filtering beyond the
source-type split.

## Fields

| Field | Source |
|---|---|
| `conversationContext` | `request.conversationContext ?? null` |
| `customerGoal` | `request.customerGoal ?? null` |
| `retrievedKnowledge` | passed through unmodified from Module 5's retrieval |
| `referencedProducts` | `retrievedKnowledge` filtered to `sourceType === "PRODUCT_INTELLIGENCE"` |
| `referencedProblems` | `retrievedKnowledge` filtered to `sourceType === "PROBLEM_INTELLIGENCE"` |
| `referencedCareWorkflows` | `retrievedKnowledge` filtered to `sourceType === "CARE_INTELLIGENCE"` |
| `businessContext` | `request.businessContext ?? null` |
| `institutionalContext` | `request.institutionalContext ?? null` |
| `websiteContext` | `request.websiteContext ?? null` |

Every referenced-* array is built by mapping the filtered `RetrievalResult`s to a `SourceReference`
(`type`, `id`, `label`, `linkKind: "direct"`) — the same `SourceReference` shape Module 5 already defined,
reused rather than redefined.

## Why "Business Context" and "Institutional Context" are opaque records

The module prompt lists Business Context and Institutional Context as fields the Context Engine "must
support" without specifying their shape — they are supplied by the caller (ultimately, whatever surface
constructs the `IntelligenceRequest`) as free-form `Record<string, unknown>`, validated only for basic
shape by Zod (`z.record(z.unknown())`), and passed through unchanged. This engine does not interpret
their contents; later engines that do read them (Priority Engine checks presence, not content) treat
them as a boolean signal, not structured business data.
