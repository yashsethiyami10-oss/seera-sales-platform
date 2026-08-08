# Architecture

## Why this module queries Prisma directly instead of calling Modules 1–4's own actions

`getKnowledgeItem`, `getProductIntelligence`, `getProblemIntelligence`, `getCareIntelligence` (and their
siblings) already exist, are tested, and read the exact same tables KRC needs. The obvious instinct is
to have KRC call them. That doesn't work here: those actions are `requireStaff()`-gated (or, for the
public-facing ones like `getPublicKnowledge`, hardcoded to Public-only with no graduated access at all).
KRC's whole purpose is a *single* call that behaves correctly for an anonymous visitor, a logged-in
customer, staff, and an admin — four different effective result sets from one function, decided by real
session state, not by which of several separately-gated functions the caller happened to invoke.
Calling the staff-gated functions from inside a KRC action reachable by anonymous callers would mean
either the whole call 403s for a public visitor, or KRC would have to bypass those gates entirely
(defeating the point of having them).

So `lib/retrieval/sources.ts` queries `KnowledgeItem`/`ProductIntelligence`/`ProblemIntelligence`/
`CareIntelligence` and their version tables directly — the same models, same columns, same "current
published version = highest versionNumber with the right status" derivation every one of Modules 1–4
already established, just executed once per source type with a **caller-derived** layer/status filter
instead of a hardcoded one. This reuses the *data model* completely (no schema duplicated, no content
duplicated) while not reusing the *action-layer RBAC*, which was built for a different calling pattern.
Documented here rather than left as a silent departure from "reuse existing models."

## Deliberately the smallest schema footprint yet

One new table: `KnowledgeRetrievalLog`. No new content model. The spec's own instruction — "add only
what is required... avoid unnecessary schema changes... reuse existing models wherever possible... do
not duplicate knowledge" — is stricter language than Modules 2–4 received, and was treated as governing:
cross-module relationship resolution (see below) was solved with query logic, not new foreign keys,
specifically to honor this.

## Cross-reference resolution: 7 direct, 2 transitive — no new relations added

Of the spec's 9 required pairs (Knowledge↔PIF, Knowledge↔PrIF, Knowledge↔CIF, PIF↔Product, PrIF↔Product,
CIF↔Product, PIF↔PrIF, PIF↔CIF, PrIF↔CIF), 7 already have a real foreign key or relation table from
Modules 2–4:

| Pair | Existing relation |
|---|---|
| PIF ↔ Product | `ProductIntelligence.productId` |
| PrIF ↔ Product | `ProblemProductRelationship`/`ExclusionRule`/`UsageGuidance.productId` |
| CIF ↔ Product | `CareIntelligenceVersion.relatedProducts` |
| PIF ↔ PrIF | `ProblemProductRelationship.productIntelligenceId` |
| PIF ↔ CIF | `CareIntelligenceVersion.relatedProductIntelligence` |
| PrIF ↔ CIF | `CareIntelligenceVersion.relatedProblemIntelligence` |
| Knowledge ↔ CIF | `CareIntelligenceVersion.relatedKnowledgeItems` |

Two pairs — **Knowledge↔PIF** and **Knowledge↔PrIF** — have no direct relation anywhere in the schema.
Adding one would mean a new column on Module 1's `KnowledgeItem` or Module 2/3's own models — modifying
a previous module's schema, which this module's own "do NOT redesign previous modules" rules out.
Instead, `lib/retrieval/relationships.ts` resolves both **transitively, through the `Product` both
sides already reference independently** (`KnowledgeItem.productId` and `ProductIntelligence.productId`/
`ProblemProductRelationship.productId` sharing the same value) — no new schema, no duplicated data, and
every such reference is returned with `linkKind: "via-product"` so a caller can tell a real foreign key
apart from an inferred one. Verified live for both directions (Section 9/testing.md).

## The 8-stage pipeline is a real function, not a metaphor

`lib/retrieval/pipeline.ts`'s `runRetrievalPipeline()` implements the frozen order — Query Request →
Permission Validation → Determine Retrieval Scope → Identify Candidate Sources → Retrieve Published
Versions → Filter by Layer A/B/C → Resolve Relationships → Rank Results → Return Structured Retrieval
Result — as discrete, commented, sequential steps inside one function, not scattered logic that happens
to run in the right order by accident. "Filter by Layer A/B/C" is deliberately a **second**, independent
check (stage 6) even though every source fetcher already applies a layer filter to its own Prisma query
(so a filtered-out row is never even fetched) — this is defense-in-depth: a future bug in one fetcher's
`where` clause can never leak content past this stage, because every candidate is re-checked here
regardless of which fetcher produced it.

## Read-only, with one narrow, disclosed exception

Every content read goes through `lib/retrieval/sources.ts`'s fetchers — none of which ever calls
`.create`/`.update`/`.delete`. The one write in this entire module is `KnowledgeRetrievalLog`, a
best-effort telemetry insert that can never throw into the caller's response (its own try/catch
swallows failures, logging them via `lib/logger.ts` instead) — the same distinction this codebase
already draws for `actions/search.ts`'s `logSearch` writing to `SearchQuery` while that whole feature is
otherwise a read path.

## Caching and metrics: interfaces only, as instructed

`lib/retrieval/cache.ts` defines a `RetrievalCache` interface and one `InMemoryRetrievalCache`
implementation, matching this codebase's existing provider-abstraction shape (`lib/shipping/index.ts`,
`lib/messaging/index.ts`) and its existing "in-memory now, Redis later, same interface" precedent
(`lib/rate-limit.ts`). No caching is actually wired into the pipeline yet — the spec asked for
interfaces, not integration ("create caching interfaces only... do not require Redis now"), so
`getRetrievalCache()` exists and is tested in isolation but isn't yet called from
`runRetrievalPipeline()`. Metrics ("Track: Retrieval Count, Cache Hit/Miss, Average Retrieval Time,
Permission Rejections, Source Distribution, Failed Retrievals") are derivable by aggregate query over
`KnowledgeRetrievalLog` — no separate running-counter table was added, since one would just be a second,
sync-risk copy of what the log already records. No `getRetrievalMetrics`-style action was built, since
none is named in this module's own Server Actions list (see [known-limitations.md](./known-limitations.md)).
