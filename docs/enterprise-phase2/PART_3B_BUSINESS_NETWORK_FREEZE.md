# Enterprise Architecture v3.0 Phase 2 Part 3B — Business Network Governance and Commercial Extensions — FORMAL FREEZE

**Governance note on documentation:** no dedicated Part 3B implementation report exists anywhere in
`docs/enterprise-phase2/` (confirmed by direct directory listing during this governance pass — only
`PART_3A_FOUNDATIONS.md` and the Part 3C/3D documents exist). This freeze document is therefore the
first and only authoritative written record of Part 3B's scope; it was reconstructed from direct
source, schema, migration, seed, test, and verifier inspection, not from a prior narrative report.
That reconstruction is what follows.

## 1. Part name

Part 3B — Business Network Governance and Commercial Extensions.

## 2. Frozen scope

Built on Part 3A's frozen foundation (organization scoping, `Phase2Operation` idempotency,
`Phase2SodPolicy` segregation of duties, `Phase2SourceReference` provenance, shared audit/timeline
mutation helper). Confirmed present via direct source inspection:

- **Partner lifecycle**: `NetworkPartner` with a fixed lifecycle graph (`DRAFT → ONBOARDING →
  PENDING_REVIEW → PENDING_APPROVAL → APPROVED → ACTIVE → SUSPENDED/INACTIVE/TERMINATED → ARCHIVED`),
  transitions validated against the graph (`assertTransition`), terminated/archived partners
  immutable. Partner types: `FRANCHISE`, `DISTRIBUTOR`, `SUPER_STOCKIST`, `DEALER`, `OUTLET`,
  `INSTITUTIONAL_PARTNER`.
- **Onboarding**: `NetworkOnboardingCase`/`NetworkOnboardingRequirement`, requirement-by-requirement
  review, readiness derived from all required items being `VERIFIED` before a partner may be
  approved.
- **Hierarchy and territory**: `NetworkPartnerHierarchy` with cycle prevention (`wouldCreateCycle`),
  `NetworkTerritory`/`NetworkTerritoryAssignment`.
- **Agreements**: `NetworkAgreement`, versioned, with its own lifecycle graph (`DRAFT → UNDER_REVIEW
  → PENDING_APPROVAL → APPROVED → PENDING_EXECUTION → ACTIVE → EXPIRED/TERMINATED/SUPERSEDED`).
  Approval requires segregation-of-duties enforcement (`enforceSegregationOfDuties`) — the preparer
  cannot also approve. Finalized agreements are edit-immutable; amendment creates a new successor
  version and supersedes the current one (`amendAgreement`), never an in-place edit.
- **Commercial calculations**: royalty (`NetworkRoyaltyRun`/`NetworkRoyaltyLine`) and commission
  (`NetworkCommissionRun`/`NetworkCommissionLine`) engines, `FIXED`/`PERCENTAGE`/`TIERED` calculation
  modes with minimum/cap support (`calculateCommercialAmount`), idempotent via
  `Phase2Operation`-backed claims (`claimOperation`), each run's inputs hashed and snapshotted
  (`sourceSnapshotHash`) rather than trusted implicitly.
- **Partner attribution**: `NetworkPartnerOrderSource` — every commercial calculation and target
  achievement figure is attributed to a real, provenance-recorded order source
  (`networkPartnerOrderSource.findMany`), not an unattributed aggregate.
- **Targets and claims**: `NetworkTargetPlan`/`NetworkTargetLine` (achievement derivation),
  `NetworkClaim` with an approval flow including a `PARTIALLY_APPROVED` outcome.
- **Support, training, compliance**: `NetworkSupportCase` (with status transitions),
  `NetworkTrainingProgram`/`NetworkTrainingAssignment` (`completePartnerTraining`),
  `NetworkComplianceRequirement`/`NetworkComplianceRecord` (`processExpiredCompliance`).
- **Partner portal**: `NetworkPartnerUser` mapping, `requirePortalPrincipal`/
  `requirePortalAdminPrincipal` gating, separate from staff-side network permissions.
- **Inventory integration**: reuses the authoritative warehouse ledger (`warehouseBalance`) rather
  than a second inventory calculation.
- **AI boundary**: `lib/enterprise-network/ai-adapter.ts` is advisory-only by construction
  (`advisoryOnly: true`, `mutationAllowed: false`) — confirmed live, not merely documented.

## 3. Architecture baseline

Same pattern as every other frozen Part in this Phase: Zod validation → `requireNetworkPrincipal`
(feature-flag + permission check, server-derived organization) → `enterpriseTransaction` (Serializable)
→ optimistic-concurrency version check on mutable masters → `recordEnterpriseMutation` for
audit/timeline evidence. Confirmed by direct reading of `partner-service.ts` and
`governance-service.ts` this pass (`createPartner`, `updatePartner`, `transitionPartner`,
`createAgreementVersion`, `transitionAgreement`, `amendAgreement` all follow this shape exactly, with
no exception found).

## 4. Authoritative services

`lib/enterprise-network/partner-service.ts`, `governance-service.ts`, `commercial-service.ts`,
`attribution-service.ts`, `enablement-service.ts`, `operations-service.ts`, `integration-service.ts`,
`ai-adapter.ts`, `policy-service.ts`, `context.ts`, `domain.ts`, `schemas.ts`.

## 5. Data models and migrations

