# Seera V1 Requirements Register

Baseline: Founder Master Development Constitution, received 2026-08-08  
Status vocabulary: Planned, Implemented, Verified, Blocked, Deferred with explicit approval, Rejected with Founder approval.

Architecture locations refer to `SEERA_MASTER_ARCHITECTURE.md` unless otherwise stated. Implementation and test evidence must replace `TBD` during the owning phase; no row may silently disappear.

| ID | Phase | Requirement | Architecture location | Planned verification | Status |
|---|---:|---|---|---|---|
| SR-001 | 1 | Seera is fully independent; MUV remains read-only reference with zero runtime/data coupling. | §§1–2; phase-1/block-1 | Isolation scan and DB fingerprint guard | Verified |
| SR-002 | 1 | Independent Git, app identity, auth realm, schema, migrations, databases, deployment, secrets, files, logs, and backups. | §§1–5, 8, 16 | Infrastructure gate and foundation tests | Blocked |
| SR-003 | 1 | Architecture precedes infrastructure and implementation; credentials are never fabricated. | §19; infrastructure checklist | Founder handoff confirmation | Verified |
| SR-004 | 1–11 | Preserve the exact frozen 11-phase names, order, boundaries, and milestones. | Frozen roadmap; §17 | Phase register audit | Verified |
| SR-005 | 1–11 | Each phase follows requirements-through-verdict lifecycle and freezes only on complete evidence. | Frozen roadmap; readiness report | Phase acceptance audit | Planned |
| SR-006 | 1 | Support employee hierarchy, separate Accounts function, distribution hierarchy, and territory assignments. | §§6–7 | RBAC/scope tests | Planned |
| SR-007 | 1 | Support all 15 base roles through governed permissions, not scattered role checks. | §6 | Role/permission matrix | Planned |
| SR-008 | 1–9 | Access depends on permission plus territory, hierarchy, party assignment, ownership, relationship, and lifecycle. | §6 | Cross-scope adversarial suite | Planned |
| SR-009 | 3 | Mobile field home shows attendance, beat, retailers, progress, targets, booked/delivered sales, collections, delivery, reminders, instructions, and next retailer. | §§9, 11 | 30–40-call usability workflow | Planned |
| SR-010 | 3 | Start Day records time, GPS/accuracy, permitted device context, beat/territory, and permission state; no pre-start tracking. | §§7, 9, 12 | GPS state tests | Planned |
| SR-011 | 3 | Retailer check-in supports selection/onboarding, GPS/time, history, visit, permitted edits, order, collection, no-order, intelligence, follow-up, checkout. | §9 | End-to-end visit tests | Planned |
| SR-012 | 2 | Retailer master captures complete identity, contact, tax, address, GPS, commercial, assignment, lifecycle, KYC, media, activity, and outstanding data. | §7 | CRUD, authorization, history tests | Planned |
| SR-013 | 2 | Duplicate detection considers mobile, GSTIN, retailer code, nearby GPS, and normalized shop name without unsafe auto-merge. | §7 | Duplicate/matching tests | Planned |
| SR-014 | 3 | Controlled visit outcomes include productive and no-order reasons; no-order data remains reportable. | §§7, 9 | Outcome/report tests | Planned |
| SR-015 | 3/10 | Checkout records end/GPS/duration/outcome/links/follow-up/next retailer and emits safe automation. | §§9, 13 | Checkout/idempotency/outbox tests | Planned |
| SR-016 | 3/10 | Next-counter roadmap uses beat order and governed priorities; advanced optimization remains Phase 10. | §§9, 14, 17 | Recommendation explainability tests | Planned |
| SR-017 | 2/3 | Retailer order captures party/SKU/unit/quantity/rate/scheme/discount/tax/terms/delivery/attribution/GPS snapshots. | §§7, 9 | Snapshot and pricing tests | Planned |
| SR-018 | 4/7/10 | Actual performance uses net eligible delivered quantity/value, never booked orders alone. | §§7, 14 | Partial/refusal/return/reversal reconciliation | Planned |
| SR-019 | 4 | Item fulfilment tracks ordered, accepted, allocated, dispatched, delivered, refused, returned, cancelled, corrected/reversed quantities through auditable events. | §7 | State/concurrency/integrity suite | Planned |
| SR-020 | 4 | Distributor portal scopes retailers, incoming/direct orders, delivery, inventory, financial views, replenishment, documents, claims, returns, notifications. | §§6, 11 | Distributor own/unrelated scope suite | Planned |
| SR-021 | 4 | Distributor fulfilment supports acknowledge through partial/full delivery with operator and proof. | §9 | Workflow transition suite | Planned |
| SR-022 | 4 | Govern delivery outcomes and optional proof modes including receiver, OTP, signature, photo, GPS, documents, and operator. | §§7, 9 | Proof policy and file-security tests | Planned |
| SR-023 | 4/5 | Distributor replenishment to assigned S.S. supports assisted creation but separately records distributor acceptance. | §9 | Assisted-authority tests | Planned |
| SR-024 | 4/8 | Distributor sees governed ledger and disputes but cannot edit authoritative entries. | §7 | Ledger IDOR/immutability tests | Planned |
| SR-025 | 5 | S.S. portal scopes distributors, orders, stock, dispatch, ledgers, collections, claims, returns, company order, proof, billing, documents, notifications. | §§6, 11 | S.S. own/unrelated scope suite | Planned |
| SR-026 | 5/8 | S.S. company order follows price → pro-forma → confirm → proof/credit → Accounts → approval → allocation → delivery → ledger. | §9 | End-to-end primary order test | Planned |
| SR-027 | 5/8 | Payment proof captures amount/date/bank/reference/mode/file/order/notes and supports governed review/allocation outcomes plus duplicate UTR detection. | §§7, 9 | Duplicate and maker-checker tests | Planned |
| SR-028 | 6 | Billing is optional: system bill, manual bill, receipt/supporting upload, or pending state. | §§7, 9 | Alternate-path workflow tests | Planned |
| SR-029 | 6 | S.S., Distributor, and Admin/Accounts portals handle required invoice, pro-forma, receipt, challan, note, external, and supporting document types. | §§7, 11 | Document-type authorization matrix | Planned |
| SR-030 | 6 | S.S. invoices use its verified legal/GST/bank/sequence/signatory profile. | §7 | Seller-identity and snapshot tests | Planned |
| SR-031 | 6 | Distributor invoices use its approved profile and support registered/composition/unregistered/pending/suspended states subject to current law. | §§7, 18 | Legal review and tax-state tests | Planned |
| SR-032 | 6 | Historical billing snapshot remains immutable after profile change. | §§7–8 | Mutation/reconciliation tests | Planned |
| SR-033 | 6/10 | Authorized documents support download, print, WhatsApp/email/native share, secure link, bulk controls, expiry, revocation, and access audit. | §§7, 10, 13 | IDOR/expiry/revocation tests | Planned |
| SR-034 | 7 | Manager portal supports team/network/assignment/target/attendance/location/visit/order/delivery/collection/quotation/TA/notification/report functions. | §§6, 11 | Manager scope/workflow tests | Planned |
| SR-035 | 7 | Live team view is work-state controlled and privacy bounded; no hidden off-duty tracking. | §§9, 12 | Lifecycle/privacy tests | Planned |
| SR-036 | 7 | Targets include booked/delivered/collections/calls/outlets/SKUs/lines/activation/growth and gaps. | §§7, 14 | Calculation and scope tests | Planned |
| SR-037 | 7/10 | Sales metrics cover calls, strike rate, order value, delivery, rejection/return, retailers, lines, collection, target, expense ratio. | §14 | Source reconciliation tests | Planned |
| SR-038 | 5/7 | Authorized quotations support party type, snapshots, expiry, versioning, approval, PDF/share, and order conversion. | §§7, 9 | Version/conversion tests | Planned |
| SR-039 | 8 | Accounts portal governs proof, allocation, advances, ledgers, outstanding/ageing, notes, reconciliation, expenses, claims, returns, export, audit. | §§6–7, 11 | Accounts permission/workflow suite | Planned |
| SR-040 | 8 | Financial postings are traceable, balanced, idempotent, scoped, audited, and reversed rather than silently edited. | §§7–8 | Journal integrity suite | Planned |
| SR-041 | 3/9 | GPS supports field events and TA evidence with work-state privacy, visible activity, scoped/audited access, retention, and dispute. | §§7, 12 | Device/privacy/retention tests | Planned |
| SR-042 | 9 | TA uses captured movement as estimate, salesperson submission, manager verification, Accounts approval, and governed eligible adjustments/proofs. | §§7, 9 | Approval and calculation suite | Planned |
| SR-043 | 1/10 | Every relevant portal has a scoped internal notification inbox for constitutional event categories. | §§7, 13 | Notification scope/delivery tests | Planned |
| SR-044 | 10 | Approved WhatsApp Business provider abstraction supports governed templates and consent; no personal automation. | §§3, 13, 18 | Provider contract/compliance tests | Planned |
| SR-045 | 10 | Retailer checkout/order messaging is configurable and distinguishes no-order visits. | §13 | Template/render/consent tests | Planned |
| SR-046 | 2/9 | Distributor/S.S. lifecycle supports active, suspended, deactivated, closed, and governed reactivation without standard deletion. | §§7, 9 | Lifecycle transition tests | Planned |
| SR-047 | 9 | Closure revokes sessions/capabilities and records effective date, reason, approval, settlement, stock, obligations, users. | §§5, 9 | Closure/session tests | Planned |
| SR-048 | 9 | Pre-closure review exposes all open operational/financial/document/assignment/dispute obligations; force close is privileged and audited. | §9 | Obligation/force-close tests | Planned |
| SR-049 | 9 | Partner closure preserves orders, fulfilment, documents, finance, tax snapshots, users, assignments, and audit history. | §§7–9 | Historical-retention tests | Planned |
| SR-050 | 2 | Product/SKU/pack/unit/MRP/HSN/tax/pricing/scheme and complete territory/network masters are governed. | §7 | Master integrity/assignment tests | Planned |
| SR-051 | 2 | Pricing supports company→S.S.→distributor→retailer→MRP levels, effective dates, tiers/schemes/discounts and historical snapshots. | §7 | Effective-date/snapshot tests | Planned |
| SR-052 | 4/5 | Inventory supports company/S.S./distributor stock states and prevents impossible negative or duplicate fulfilment. | §§7–8 | Stock concurrency/integrity tests | Planned |
| SR-053 | 4/8 | Claims/returns capture governed reason, source item, batch where needed, quantity, proof, amount, approval, and credit status. | §7 | Claim/financial-impact tests | Planned |
| SR-054 | 3 | Field market intelligence is lightweight and captures competitor/price/scheme/feedback/demand/shelf/complaint/opportunity. | §§7, 11 | Mobile UX/scope tests | Planned |
| SR-055 | 11 | Weak-network architecture supports cached day, drafts, queued/idempotent writes, attachments, sync state, conflicts, and duplicate prevention. | §§7, 13 | Offline chaos/replay tests | Planned |
| SR-056 | 1–11 | Critical login, authority, master, order, delivery, finance, document, tax, expense, lifecycle actions are auditable with safe context/diffs. | §§5, 12 | Audit completeness/tamper tests | Planned |
| SR-057 | 1–11 | Security reviews cover escalation, IDOR, crossover, files, payments, ledgers, delivery, replay, uploads, sessions, links, logs, validation, and rate limits. | §§10, 12 | Security matrix each phase | Planned |
| SR-058 | 1/6/11 | Uploads enforce type/extension/size, private key, authorization, expiry, audit, and malware strategy. | §§10, 12–13 | Malicious upload/download tests | Planned |
| SR-059 | 7/10 | Founder dashboard exposes the constitutional sales, collection, outstanding, network, product, returns, stock, targets, expenses, and credit views. | §14 | Scoped source reconciliation | Planned |
| SR-060 | 7/8/10 | Sales, field, delivery, and finance report catalog is complete and reconciled. | §14 | Report-to-source test matrix | Planned |
| SR-061 | 10 | Intelligence starts deterministic for next retailer, dormant/reorder/stock/delivery/target/collection/service signals; AI is optional. | §14 | Explainability and accuracy tests | Planned |
| SR-062 | 1 | Independent foundation provides identity, branding, auth, RBAC, sessions, guards, shells, audit, config, flags, adapters, errors, tests, logs, DB/env contracts. | §§3–6, 10–16; phase-1/block-1 | Block 1 static suite; later Block acceptance | Implemented |
| SR-063 | 2 | Master data/network phase enforces configuration, assignment, duplicate control, lifecycle/billing foundations, and audit. | §§6–8 | Phase 2 acceptance suite | Planned |
| SR-064 | 3 | Field phase completes Start/End Day through next counter and validates territory, GPS privacy, attribution, duplicate and mobile behavior. | §§7, 9, 11–12 | Phase 3 acceptance suite | Planned |
| SR-065 | 4 | Distributor phase proves booked is not delivered and covers partial/refusal/return paths. | §§7, 9 | Phase 4 acceptance suite | Planned |
| SR-066 | 5 | S.S. phase proves basic Salesperson→Retailer→Distributor→S.S.→Company operation before milestone claim. | §9 | Phase 5 end-to-end suite | Planned |
| SR-067 | 6 | Billing/GST phase verifies correct seller, optional/manual paths, immutable snapshots, PDF/share/security/history. | §§7, 9, 13 | Phase 6 acceptance suite | Planned |
| SR-068 | 7 | Manager phase implements team, assignment, performance, network, quotation, instruction, reminder, exception and TA-review functions. | §§6, 11, 14 | Phase 7 acceptance suite | Planned |
| SR-069 | 8 | Accounts phase completes ledgers, verification/allocation, ageing, reconciliation, adjustments, expenses, claims/returns and financial reports. | §§7–9, 14 | Phase 8 integrity suite | Planned |
| SR-070 | 9 | Travel/lifecycle phase completes TA and partner suspension/deactivation/closure/reactivation/session/history controls. | §§7, 9, 12 | Phase 9 acceptance suite | Planned |
| SR-071 | 10 | Automation/reporting phase completes notifications, WhatsApp status, reminders, sharing, dashboards, reports, and deterministic intelligence. | §§13–14 | Phase 10 acceptance suite | Planned |
| SR-072 | 11 | Hardening phase verifies offline/mobile/load/indexes/security/files/backups/restore/DR/logging/monitoring/UAT/deployment. | §§8, 11–16 | Phase 11 and final audit | Planned |
| SR-073 | 1–11 | Migrations are forward-only, loss/rollback assessed, backed up, rehearsed on test DB, and constraints/indexes verified. | §8 | Migration rehearsal evidence | Planned |
| SR-074 | 1–11 | Tests use only a separate marked Seera test DB and refuse production/MUV/no-test-URL fallback. | §§8, 15 | Database identity guard tests | Blocked |
| SR-075 | 1–11 | Testing includes unit, integration, authorization, workflow, integrity, regression, and security levels plus all named high-risk scenarios. | §15 | Phase and final matrices | Planned |
| SR-076 | 1–11 | Every phase performs and records adversarial self-challenge. | Readiness report | Self-challenge artifact audit | Verified |
| SR-077 | 1–11 | Maintain master architecture, roadmap, requirements, decisions, risks, phase folders, and freeze reports. | docs/seera | Documentation completeness test | Implemented |
| SR-078 | 1–11 | Every major requirement has ID, phase, implementation, test evidence, and explicit status. | This register | Traceability audit | Implemented |
| SR-079 | 1–11 | Performance uses pagination, safe aggregation, indexes, no N+1/huge payloads, and mobile-first operational screens. | §§10–11, 15 | Volume/performance tests | Planned |
| SR-080 | 1–11 | Configurable retention preserves legal/financial history and applies policy to GPS, visits, files, proofs, audit, and closed partners. | §§7–8, 12, 18 | Retention/legal tests | Planned |
| SR-081 | 6–10 | Authorized CSV/Excel/PDF export and scoped search cannot bypass portal permissions. | §§10, 14 | Export/search authorization tests | Planned |
| SR-082 | 1–10 | Govern business configuration such as TA, visits, templates, discounts, sequences, financial year, credit, lifecycle, GPS, and retention. | §§7, 18 | Settings permission/version tests | Planned |
| SR-083 | 1–11 | Seed only idempotent safe reference data; production Founder bootstrap is controlled and no partner/customer data is hard-coded. | §§5, 8 | Seed replay/security tests | Planned |
| SR-084 | 1/10/11 | Structured observability covers errors, audit, performance, jobs, payments, notifications, and sync without secrets. | §16 | Redaction/alert tests | Planned |
| SR-085 | 10/11 | Background jobs are idempotent, retry-safe, scoped, observable, and have dead-letter/replay strategy. | §13 | Retry/failure tests | Planned |
| SR-086 | 11 | Final independent audit rechecks requirements, architecture, RBAC, data, security, billing, documents, field, delivery, finance, closure, offline, reports, performance, production. | §15; final-audit plan | Eleven final reports and freeze verdict | Planned |

