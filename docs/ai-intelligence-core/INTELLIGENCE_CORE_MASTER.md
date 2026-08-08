# MUV AI Intelligence Core™ — Master Architecture

> Authorized via Founder Execution Protocol v2.0 (AI Intelligence Core). Pure engineering
> architecture — no application code, no API implementations, no model selection. This document
> and its companions are what developers implement from.

## 1. The decision that shapes this entire document

Before any layer was designed, research confirmed a real, already-implemented, **production-
wired** 9-module "MUV Intelligence Platform" exists in this codebase (`docs/phase-3/` through
`docs/phase-9/`, backed by real code in `lib/knowledge-*`... actually `lib/retrieval/`,
`lib/intelligence/`, `lib/execution/`, `lib/experience/`, `lib/production/`, and real Prisma
models) — not a design document, real deterministic logic, exercised today by a live customer-
facing chat widget (`components/muv-ai/use-muv-ai-chat.ts`, mounted in `app/layout.tsx`, calling
`orchestrateExperience()`).

A directly relevant prior Founder decision (2026-07-30, recorded in project memory) already
settled how any future AI-architecture work must treat this platform: **reuse and map onto
Modules 1-9, do not build a parallel structure alongside them.** That decision was contingent on
a set of canonical source documents being complete first — at the time, 6 of 8 were missing. All
four Knowledge Factories this protocol names as read-only inputs (Product, Marketing,
Institutional Sales, Founder Intelligence) have since been completed, which is the resolution
that condition was waiting for.

**This was confirmed directly with the Founder before any layer was designed** (not assumed):
this document is an **integration architecture** — it maps the Founder's newly-specified
13-layer model onto the real Modules 1-9, identifies exactly what already exists and should be
reused unmodified, and designs only the genuinely new engineering required to wire in the four
Knowledge Factories, which are completely unknown to the existing platform today (confirmed by
exhaustive grep — zero references anywhere in `docs/phase-3` through `docs/phase-9` or `lib/`).

## 2. What already exists — the 9-module platform, summarized

| Module | Real name | Status | Owns (real files) |
|---|---|---|---|
| 1 | Knowledge Foundation | Implemented, unseeded | `actions/knowledge.ts`; `KnowledgeItem`/`KnowledgeVersion` (Prisma) |
| 2 | Product Intelligence Foundation (PIF) | Implemented, unseeded | `actions/product-intelligence.ts`; `ProductIntelligence`/`ProductIntelligenceVersion` |
| 3 | Problem Intelligence Foundation (PrIF) | Implemented, awaiting founder review, unseeded | `actions/problem-intelligence.ts`; 13 Prisma models |
| 4 | Care Intelligence Foundation (CIF) | Implemented, awaiting founder review, unseeded | `actions/care-intelligence.ts`; `CareIntelligence` family |
| 5 | Knowledge Retrieval Core (KRC) | Implemented, awaiting founder review | `lib/retrieval/*` (8 files); `actions/retrieval.ts` |
| 6 | Intelligence Core | Implemented, awaiting founder review | `lib/intelligence/*` (10 files); `actions/intelligence.ts` |
| 7 | Execution Core | Implemented, awaiting founder review | `lib/execution/*` (8 files); `actions/execution.ts` |
| 8 | Experience Platform | Implemented, **live in production** | `lib/experience/*` (8 files); `actions/experience.ts`; `ExperienceSession`/`ExperienceFeedback` |
| 9 | Production Readiness | Implemented, awaiting founder review | `lib/production/*` (9 files) |

**A separate, pre-existing, unrelated subsystem** — `lib/knowledge-factory/*`, an "Enterprise
Knowledge Factory" ingestion/governance layer (`CanonicalSourceDocument`, `SourceProvenance`,
`KnowledgeEmbedding`, `KnowledgeConflict`, `KnowledgeChangeProposal`, `RecallEvent`, and others),
feature-flagged on (`ENTERPRISE_KNOWLEDGE_FACTORY_ENABLED = true`) but also entirely unseeded —
shares a confusingly similar name to the four new content Knowledge Factories this protocol
names but is **not the same system**. This document treats it as a candidate integration point
(§4, Layer 1) precisely because its `CanonicalSourceDocument.documentType` field is already
free-text/open, not because it is already wired to the four Factories — it is not.

**Every content table in the entire platform is empty.** Module 1, Module 2, and the V4
governance layer have zero seeded rows (confirmed against `prisma/seed.ts` directly). This
matters for scope: the four new Knowledge Factories are not just unintegrated, they would today
be the *first* real content the retrieval pipeline has ever served.

**The most consequential existing gap, confirmed directly from Module 7's own documentation:**
no LLM exists anywhere in this platform. Every engine — Priority, Context, Memory, EQ, CQ,
Decision, Policy, Action, Response Blueprint — is deterministic: fixed lexicons, fixed rule
tables, fixed scoring formulas. `response-composer.ts` builds a structural instruction set with
explicitly **no customer-readable prose** — Module 7's own docs name this "a future LLM
integration (not built)." This is separate from, and larger than, the Knowledge Factory
integration gap this protocol specifically asked about — both are named honestly in §5 rather
than conflated.

