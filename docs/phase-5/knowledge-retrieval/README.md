# Knowledge Retrieval Core (KRC)

**Module 5 of the MUV Intelligence Platform.** Implemented, code- and database-verified, awaiting founder review.

## What KRC is

A read-only orchestration layer that finds, filters, ranks, and returns structured knowledge from the
four foundations already built (Module 1 Knowledge, Module 2 PIF, Module 3 PrIF, Module 4 CIF), for
future AI engines to consume. Think of it as the Intelligence Library's librarian: it locates the right
book and hands it over — it doesn't read it aloud, summarize it, or decide what to do with it.

## What KRC is not

- **Not a content-authoring module**, unlike Modules 1–4. It has no `create`/`update`/`publish` — every
  one of its 8 server actions is read-only, confirmed by direct inspection (`actions/retrieval.ts`
  never calls `.create`/`.update`/`.delete` on any Knowledge/PIF/PrIF/CIF model).
- **Not the AI.** No LLM calls, no embeddings, no vector search, no semantic search. Ranking is a
  deterministic, explainable point-scoring system — see [ranking.md](./ranking.md) — not a model.
- **Not the Decision Engine, CQ Engine, EQ Engine, Memory, Context, Safety, or Action layer.** Those are
  named, later, frozen modules this one explicitly does not touch.
- **Not a search index.** "Keyword match" is a plain case-insensitive substring check against title/
  content fields — real, useful, and honestly *not* semantic search, which the spec explicitly excludes.

## The one real schema addition

A single new table, `KnowledgeRetrievalLog` — telemetry for each retrieval call (what was asked, how
long it took, how many results, which permission layer, any error). Nothing else was added: no new
content model, no duplicated data. See [architecture.md](./architecture.md) for why this is deliberately
the smallest schema footprint of any module so far.

## A different RBAC shape from Modules 1–4, on purpose

Modules 1–4 gate most of their actions at the *function* level (`requireStaff()`/`requireAdmin()`) —
correct for admin CRUD surfaces. KRC's 8 actions are gated at the *result* level instead: any caller,
including a fully anonymous one, can call `retrieveKnowledge()` directly, and gets back only what their
real, server-derived clearance allows. This is what a future customer-facing AI needs — see
[permissions.md](./permissions.md).

## Where to go next

- [architecture.md](./architecture.md) — design decisions, including why Module 5's own actions aren't reused from Modules 1–4
- [retrieval-pipeline.md](./retrieval-pipeline.md) — the frozen 8-stage flow, implemented stage-by-stage
- [ranking.md](./ranking.md) — the deterministic scoring model
- [permissions.md](./permissions.md) — Layer A/B/C filtering and the anyone-can-call RBAC shape
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the required 12-section founder report
