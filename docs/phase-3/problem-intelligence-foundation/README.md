# Problem Intelligence Foundation (PrIF Engine)

**Module 3 of the MUV Intelligence Platform.** Implemented, code- and database-verified, awaiting founder review.

## What PrIF is

A structured, versioned, permission-controlled store of **problem intelligence** — what a customer is
experiencing, what symptoms indicate it, what might be causing it, what should be asked before anything
is recommended, what mistakes people commonly make, which products may (or must not) be relevant, what
outcome is realistic, how recurrence is prevented, and when the system must escalate to a human instead
of recommending anything at all.

It is **problem-first, not product-first**: a Problem Intelligence File (PrIF) exists to represent a
customer's situation faithfully, including the possibility that no product is suitable, more information
is needed, a safety concern exists, or a human must take over.

## What PrIF is not

- **Not a product catalog.** `Product`/`ProductVariant` remain the single source of truth for catalog
  data. PrIF only ever references a product by id.
- **Not PIF (Module 2).** PIF is *product*-first structured intelligence ("everything about MUV Shield").
  PrIF is *problem*-first ("clothes still smell after washing," which may reference MUV Shield among
  several products, or none). See [architecture.md](./architecture.md) for the full distinction.
- **Not a recommendation engine.** `ProblemProductRelationship` records candidate suitability signals
  (`PRIMARY`/`ALTERNATIVE`/`CONDITIONAL`/`SUPPORTING`/`NOT_RECOMMENDED`) for a future Decision
  Intelligence module to weigh — it does not decide what to actually tell a customer.
- **Not an AI diagnosis engine.** `ProblemDiagnosticQuestion` is the structured *foundation* a future
  conversational questioning engine would ask from — this module does not run a conversation.
- **Not the Safety Engine.** Safety and escalation fields (risk level, escalation flags, disclaimers,
  `ProblemSafetyRule`) are structured data a future Safety Engine module would read and act on — this
  module does not execute any safety decision itself.
- **Not retrieval, embeddings, vector search, or LLM integration.** Nothing in this module calls an AI
  provider or performs semantic search. `getPublishedProblemIntelligence` is a plain, structured,
  permission-filtered database read — not AI retrieval.

## Relationship to Modules 1 and 2

- **Module 1 (Knowledge Foundation)** — PrIF reuses its `KnowledgeLayer` enum (Public/Internal/
  Confidential) directly for permissioning. Module 1 itself was not modified.
- **Module 2 (PIF Engine)** — PrIF references `ProductIntelligence` rows (via
  `ProblemProductRelationship.productIntelligenceId` and `ProblemUsageGuidance.productIntelligenceId`)
  where detailed per-product intelligence is relevant, but never duplicates PIF content. Module 2 itself
  was not modified.

## Where to go next

- [architecture.md](./architecture.md) — PIF vs. PrIF, data ownership boundaries, the two-tier versioning model
- [data-model.md](./data-model.md) — every model, enum, field, and relationship
- [lifecycle.md](./lifecycle.md) — the Draft → Review → Published → Archived workflow and its rules
- [permissions.md](./permissions.md) — Layer A/B/C boundaries, what's public vs. internal vs. confidential
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results, honestly reported
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the required 12-section founder report
