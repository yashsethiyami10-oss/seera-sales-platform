# Pipeline

The frozen stage order, exactly as specified in the Module 6 prompt, implemented in
`lib/intelligence/intelligence-orchestrator.ts`'s `buildIntelligence()` as eight sequential, individually
commented steps. No stage was reordered, merged, or skipped.

```
1. Knowledge Retrieval   (Module 5, reused unmodified)
2. Priority Engine
3. Context Engine
4. Memory Resolver
5. Emotional Intelligence (EQ)
6. Care Quotient (CQ)
7. Decision Intelligence
8. Decision Package
```

## Stage 1 — Knowledge Retrieval

Calls `runRetrievalPipeline("buildIntelligence", request.retrieval, { resolveRelationshipsForTop: 3 })`
from Module 5, unmodified. Returns `{ results, clearance }`. `results` feeds every downstream stage that
needs retrieved knowledge; `clearance` feeds the Memory Resolver (stage 4).

## Stage 2 — Priority Engine

`evaluatePriority(retrievedKnowledge, { customerMessage, customerGoal, businessContext,
institutionalContext })`. Classifies the situation into one of 9 fixed categories and assigns a level
and score. Does not read `conversationContext`, `websiteContext`, or memory — see
[priority.md](./priority.md) for why.

## Stage 3 — Context Engine

`buildContext(retrievedKnowledge, { conversationContext, customerGoal, businessContext,
institutionalContext, websiteContext })`. Pure assembly — groups retrieved knowledge by source type into
`referencedProducts`/`referencedProblems`/`referencedCareWorkflows`, and passes the remaining context
fields straight through. No computation, no filtering beyond source-type grouping.

## Stage 4 — Memory Resolver

`resolveMemory(request.memory, clearance)`. Filters the caller-supplied `memory` array (nothing is read
from a database — see [memory.md](./memory.md)) by expiration and by the layer clearance resolved in
stage 1, and computes an overall confidence for what remains.

## Stage 5 — Emotional Intelligence (EQ)

`evaluateEmotion(request.customerMessage)`. Runs independently of every other stage — takes only the raw
customer message. Deliberately does not consume Priority, Context, or Memory: emotional signal is read
directly from what the customer said, not inferred from business classification.

## Stage 6 — Care Quotient (CQ)

`evaluateCare(priority, eq, context)`. The first stage that combines multiple prior stages' outputs —
this is intentional: care requirements depend on both how urgent/risky the situation is (Priority) and
how the customer is feeling (EQ), read against the situation (Context).

## Stage 7 — Decision Intelligence

`buildDecision(priority, context, memory, eq, cq)`. Combines every prior stage — the only engine that
sees all five inputs at once — and produces a single recommended next step, confidence, and reasoning.
Recommends only; never executes (see [decision.md](./decision.md)).

## Stage 8 — Decision Package

Two steps happen here, both in the orchestrator, before the package itself is assembled:
`explainDecision(priority, eq, cq, decision, trace)` builds the Explainability Metadata, then
`buildDecisionPackage({...})` bundles every stage's output — including the accumulated `ReasoningTrace`
(only included when `includeReasoningTrace` is true) — into the one object Module 7 will consume.

## Reasoning Trace accumulation

The orchestrator maintains a local `trace: ReasoningStep[]` and appends one step after every stage via a
`step(stage, summary)` closure — a short, high-level summary only ("Priority classified as SAFETY
(URGENT)"), never the engines' internal evidence arrays or chain-of-thought. This satisfies the module
prompt's "store only high-level reasoning... never expose internal reasoning" instruction. Exactly 7
`step()` calls happen per run (retrieval, priority, context, memory, eq, cq, decision) — the 8th stage
(Decision Package) assembles the trace rather than adding to it.

## What is NOT in the pipeline

No stage calls an LLM, builds a prompt, generates customer-facing text, writes to any database table, or
executes an action. The pipeline's only side effect anywhere is Module 5's own best-effort retrieval-
telemetry write inside stage 1 — not something Module 6 introduces.
