# Seera Proposed Implementation Phases

The requested sequence is retained with security gates. Finance foundations already exist, but party/order truth must precede their Seera integration; therefore moving ledger earlier would create mappings to unstable masters.

| Phase | Outcome | Entry/exit gate |
|---|---|---|
| 0 — Technical Audit | Evidence, architecture, risks and decisions | Technical completion only; no implementation freeze |
| 0.1 — Constitutional Restoration & Founder Decision Freeze | Canonical-source resolution, AD-001–AD-008, baseline verification and readiness verdict | Primary constitution restored/accepted; ADRs frozen; baseline blockers closed/accepted |
| 0.2 — MUV Zero-Harm Baseline & Foundation Detail Freeze | Grouped regression, build diagnosis, additive schema/compatibility/rollback boundary | Founder accepts strategy; baseline blockers closed/accepted |
| 1 — Multi-Entity Foundation and Seera Isolation | New organisation/membership/context/roles/flags/sequences/guards/adapters/tests only | No Seera business workflow or operational data until cross-entity suite passes |
| 2 — Channel, Territory and Master Data | Parties, retailer profiles, hierarchy, territories/beats, catalog/UOM/prices/schemes | Effective assignments and MUV regression parity |
| 3 — Retail Field Sales Execution | Workday, plans, visits, check-in/out, orders online-first | GPS/privacy/idempotency acceptance; offline deferred |
| 4 — Distributor Order and Delivery | Secondary orders, acknowledgement, allocation, item delivery/refusal/proof | Net-delivered event invariants pass |
| 5 — Super Stockist and Primary Sales | Replenishment, assisted and primary flows, Seera quotations | Separate branding/sequences and approval states pass |
| 6 — Ledger, Payments and Accounts | Party mappings, proof review, AR allocation, reconciliation, notes/disputes | Maker-checker, reversal and duplicate UTR tests pass |
| 7 — Manager, Targets and Travel | Delivered targets, team views, approved route expense | Raw GPS access and expense SOD reviewed |
| 8 — Notifications and WhatsApp | Inbox/outbox, org sender/templates, webhooks/retry | Consent, opt-out and failure replay verified |
| 9 — Reports and Founder Intelligence | Sales/field/finance/delivery read models and exports | Reconcile to item events/ledger; isolation tests |
| 10 — Offline Hardening and Production Readiness | PWA/outbox/attachments/conflicts/device controls | Chaos/retry/upgrade/security/load/DR tests |
| 11 — Sales Intelligence and Route Optimisation | Recommendations and governed optimisation | Only validated data; human override/explainability |

## Cross-phase rules

- Use expand/backfill/validate/contract migrations; never destructive big-bang conversion.
- Keep MUV compatibility adapters and feature flags until parity is demonstrated.
- Each phase adds two-organisation, role, audit, export, file and stale-session tests.
- Major Seera features require separate Founder approval; Phase 0–0.2 documentation does not itself authorize Phase 1.

## Mandatory test programme

Tenant tests cover bilateral MUV/Seera denial, switching, reports, exports, files, caches and jobs. Role tests cover salesperson beat, distributor retailer orders, super-stockist distributors, Accounts/Sales separation and partner operators. Financial tests cover proof-not-paid, controlled release, immutable entries/reversals, duplicate UTR and partial allocation. Sales tests cover booked-versus-delivered, partial/refusal/return/reassignment. GPS/offline tests cover checkout dependency, out-of-order/duplicate retry, suspended membership and attachment dedupe. Run `prisma generate`, `tsc --noEmit`, relevant Vitest suites and `next build` for every implementation phase.