## 3. The Founder Thinking Pipeline, mapped onto the real system

**Understand → Care → Retrieve Knowledge → Build Context → Reason → Decision → Confidence Check
→ Assemble Response → Safety Verification → Deliver → Learn**

| Pipeline stage | Realized today by | Note |
|---|---|---|
| Understand | Module 8's `session-manager.ts` (message intake) | New: intent classification against the 4 new Factories' content — see Layer 1/4 |
| Care | Module 6's CQ Engine (`cq-engine.ts`) | **Sequencing note, disclosed not silently resolved:** the existing implementation computes Care mid-pipeline (inside Module 6, after retrieval), not as the very first stage this pipeline's ordering implies. No functional conflict — CQ's inputs already include the customer's situation — but a literal re-ordering was not made to existing code, since doing so is implementation, not architecture. Flagged in `ENGINE_VALIDATION.md` |
| Retrieve Knowledge | Module 5 (Knowledge Retrieval Core) | Layer 3 |
| Build Context | Module 6's Context Engine | Layer 4 |
| Reason | Module 6's Priority/EQ/CQ Engines collectively | Layer 5 |
| Decision | Module 6's Decision Engine | Layer 6 |
| Confidence Check | Module 6's Confidence Engine | Layer 9 |
| Assemble Response | Module 7's Response Composer + Module 8's Response Model | Layer 11 — **the LLM gap lives here** |
| Safety Verification | Module 7's Safety Engine + Policy Validator | Part of Layer 6/11 |
| Deliver | Module 8's Experience Orchestrator + Website Channel Adapter | Layer 11/12 |
| Learn | Module 8's Feedback Capture + Review Preparer (partial) | Layer 13 — largest genuine gap |

## 4. The 13 Layers, mapped onto the 9 Modules — summary

See `ENGINE_ARCHITECTURE.md` for the full 15-dimension design of every layer. Summary:

| # | Layer | Maps to | Shape of new work |
|---|---|---|---|
| 1 | Knowledge Integration | Module 1 + V4 governance layer | Extend closed enums; new ingestion path per Factory |
| 2 | Knowledge Graph | *(no direct existing module)* | New design, grounded in `lib/retrieval/relationships.ts`'s existing precedent |
| 3 | Retrieval Engine | Module 5 (+ V4's `orchestration-plan.ts`) | Extend closed `sourceType` union or reuse the established workaround pattern |
| 4 | Context Engine | Module 6's Context Engine | Populate the already-present but unused `businessContext`/`institutionalContext` fields |
| 5 | Reasoning Engine | Module 6's Priority/EQ/CQ Engines | Ground synthesis in Founder Intelligence KF's reasoning frameworks |
| 6 | Decision Engine | Module 6's Decision Engine | Extend the fixed action cascade minimally, not redesign it |
| 7 | Memory Engine | Module 6's Memory Resolver + Module 8's `ExperienceSession` | Mostly reuse as-is |
| 8 | Conflict Resolution Engine | V4's `KnowledgeConflict` model (partial) | **Directly answers Founder Intelligence KF's own `KO-FD-GAP-002`** — new design required |
| 9 | Confidence Engine | Module 6's Confidence Engine | Extend evidence-count model to weigh 4 new source types |
| 10 | Care Engine | Module 4 (CIF) + Module 6's CQ Engine | Module 4's own docs already disclose the Institutional Sales gap this closes |
| 11 | Response Assembly Engine | Module 7's Response Composer + Module 8's Response Model | **The no-LLM gap lives here** — largest genuine new-architecture need |
| 12 | Tool Orchestration Engine | Module 7's Action Engine + Module 8's Orchestrator | Real "tool calling" (order lookup, live escalation) not yet designed |
| 13 | Continuous Learning Architecture | Module 8's Feedback Capture (partial) | Largest genuine gap — no loop closes back to any Knowledge Factory today |

## 5. Architecture verification

New repository, `docs/ai-intelligence-core/`, lean single-repository format:
`INTELLIGENCE_CORE_MASTER.md`, `ENGINE_ARCHITECTURE.md`, `ENGINE_RELATIONSHIPS.md`,
`ENGINE_VALIDATION.md`, `FOUNDER_REVIEW.md`, `JSON/*`. No frozen repository was modified —
`docs/phase-3` through `docs/phase-9`, `lib/retrieval/`, `lib/intelligence/`, `lib/execution/`,
`lib/experience/`, `lib/production/`, `lib/knowledge-factory/`, and all four Knowledge Factories
were read-only throughout this design work. Zero application code was written — every layer
below is a specification for developers, not an implementation.

**Result: PASS.**
