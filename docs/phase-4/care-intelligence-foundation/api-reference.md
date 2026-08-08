# API Reference

All 10 functions below live in `actions/care-intelligence.ts` as Next.js Server Actions (`"use server"`).
Every function validates its input through the matching Zod schema in
`lib/validations/care-intelligence.ts` and independently re-derives its own auth.

| Action | Auth | Request | Response |
|---|---|---|---|
| `createCareIntelligence` | `STAFF`; `ADMIN` if `layer=CONFIDENTIAL` | `{ slug, layer, content: {full nested payload}, changeNote? }` | `{ success, data: { id, slug } }` — `409` on duplicate slug |
| `updateCareIntelligence` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` or if `layer` is present and changes the item's layer | `{ versionId, content: {partial, arrays replace-if-present}, status?: "DRAFT"\|"REVIEW", layer?, changeNote? }` | `{ success, data: { id, status } }` — `400 VERSION_NOT_EDITABLE` unless DRAFT/REVIEW; omitting `status` while currently REVIEW reverts to DRAFT |
| `publishCareIntelligence` | `ADMIN` only | `{ versionId }` | `{ success, data: { status: "PUBLISHED" } }` — `400 INVALID_TRANSITION` unless currently REVIEW |
| `archiveCareIntelligence` | `STAFF` for DRAFT/REVIEW; `ADMIN` for PUBLISHED or `CONFIDENTIAL` items | `{ versionId, reason? }` | `{ success, data: { status: "ARCHIVED" } }` |
| `restoreCareIntelligence` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ careIntelligenceId, archivedVersionId, changeNote? }` | `{ success, data: { id, versionNumber } }` — `400 NOT_ARCHIVED` unless the source is actually ARCHIVED |
| `duplicateCareIntelligence` | `STAFF`; `ADMIN` if item `CONFIDENTIAL` | `{ careIntelligenceId, sourceVersionId?, changeNote? }` | `{ success, data: { id, versionNumber } }` — omitting `sourceVersionId` copies the latest version regardless of status |
| `getCareIntelligence` | `STAFF` | `id: string` | `{ success, data: CareIntelligence & { versions: [...full detail, every layer] } }` |
| `listCareIntelligence` | `STAFF` | `{ page?, pageSize?, layer?, category?, status? }` | `{ success, data: [...], pagination }` |
| `getPublishedCareIntelligence` | none (public) | `{ slug?, category?, segment? }` | `{ success, data: [...] }` — `layer: PUBLIC` + `status: PUBLISHED` hardcoded; curated field selection (see `permissions.md`) |
| `getCareVersionHistory` | `STAFF` | `careIntelligenceId: string` | `{ success, data: CareIntelligenceVersion[] }` (metadata only) |

## What's deliberately not here

No `createCareIntelligenceVersion` and no `submitCareIntelligenceForReview` — both are folded into
`updateCareIntelligence`/`duplicateCareIntelligence`, per this module's own shorter, more consolidated
Server Actions list. No per-child-section `addCareX` actions — `requiredInformation`/`careActions`/
`evidenceSources` are managed as full arrays inside `createCareIntelligence`/`updateCareIntelligence`.
See `architecture.md` for the full reasoning.
