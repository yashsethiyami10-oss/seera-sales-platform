# Retrieval Pipeline

Implemented in `lib/retrieval/pipeline.ts`'s `runRetrievalPipeline()`, in this exact, frozen order:

```
Query Request
  ↓
Permission Validation
  ↓
Determine Retrieval Scope
  ↓
Identify Candidate Sources
  ↓
Retrieve Published Versions
  ↓
Filter by Layer A/B/C
  ↓
Resolve Relationships
  ↓
Rank Results
  ↓
Return Structured Retrieval Result
```

## Stage by stage

1. **Query Request** — the caller's `RetrievalContext` (id/slug/tags/keywords/category/product-ref/
   problem-ref/care-ref/sourceTypes/versionSelector/limit), already Zod-validated by the calling action
   before `runRetrievalPipeline` is ever invoked.
2. **Permission Validation** — `resolveCallerClearance()` derives the caller's real clearance from the
   actual session (`lib/auth.ts`'s `auth()`), never from anything the client sent. This is a
   request-level gate: it decides *who is asking*, before any content is touched.
3. **Determine Retrieval Scope** — resolves `sourceTypes` (defaults to all four) and `limit` (capped at
   50, defaults to 10) — "retrieve only the minimum, most relevant... knowledge required."
4. **Identify Candidate Sources** — one fetcher per source type (`lib/retrieval/sources.ts`), run in
   parallel via `Promise.allSettled` so one source type failing doesn't take down the others (see
   Outcome below).
5. **Retrieve Published Versions** — each fetcher applies Version Resolution rules internally
   (`statusesFor()`): defaults to the current published version; `draft`/`review`/`archived`/`history`
   modes are honored only for a caller whose clearance allows non-published access, silently downgraded
   to `published` otherwise (never an error, never a leak — verified live).
6. **Filter by Layer A/B/C** — a **second**, independent filter over every candidate, regardless of
   which fetcher produced it or what that fetcher's own query already excluded. Defense-in-depth, not
   redundancy: see `architecture.md`.
7. **Resolve Relationships** — optional (`resolveRelationshipsForTop`), capped to the top N ranked
   candidates specifically to avoid an N+1 explosion on a large result set; `rankKnowledge`/`searchKnowledge`
   skip this stage entirely (0), `retrieveKnowledge`/`getPublishedKnowledge`/`resolveKnowledge` request it.
8. **Rank Results** — `lib/retrieval/ranking.ts`'s deterministic scorer (see `ranking.md`), then sliced
   to the requested `limit`.
9. **Return Structured Retrieval Result** — the normalized `RetrievalResult[]` shape (see
   `api-reference.md`), plus a best-effort telemetry write to `KnowledgeRetrievalLog` (logged, never
   thrown, even on failure — see `architecture.md`).

## Outcome classification

Recorded on every log row:

| Outcome | Meaning |
|---|---|
| `SUCCESS` | At least one result returned, no source type failed |
| `PARTIAL` | At least one source type's fetch failed, but at least one other succeeded |
| `EMPTY` | Every requested source type was queried successfully; nothing matched |
| `ERROR` | Every requested source type failed, or an exception escaped the pipeline entirely |

## What this pipeline does not do

Nothing here generates a response, makes a recommendation, or runs a safety check — it returns
structured data for a *future* module to act on. No stage performs semantic search, calls an LLM, or
scores relevance with anything other than the deterministic weights in `ranking.md`.
