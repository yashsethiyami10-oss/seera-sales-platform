# Permissions

## A different RBAC shape from Modules 1–4, on purpose

Modules 1–4 gate most actions at the *function* level — `requireStaff()`/`requireAdmin()` block the call
outright for the wrong role. That's correct for admin CRUD surfaces where every caller is a logged-in
staff member. Knowledge Retrieval Core serves a different population: a future customer-facing AI must
be able to call `retrieveKnowledge()` as a fully anonymous website visitor and get back a safe, correct,
Public-only result — not a 403.

So **none of KRC's 8 actions calls `requireStaff()`/`requireAdmin()`**. Every one is callable by any
caller. Permission is enforced entirely by `resolveCallerClearance()` (`lib/retrieval/permissions.ts`),
which derives the caller's real clearance from the actual session and applies it as a *result* filter,
not a call gate:

| Session role | `maxLayer` | `canAccessNonPublished` |
|---|---|---|
| No session / `CUSTOMER` | `PUBLIC` | `false` |
| `STAFF` | `INTERNAL` | `true` |
| `ADMIN` | `CONFIDENTIAL` | `true` |

This mirrors the exact tiering Modules 1–4 already use internally (STAFF reaches Public+Internal, only
ADMIN reaches Confidential) — reused, not reinvented.

## Layer A/B/C filtering — two independent checks

1. **Query-level**: every source fetcher (`lib/retrieval/sources.ts`) includes `layer: { in:
   allowedLayers(clearance) }` in its own Prisma `where` clause — a disallowed row is never even
   fetched.
2. **Pipeline-level**: `runRetrievalPipeline`'s "Filter by Layer A/B/C" stage re-checks every candidate
   regardless of source, via `layerAllowed()`. Defense-in-depth: a bug in one fetcher's query can never
   leak content past this second, independent check.

Verified live (see `testing.md`): an anonymous caller retrieving a `CONFIDENTIAL` item by its exact slug
got zero results; an admin caller retrieving the same item got exactly one.

## Field-level: `internalMetadata`

Every `RetrievalResult` carries an `internalMetadata` field that is **`null` for any caller without
`canAccessNonPublished`**, regardless of the item's own layer — even a `PUBLIC`-layer result's internal
metadata (e.g. a Knowledge item's `fileType`, a CIF version's `escalationRequired`/`riskPriority`) is
withheld from an anonymous or customer caller. Verified live.

## Version Resolution as a permission concern

`draft`/`review`/`archived`/`history` version-selector modes are only ever honored for a caller with
`canAccessNonPublished`. Requesting one of these modes as an anonymous or customer caller doesn't error
— it's **silently downgraded to `published`**, so the caller gets the real, current published version
back instead of an empty result or an error that would confirm a draft exists. Verified live: an
anonymous request for `mode: "draft"` against an item with both a published v1 and a draft v2 returned
v1 (published), never v2.

## Relationships respect the same boundary

`getKnowledgeRelationships`/`resolveRelationships()` apply the same `allowedLayers(clearance)` filter to
every candidate reference it resolves — a `CONFIDENTIAL` record is never surfaced as a "related item"
to a caller who couldn't retrieve it directly either. Verified live.

## `validateRetrievalScope` as a pre-flight check

Lets a future caller ask "would this scope even be legal for me" without executing a real retrieval —
useful for a caller (e.g. a future Decision Intelligence module) that wants to check before committing.
Returns the caller's actual effective clearance and version selector (downgraded if necessary), never a
raw yes/no divorced from what would actually happen.