## Current totals

- Total registered requirements: **86**
- Verified: **3** (`SR-003`, `SR-004`, `SR-076`)
- Implemented documentation controls: **2** (`SR-077`, `SR-078`)
- Blocked: **3** (`SR-001`, `SR-002`, `SR-074`)
- Planned: all remaining implementation requirements
- Rejected/deferred: **0**

Counts must be recalculated mechanically when statuses change.
# Phase 2-5 traceability

The combined implementation constitution is traced without merging phase identity in the individual acceptance reports under `phase-2/`, `phase-3/`, `phase-4/`, and `phase-5/`. Cross-cutting commercial, inventory, portal, security, gap, regression, and freeze evidence is under `phase-2-5-audit/`. The frozen 11-phase roadmap is unchanged; Phase 6 has not begun.

# Phase 1 Block 3

Block 3 requirements B3-01 through B3-40 are implemented and traced in `phase-1/block-3/SEERA_PHASE_1_BLOCK_3_ACCEPTANCE_CHECKLIST.md`. All are PASS; no critical identity/access requirement is deferred.

Phase 1 Block 4 requirements B4-01 through B4-37 and all prior Block 1–3 guarantees are traced in `phase-1/block-4/SEERA_PHASE_1_REQUIREMENTS_TRACEABILITY.md`. Final Phase 1 acceptance is PASS with no unresolved critical gap.
