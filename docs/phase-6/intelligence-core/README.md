# Intelligence Core

**Module 6 of the MUV Intelligence Platform.** Implemented, code- and script-verified, awaiting founder review.

## What Intelligence Core is

A read-only reasoning layer that takes what Module 5 (Knowledge Retrieval Core) retrieves and turns it
into structured, explainable intelligence — priority, context, memory, emotional signal, care
requirements, and a recommended next step — bundled into one Decision Package. It answers "what matters
right now?", not "what do we know?" (that's Module 5) and not "what do we say?" (that's Module 7,
Execution Core, not yet built).

Think of Module 5 as the librarian and Module 6 as the analyst: the librarian hands over the right
books; the analyst reads them, weighs them against the situation, and writes a structured briefing —
the analyst never talks to the customer directly.

## What Intelligence Core is not

- **Not the AI/LLM.** No prompt assembly, no response generation, no model calls anywhere in this
  module. Every engine is deterministic: fixed keyword lexicons, fixed rule tables, fixed scoring
  formulas — see [eq.md](./eq.md), [cq.md](./cq.md), [priority.md](./priority.md).
- **Not a content-authoring module.** No `create`/`update`/`delete` anywhere in `lib/intelligence/` —
  confirmed by direct grep, not just design intent (see [testing.md](./testing.md)).
- **Not Execution, Safety, Action, or Chat.** Those are Module 7's explicitly named territory. This
  module recommends; it never executes (see [decision.md](./decision.md)).
- **Not a new data store.** Zero new Prisma models or enums — confirmed by direct schema inspection
  (see [architecture.md](./architecture.md)). "Prefer computation over storage" was followed literally.

## The frozen pipeline

Knowledge Retrieval (Module 5, reused unmodified) → Priority → Context → Memory → EQ → CQ → Decision →
Decision Package. See [pipeline.md](./pipeline.md) for the stage-by-stage implementation.

## A different RBAC shape from Module 5, on purpose

Module 5's 8 actions are callable by anyone, with results filtered by server-derived clearance, because
Module 5 must serve a future customer-facing AI directly. Module 6's 10 actions are all
`requireStaff()`-gated, because this module is internal reasoning infrastructure for a not-yet-built
Module 7 — not a direct customer-facing surface itself. See [architecture.md](./architecture.md) for
the full reasoning.

## Where to go next

- [architecture.md](./architecture.md) — design decisions, including the RBAC divergence from Module 5
- [pipeline.md](./pipeline.md) — the frozen 8-stage flow, implemented stage-by-stage
- [priority.md](./priority.md) — the Priority Engine's fixed category cascade and score table
- [context.md](./context.md) — the Context Engine's pure-assembly design
- [memory.md](./memory.md) — the Memory Resolver's expiration/layer filtering, no long-term storage
- [eq.md](./eq.md) — the Emotional Intelligence Engine's lexicon and confidence model
- [cq.md](./cq.md) — the Care Quotient Engine, MUV's differentiator
- [decision.md](./decision.md) — the Decision Intelligence Engine's synthesis logic
- [confidence.md](./confidence.md) — the Confidence Evaluation formula
- [explainability.md](./explainability.md) — how every decision states its own "why"
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the required 12-section founder report
