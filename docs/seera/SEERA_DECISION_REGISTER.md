# Seera Architecture Decision Register

Last reviewed: 2026-08-08

| ID | Decision | Status | Consequence |
|---|---|---|---|
| ADR-001 | Seera is an independent application, repository, database, auth realm, deployment, and business entity. | Accepted | Prior shared-MUV/multi-entity design is superseded. |
| ADR-002 | MUV is read-only reference; reuse is copy-and-adapt inside Seera with no runtime link. | Accepted | No imports, symlinks, migrations, tests, builds, or credentials may cross the boundary. |
| ADR-003 | V1 uses a modular monolith with explicit domain services and transactional boundaries. | Accepted | Faster correctness and deployment; module contracts preserve future extraction. |
| ADR-004 | Authorization combines permission grants with effective-dated data scopes and lifecycle state. | Accepted | Role name alone never authorizes access. |
| ADR-005 | Business parties use a governed party root with specialized company/S.S./distributor/retailer profiles. | Accepted | Legal identity and relationships remain historical and auditable. |
| ADR-006 | Commercial orders use explicit buyer/seller/source plus immutable item commercial snapshots. | Accepted | Historical price, scheme, tax, and attribution do not drift. |
| ADR-007 | Item-level append-only fulfilment events are authoritative for delivered sales. | Accepted | Booked order headers cannot inflate performance. |
| ADR-008 | Finance uses balanced append-only journals with reversal/counter-entry corrections. | Accepted | Settled financial history cannot be silently edited. |
| ADR-009 | Payment proof is an unverified claim until Accounts review and allocation. | Accepted | Upload never marks an order paid. |
| ADR-010 | Billing is optional; generated and externally uploaded documents coexist. | Accepted | Operations are not blocked by portal invoice generation. |
| ADR-011 | Issued documents retain immutable seller/buyer/tax snapshots and governed sequences. | Accepted | Later profile changes cannot rewrite history. |
| ADR-012 | Private object storage and expiring/revocable audited access are mandatory for protected files. | Accepted | No permanent public financial-document URLs. |
| ADR-013 | Internal notification inbox is durable; email/WhatsApp are optional adapters. | Accepted | Provider failure cannot become business-data failure. |
| ADR-014 | Offline writes use client command IDs, idempotent replay, and explicit conflict states. | Accepted | Network retry cannot duplicate orders or visits. |
| ADR-015 | GPS is purpose-bound to approved work states and configurable retention. | Accepted in principle; policy pending | Legal/privacy policy is required before implementation. |
| ADR-016 | Architecture first, isolated infrastructure second, implementation third. | Accepted | Phase 1 remains blocked until Founder confirms the setup checklist. |
| ADR-017 | AI is optional and non-authoritative; Phase 10 starts with deterministic intelligence. | Accepted | Core correctness remains explainable and auditable. |
| ADR-018 | Forward migrations only; production-significant changes require test rehearsal, backup, and rollback runbook. | Accepted | Deployed migrations are never rewritten to hide errors. |
| ADR-019 | Copied MUV migrations are immutable reference archives outside Prisma’s active path; Seera starts a clean migration history. | Implemented in Block 1 | A fresh Seera database cannot receive copied MUV migrations through the active path. |
| ADR-020 | Database-changing tooling runs only through exact-target fail-closed guards; Phase 1 migrations target the isolated test identity first. | Implemented in Block 2 | Production, unknown, fallback, equal and MUV targets cannot receive guarded test writes. |
| ADR-020 | Copied MUV routes and Prisma-writing scripts are preserved outside active runtime paths until selectively adapted. | Implemented in Block 1 | Clean schema transition does not require mass deletion or continued MUV model compilation. |
| ADR-021 | Phase 1 portal shells fail closed until independent authentication and permission enforcement exist. | Implemented in Block 1 | Route ownership is prepared without granting premature access. |

## Superseded decisions

All Phase 0/0.1/0.2 documents that recommend organisation-scoped Seera tables, shared identity, MUV backfill, or shared finance inside the MUV application are retained as historical records but are superseded by ADR-001 and ADR-002.