25 `Network*` models in `prisma/schema.prisma` (confirmed by direct count this pass). Four
migrations: `20260727130000_enterprise_phase2_part3b_business_network` (base schema),
`20260727131000_enterprise_phase2_part3b_remediation` (adds
`prevent_finalized_network_mutation`/`enforce_network_parent_organization` database triggers),
`20260727132000_enterprise_phase2_part3b_agreement_supersession`,
`20260727133000_enterprise_phase2_part3b_child_immutability` (adds
`network_order_sources_immutable`/`network_royalty_lines_immutable` triggers). No Finance
architecture (`NetworkGeneralLedger`/`NetworkJournal`) leaked into Part 3B — verified structurally,
matching this Part's own boundary discipline (commercial calculations reference Finance concepts but
never implement ledger/journal logic themselves).

## 6. Permissions

15 `network.*` permissions confirmed present in `prisma/seed.ts` and in
`lib/sales/constants.ts`: partners (view/manage/approve onboarding), territories, agreements
(manage/approve), commercial policies, royalties (manage/approve), commissions (manage/approve),
claims (manage/approve), analytics view, partner-portal admin.

## 7. Security and isolation model

Organization-scoped throughout (`requireNetworkPrincipal` → `requireOrganization`). Feature-flag
gated: `ENTERPRISE_BUSINESS_NETWORK_ENABLED` and `ENTERPRISE_PARTNER_PORTAL_ENABLED`, both seeded
disabled — confirmed live in this pass (`verify-enterprise-phase2-part3b-db.cjs` output:
`{"flags":[{"key":"ENTERPRISE_BUSINESS_NETWORK_ENABLED","value":{"enabled":false}},{"key":"ENTERPRISE_PARTNER_PORTAL_ENABLED","value":{"enabled":false}}]}`).
Segregation of duties enforced on agreement approval and partner onboarding approval (the preparer
cannot approve their own record). Database-level immutability on finalized agreements, order sources,
and royalty lines — not application-trust-only. Partner portal access requires an active
`NetworkPartnerUser` mapping to an `ACTIVE` partner, re-checked server-side on every portal call, not
inferred from a prior check.

## 8. Tests and validation counts

`__tests__/enterprise-phase2/business-network.test.ts` and `business-network.integration.test.ts` —
part of the 23/23 passing tests across `__tests__/enterprise-phase2/` confirmed live in this pass. The
integration suite exercises real Business Services and database controls, including
`calculateCommercialRun` and `deriveTargetAchievement` against real attribution data (confirmed by
the verifier's own check that this exact coverage exists in the test file, not merely asserted in
prose). `npx tsc --noEmit` clean. `npm run build` clean.

## 9. Verifier results

`scripts/verify-enterprise-phase2-part3b.cjs`: **69/69 checks passed**, re-run live in this pass.
`scripts/verify-enterprise-phase2-part3b-db.cjs`: live database check, re-run this pass — 6
network SoD policies seeded, both feature flags confirmed disabled, 0 seeded business partners
(correct and expected — no real partner data exists pre-launch; this is a backend platform, not yet
populated with production records).

## 10. Known non-blocking limitations

Zero seeded/production `NetworkPartner` records exist — expected for an unlaunched backend platform,
not a defect. No UI, API route, or partner-portal front end exists — see §11.

## 11. Explicitly deferred UI scope

No UI, API route, or presentation layer exists for any Business Network capability, including the
partner portal itself. Confirmed via direct repository search: zero references to
`enterprise-network` anywhere under `app/` or `components/`.

> UI integration is authorized as a separate presentation and orchestration layer and must reuse the
> frozen backend without duplicating business logic.

## 12. Change-control policy

Identical to Part 3A's (§12 of that document): confirmed bug fixes, security fixes, data-integrity
fixes, legal/compliance requirements, measured performance fixes, explicitly authorized versioned
upgrades, and UI integration reusing existing services only. No silent redesign, no duplicate business
logic, no schema change without explicit authorization, no permission weakening, no direct UI-side
reimplementation of backend calculations (in particular: any future partner portal or admin UI must
call `commercial-service.ts`'s calculation functions, never reimplement
`calculateCommercialAmount`/tiered-rate logic client-side or in a new service).

## 13. Freeze date

This governance verification pass (Enterprise Architecture v3.0 Phase 2 Governance Verification and
Formal Backend Freeze Pass).

## 14. Freeze status

**FORMALLY FROZEN.** Decision: B — no prior freeze declaration or dedicated implementation document
existed for Part 3B; this document is both the first authoritative record and the freeze declaration,
based on live, repository-first re-verification.

## 15. Addendum — commerce number trigger remediation (test fixture gap closed)

During the Enterprise UI Integration pass, `business-network.integration.test.ts`'s `beforeAll` could
not create a deterministic, test-owned `Order` fixture (it depended on `findFirst` against accumulated
dev data instead, per §8's original wording). Attempting to fix that surfaced a genuine, unrelated,
pre-existing production-risk bug — not in any Part 3B object — in the shared
`assign_commerce_numbers()` trigger function from `20260727060000_commerce_operations_v2` (Commerce/
Part 1 domain, outside Part 3B's own frozen scope). Full root cause, fix, and evidence:
`docs/enterprise-phase2/COMMERCE_NUMBER_TRIGGER_REMEDIATION.md`. Once fixed
(`20260801100000_commerce_number_trigger_remediation`), the fixture was completed as originally
intended: a real Customer/Address/Order created and torn down per test run. All 6 previously-failing
integration tests in this suite now pass — re-run live: `__tests__/enterprise-phase2/` is `23/23`
passing (the same total §8 already counted; those 6 tests were previously erroring inside that total,
not absent from it). No Part 3B model,
service, permission, or migration was touched by this addendum; only the test's own fixture setup
changed, and the fix that unblocked it lives entirely outside Part 3B's frozen scope.
