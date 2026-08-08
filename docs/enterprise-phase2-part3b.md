# Enterprise Architecture v3.0 — Phase 2 Part 3B

Part 3B adds the Enterprise Business Network as an additive, feature-flagged domain. It reuses the frozen authentication, organization context, RBAC, serializable Business Service transactions, Part 3A idempotency and segregation-of-duties controls, workflow evidence, audit, timeline, notifications, order pipeline, inventory ledger, reporting conventions, and advisory AI boundary.

The domain provides a single partner master for franchise, distributor, super stockist, dealer, outlet, and institutional partner records. Partner lifecycle, onboarding readiness, effective-dated hierarchy and territory, versioned agreements and policy applicability, deterministic royalty and commission runs, targets, claims, support, training, compliance, and trusted portal user mappings are organization-scoped.

Paid orders participate in royalties, commissions, and targets only through `NetworkPartnerOrderSource`. Each immutable attribution identifies its organization, partner, order, metric, territory when applicable, amount, effective time, and source version. Calculation snapshots retain the exact attribution identifiers and versions; platform-wide order totals are never copied to every partner.

Finalized agreements and calculation runs are not edited in place. Agreement amendments create a linked draft successor and permit only the governed `SUPERSEDED` linkage on the prior version. Royalty and commission corrections create idempotent negative reversal successors while leaving the finalized source run unchanged. Results retain policy versions, calculation traces, source snapshots, and finance-ready references but do not create ledgers, journals, postings, payments, tax, Finance, Founder OS, or Part 3C/3D behavior.

Database triggers reject updates/deletes of finalized agreements, royalty runs, commission runs, claims, target plans, completed training history, and decided compliance history. Organization-integrity triggers independently reject parent/child organization mismatches. Partner creation and material master updates append immutable Part 3A source provenance.

Hierarchy and territory services support effective-dated assignment closure, reassignment primitives, and historical/traversal queries. Claims support partial approval amounts. Support cases have governed assignment-through-closure transitions. Training provides program versions, assignments, evidence-backed completion, certification references, and renewal dates. Compliance provides requirement versions, training prerequisites, reviewed records, and expiry processing. Portal administration requires `network.partner_portal.admin`; portal reads additionally require an active trusted user-to-partner mapping and reject arbitrary partner IDs.

The database-backed integration suite invokes actual Business Services for partner attribution, target derivation, hierarchy and territory history, agreement supersession, calculation correction/replay/concurrency, partial claims, support, training, compliance, portal isolation, organization-integrity triggers, and finalized-record protection.

Both `ENTERPRISE_BUSINESS_NETWORK_ENABLED` and `ENTERPRISE_PARTNER_PORTAL_ENABLED` remain disabled by default. The network AI adapter emits advisory context only and cannot mutate records or bypass Business Services.
