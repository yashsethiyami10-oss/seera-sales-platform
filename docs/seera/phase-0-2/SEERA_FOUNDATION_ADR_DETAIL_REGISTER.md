# Foundation ADR Detail Register

These details are frozen for Phase 1 unless marked later-phase.

| ADR | Foundation-critical resolution | Later-phase details |
|---|---|---|
| AD-001 | `User` remains globally unique by normalized email and grants no Seera authority. `OrganizationMembership` unique `(organizationId,userId)`, statuses `INVITED/ACTIVE/SUSPENDED/REVOKED`; many memberships/user; many role assignments/membership. No global Founder business bypass. Invitation inactive until acceptance. User deletion is soft/deactivation; membership removal increments authority version and invalidates context immediately. Existing MUV auth/roles stay unchanged behind MUV adapter. | Invitation UX, external partner onboarding |
| AD-002 | Active org comes from server-validated signed context plus live membership. Seera routes require explicit context; no hidden fallback. Switching is audited/CSRF-protected. Default only when exactly one active membership; otherwise selection required. API/actions/jobs/background tasks receive validated org explicitly. Org is mandatory in cache/export keys. | Subdomain UX, remembered preference |
| AD-003 | Phase 1 adds foundation tables only and does not add org FK to legacy MUV business tables. Existing MUV models classify as MUV-owned behind compatibility adapter; identity is global; new foundation is shared. MUV organisation metadata is created without row backfill. Any later model backfill uses nullable expand→validate→enforce, per-model transactions, count/orphan checks and reverse migration. Existing sequences untouched. | Later shared-enterprise classification/backfills |
| AD-004 | New `BusinessParty` and typed profile tables, always org-owned; do not extend/delete Customer. Optional explicit `LegacyCustomerPartyLink` adapter later. A party may have multiple profiles. Codes unique per org/type; GST/mobile are indexed match signals, not automatic cross-org unique identity. | Retailer/distributor fields in Phase 2 |
| AD-005 | New isolated `SeeraCommercialOrder`; existing MUV Order/BusinessOrder unchanged. Adapter boundary is read-only/shared primitives only. Explicit buyer/seller/fulfilment/billing/delivery party IDs, typed order category, source/assisted attribution, Seera sequence, immutable tax/price/scheme snapshots and independent states. | Business workflows Phase 3–5 |
| AD-006 | New append-only Seera item event table with ordered baseline and `ACCEPTED/ALLOCATED/DISPATCHED/DELIVERED/REFUSED/RETURNED/CANCELLED/REVERSED` events, idempotency and reversal links. Net eligible = delivered less refused/approved return/reversal as governed by event semantics; never header status. | Proof vocabulary and incentive policy |
| AD-007 | New Seera finance book/account mapping layer; existing MUV finance tables are not touched in Phase 1. Any future shared finance reuse is through org-explicit adapter and separate accounts/journals/sequences/exports. No default MUV key. | Ledger/payment integration Phase 6 |
| AD-008 | Start/End Day required; points accepted only during active session/visit. Initial interval policy configurable, not frozen in schema. Precise raw GPS 90 days provisional; visit coordinates follow approved business/audit retention. Raw access limited/audited; employee sees own route and disputes; TA uses estimate pending manager approval; retention/deletion jobs are org-scoped. | Exact interval, legal retention and TA rates Phase 3/7 |

## Foundation invariant

No foundation record may be silently assigned to MUV. A caller without explicit validated organisation context is denied on Seera paths. Existing MUV paths continue using existing authority until a separately proven migration.

