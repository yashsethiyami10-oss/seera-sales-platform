# Enterprise Architecture v3.0 Phase 2 — Part 3A

Part 3A adds shared governance foundations only. Business Network, Finance, and
Founder OS domain records, APIs, jobs, and user interfaces remain deferred.

## Implemented foundations

- All records are scoped by trusted `organizationKey`; Phase 2 validation accepts
  the repository's authoritative `MUV` organization only.
- Nine server-side feature flags are registered through the existing
  `AiConfiguration` convention and default to disabled.
- Forty-three additive permissions cover the frozen Business Network, Finance,
  and Founder OS capability boundaries. The existing seed grants them only to
  Founder; current operational and sales roles retain their prior grants.
- `Phase2Operation` provides organization-scoped idempotency, request
  fingerprints, safe status/result references, correlation, and source linkage.
  Claims use `INSERT ... ON CONFLICT DO NOTHING`, so duplicate recovery never
  queries through an aborted transaction. The original correlation identifier
  distinguishes the claim owner from replay callers.
- `Phase2PolicyVersion` provides effective-dated, explicitly versioned policy
  metadata. Finalized versions are protected from update/delete by the database.
- `Phase2SourceReference` provides immutable, typed provenance evidence.
- `Phase2SodPolicy` registers organization-specific maker/checker rules.
  Runtime enforcement loads the active organization/operation policy, verifies
  trusted Founder or permission authority, requires independently recorded
  approval evidence and a reason, and emits shared audit and timeline evidence.
- Shared adapters allowlist future workflow subjects and notification events,
  while reusing the existing audit, timeline, and notification mutation helper.
- The job boundary is organization-scoped, idempotent, fingerprinted, and
  transaction-backed. It supports claim/replay, running, completion, failure,
  retry, stale-running detection, correlation, and result references. No queue
  or future domain job has been implemented.

## Service and transaction rules

Externally callable Phase 2 mutations must derive their principal and
organization on the server, enforce feature flags and permissions, validate
input, and call a Business Service. Critical writes use the existing serializable
transaction helper. UI and route handlers may not write through Prisma directly.
Only the correlation owner returned with `acquired: true` may perform a material
job effect; replay callers receive the existing operation and result state.

## Migration and seed behavior

Migration `20260727120000_enterprise_phase2_part3a_foundations` creates four
additive tables, indexes, deterministic uniqueness constraints, effective-date
checks, and immutability triggers. It contains no drops or production data
rewrites. Migration
`20260727120100_enterprise_phase2_provenance_key_alignment` normalizes the
optional event portion of the provenance key to an empty canonical value and
aligns its unique index with Prisma's field-based model; it drops no table or
column. Seeds upsert definitions and do not create financial or commercial
history.

## Verification

Run:

```text
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npx vitest run
npx tsc --noEmit
npm run build
node scripts/verify-enterprise-phase2-part3a.cjs
```

The database integration suite
`__tests__/enterprise-phase2/foundations.integration.test.ts` exercises actual
sequential and concurrent claims, fingerprint conflicts, job lifecycle, policy
loading, trusted SoD overrides, approval evidence, audit, and timeline writes.

## Deferred scope

Part 3B retains complete Business Network implementation, including partner,
territory, agreement, commercial policy, royalty, commission, target, claim,
and partner-portal domains. Part 3C retains all Finance masters, posting, ledger,
receivables, payables, expenses, banking, tax, valuation, statements, and close.
Part 3D retains Founder Command Center, health score, alerts, strategic decisions,
workspace, and governed executive AI intelligence. No placeholder route or UI
for these domains is exposed by Part 3A.
