# Enterprise Architecture v3.0 Phase 2 Part 3A — Shared Governance Foundations — FORMAL FREEZE

## 1. Part name

Part 3A — Shared Governance Foundations (the platform-wide substrate Parts 3B, 3C, and 3D are all
built on top of). Filed under the "Business Network" freeze naming convention per this governance
pass's instructions; Part 3A's actual scope is narrower and lower-level than Business Network itself
— see §2.

## 2. Frozen scope

Exactly what `docs/enterprise-phase2/PART_3A_FOUNDATIONS.md` (the pre-existing, unedited
implementation record — read in full during this governance pass, left untouched) describes:

- Organization scoping (`organizationKey`, the repository's authoritative `MUV` organization only).
- Nine server-side feature flags registered through the existing `AiConfiguration` convention,
  seeded disabled.
- Forty-three foundational additive permissions across the Business Network, Finance, and Founder OS
  capability boundaries (grown to 47 as of this freeze — see §6 — through later Parts' own
  legitimate, additive grants into the same namespaces; Part 3A's own foundation code did not change).
- `Phase2Operation` — organization-scoped idempotency, request fingerprints, claim/replay via
  `INSERT ... ON CONFLICT DO NOTHING`, correlation, source linkage, job lifecycle (claim, run,
  complete, fail, retry, stale-running detection).
- `Phase2PolicyVersion` — effective-dated, versioned policy metadata; finalized versions
  database-protected from update/delete.
- `Phase2SourceReference` — immutable, typed provenance evidence; database-protected from
  update/delete.
- `Phase2SodPolicy` — organization-specific maker/checker segregation-of-duties rules, with runtime
  enforcement requiring independently recorded approval evidence and a reason.
- Shared adapters (`PHASE2_WORKFLOW_SUBJECTS`, `PHASE2_NOTIFICATION_EVENTS`) reusing the existing
  audit/timeline/notification mutation helper (`recordEnterpriseMutation`).

No Business Network, Finance, or Founder OS domain record, API, job, or UI is in scope here — those
are Parts 3B/3C/3D, built on top of this foundation, not part of it.

## 3. Architecture baseline

Every externally callable Phase 2 mutation derives its principal and organization server-side,
enforces feature flags and permissions before touching data, validates input, and calls a Business
Service inside the shared serializable transaction helper (`lib/enterprise/governance.ts`). UI and
route handlers never write through Prisma directly. Only the correlation owner returned with
`acquired: true` may perform a material job effect; replay callers receive the existing operation and
result state — verified live in this pass (`expectRejected` cases for direct provenance/policy
mutation, both still database-rejected).

## 4. Authoritative services

`lib/enterprise-phase2/foundation.ts` (idempotency claim/replay, SoD enforcement, organization
checks) and `lib/enterprise-phase2/adapters.ts` (workflow/notification allowlists). Every one of
Parts 3B/3C/3D's own services calls into this foundation rather than reimplementing any of it —
confirmed by direct inspection of `lib/enterprise-network/*.ts` and prior sessions' verification of
`lib/enterprise-finance/*.ts` and `lib/founder-os/*.ts`.

## 5. Data models and migrations

`Phase2Operation`, `Phase2PolicyVersion`, `Phase2SourceReference`, `Phase2SodPolicy` — four additive
tables. Two migrations: `20260727120000_enterprise_phase2_part3a_foundations` (creates the four
tables, indexes, deterministic uniqueness constraints, effective-date checks, and immutability
triggers — no drops) and `20260727120100_enterprise_phase2_provenance_key_alignment` (normalizes the
provenance key's optional event portion, aligns its unique index with Prisma's field-based model — no
drops). Both re-confirmed additive in this pass by direct regex inspection (no `DROP TABLE`/`DROP
COLUMN`).

## 6. Permissions

47 permissions across the `network.*`/`finance.*`/`founder_os.*` namespaces this foundation
provisions for, confirmed live in this pass (was 43 at Part 3A's own completion; Part 3D Stage 1 and
Stage 4 each later added their own genuinely new keys into the same pre-provisioned namespace — a
documented, legitimate count growth, not a Part 3A change). Founder holds every one; Sales Manager,
Sales Officer, Institutional Sales Officer, and Customer Support hold none — confirmed live.

## 7. Security and isolation model

Every foundation record is scoped by trusted `organizationKey`, resolved server-side, never from
client input. `Phase2SodPolicy` enforcement requires an independently recorded approval and a reason
— no Founder bypass is configured in any policy. Immutability is enforced at the database level
(triggers), not only in application code — re-verified live in this pass.

## 8. Tests and validation counts

`__tests__/enterprise-phase2/foundations.integration.test.ts` and `foundations.test.ts` — part of the
23/23 passing tests across `__tests__/enterprise-phase2/` confirmed live in this governance pass.
`npx tsc --noEmit` clean. `npm run build` clean.

## 9. Verifier results

`scripts/verify-enterprise-phase2-part3a.cjs`: **27/27 passed**, re-run live in this governance pass
(models present, migration additive, both immutability triggers present, foundation service checks,
47 permissions seeded and correctly scoped to Founder only, 9 feature flags seeded and disabled, four
live database-rejection checks against direct provenance/policy mutation).

## 10. Known non-blocking limitations

None specific to Part 3A's own foundation code. It inherits no defect from later Parts (foundation
code is not modified by anything built on top of it — confirmed by the verifier's own live checks
still passing unchanged after Parts 3B/3C/3D were built).

## 11. Explicitly deferred UI scope

No UI, API route, or presentation layer for any Phase 2 capability is in scope for Part 3A (or any of
3B/3C/3D). Confirmed via direct repository search: zero references to `enterprise-phase2`,
`enterprise-network`, `enterprise-finance`, or `founder-os` exist anywhere under `app/` or
`components/`.

> UI integration is authorized as a separate presentation and orchestration layer and must reuse the
> frozen backend without duplicating business logic.

## 12. Change-control policy

After freeze, changes are permitted only for: confirmed bug fixes, security fixes, data-integrity
fixes, legal/compliance requirements, measured performance fixes, explicitly authorized versioned
upgrades, and UI integration that reuses existing services without changing frozen business rules. No
silent redesign. No duplicate business logic. No schema change without explicit authorization. No
permission weakening. No direct UI-side reimplementation of backend calculations.

## 13. Freeze date

This governance verification pass (Enterprise Architecture v3.0 Phase 2 Governance Verification and
Formal Backend Freeze Pass).

## 14. Freeze status

**FORMALLY FROZEN.** Decision: B — no prior explicit freeze declaration existed for Part 3A; this
document is that declaration, based on live, repository-first re-verification (not a re-statement of
a prior claim).
