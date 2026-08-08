# API Reference

All 8 functions below live in `actions/retrieval.ts` as Next.js Server Actions (`"use server"`). Every
one validates its input through the matching Zod schema in `lib/validations/retrieval.ts`. **None calls
`requireStaff()`/`requireAdmin()`** — see `permissions.md` for why; every action is callable by any
caller, with results filtered by that caller's real, server-derived clearance.

| Action | Request | Response |
|---|---|---|
| `retrieveKnowledge` | `RetrievalContext` (at least one of `knowledgeId`/`slug`/`tags`/`keywords`/`category`/`productId`/`problemIntelligenceId`/`careIntelligenceId` required) | `{ success, data: { results: RetrievalResult[], clearance } }` — full pipeline, relationships resolved for top 5 |
| `searchKnowledge` | Same as above, `keywords` required | Same shape — full pipeline, relationships not resolved (pure keyword scan) |
| `resolveKnowledge` | `{ sourceType, recordId? \| slug?, versionSelector? }` | `{ success, data: { result: RetrievalResult \| null, clearance } }` — a single definite lookup, no ranking |
| `getKnowledgeHistory` | `{ sourceType, recordId }` | `{ success, data: { versions: [...], clearance } }` — every version the caller's clearance allows (just the current published one for a non-staff caller) |
| `getPublishedKnowledge` | Same shape as `retrieveKnowledge` | Same shape — `versionSelector` forced to `"published"` server-side regardless of input |
| `getKnowledgeRelationships` | `{ sourceType, recordId }` | `{ success, data: { references: SourceReference[], clearance } }` — structured references only, never full content |
| `validateRetrievalScope` | `{ sourceTypes?, versionSelector? }` | `{ success, data: { valid, reason?, effectiveClearance, effectiveSourceTypes, effectiveVersionSelector } }` — no retrieval executed |
| `rankKnowledge` | `{ results: RetrievalResult[], context? }` | `{ success, data: { results: RetrievalResult[] } }` — re-ranks a pre-fetched set; touches no database |

## The `RetrievalResult` shape

```ts
{
  sourceType: "KNOWLEDGE" | "PRODUCT_INTELLIGENCE" | "PROBLEM_INTELLIGENCE" | "CARE_INTELLIGENCE";
  recordId: string;
  versionId: string | null;
  title: string;
  summary: string | null;
  layer: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL";
  versionNumber: number | null;
  status: string | null;
  priorityScore: number;
  relationship: string | null;
  matchedFields: string[];
  confidence: number;        // deterministic 0–100, see ranking.md
  retrievedAt: string;       // ISO timestamp
  sourceReferences: { type; id; label?; linkKind: "direct" | "via-product" }[];
  internalMetadata: Record<string, unknown> | null;  // null for non-staff callers
}
```

## Version selector

```ts
{ mode: "published" | "latest" | "specific" | "draft" | "review" | "archived" | "history"; versionId?: string }
```

`versionId` is required (and validated) only when `mode === "specific"`.
