# Care Intelligence Foundation (CIF Engine)

**Module 4 of the MUV Intelligence Platform.** Implemented, code- and database-verified, awaiting founder review.

## What CIF is

A structured, versioned, permission-controlled store of **how MUV should care for customers** in
different situations — care workflows, customer handling procedures, escalation logic, service
standards, resolution playbooks, human handoff metadata, care policies, and communication guidance
(guidance only — CIF never generates a response).

## What CIF is not

- **Not the CQ Engine.** CQ decides *how* to respond, in real time, to a real customer. CIF stores the
  care knowledge CQ and a future Decision Intelligence module will read from — nothing in this module
  executes a decision.
- **Not product knowledge (PIF, Module 2)** or **problem knowledge (PrIF, Module 3)**. CIF is
  emotional/operational: not "what is this product" or "what is this problem," but "how do we treat the
  person going through it."
- **Not response generation.** Communication guidance fields (tone, things to avoid, mandatory
  statements) are exactly that — guidance for a human or a future engine to follow. Nothing in this
  module writes or returns a ready-to-send customer message.
- **Not retrieval, embeddings, or LLM integration.** `getPublishedCareIntelligence` is a plain,
  permission-filtered structured read.

## Relationship to Modules 1–3

CIF reuses `KnowledgeLayer` (Module 1) for Layer A/B/C and `ProblemConfidenceLevel` (Module 3) for
evidence confidence — neither module was modified. CIF *references* `Product`, `ProductIntelligence`
(Module 2), `ProblemIntelligence` (Module 3), and `KnowledgeItem` (Module 1 — which already models
Policies/SOPs/the Knowledge Library, so no new duplicate concept was created for those) — it never
duplicates their data.

## A real design difference from Module 3, on purpose

Module 3 (PrIF) has one dedicated `addProblemX` server action per structured child section. This
module's own Server Actions list names only 10 functions total, with no per-section actions —
`createCareIntelligence`/`updateCareIntelligence` instead take the full nested content (required
information, care actions, evidence sources) in one payload each. See
[architecture.md](./architecture.md) for the full reasoning; this is not an inconsistency, it's what the
literal spec for this module asks for.

## Where to go next

- [architecture.md](./architecture.md) — design decisions and reasoning, including the Module 3 comparison
- [workflow-guide.md](./workflow-guide.md) — the Draft → Review → Published → Archived lifecycle
- [data-model.md](./data-model.md) — every model, enum, field, and relationship
- [permissions.md](./permissions.md) — Layer A/B/C boundaries, what's public vs. internal
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the required 12-section founder report
