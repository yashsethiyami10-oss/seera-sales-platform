# Seera RBAC Gap Analysis

## Current state

The base system has a global enum role and one data-driven SalesRole per user. Permission checks are centralized, which is reusable, but neither mechanism understands memberships, multiple roles, partner affiliation, effective assignments, or active organisation. Founder bypass is global. Partner-user mappings exist in `NetworkPartnerUser`, but the active enterprise principal remains MUV-only.

## Permission mapping

| Required Permission | Existing Equivalent | Reusable | Modification Required | New Permission Required |
|---|---|---:|---|---:|
| View/create/edit assigned retailers | Customer view/manage + owner/territory patterns | Partial | Org + beat/distributor/ownership predicates | Yes |
| Check in/out; create visit | Institutional visit actions | Partial | Retailer/beat, device, idempotency, GPS policy | Yes |
| Create/submit/modify order | Business/commerce order actions | Partial | Draft ownership, channel parties, state machine | Yes |
| View own target/performance | InstTarget/reporting | Partial | Delivered-event metrics and org scope | Yes |
| Follow-up/payment reminder | Follow-up + messaging patterns | Partial | Party/account and consent scope | Yes |
| Assign territory/beat/distributor/target | Territory/network/target services | Partial | Effective assignments and delegation limits | Beat permissions new |
| View team location/attendance/visits | Reporting hierarchy + visits | Low | Working-session/privacy/territory controls | Yes |
| Approve travel expense | InstExpense + finance expense approvals | Partial | Two-stage manager/accounts workflow | Yes |
| Quote/special discount approval | Quotation approvals | Strong | Org policy and approval limits | Channel-specific grant |
| Distributor acknowledge/allocate/update delivery | Commerce reservation/dispatch | Partial | Partner portal scope and item events | Yes |
| Distributor ledger/dispute/inventory/users | Finance/network/inventory foundations | Partial | Party account and partner-user delegation | Yes |
| Super-stockist distributor/order/stock actions | Network hierarchy | Partial | Primary/replenishment workflows | Yes |
| Accounts proof/match/reject/advance/notes/reconcile | Finance AR/banking/notes | Strong | Proof workflow + order-release policy | Yes |
| Admin products/prices/schemes/territories/beats/users | Admin/Sales masters | Partial | Org admin boundary and new masters | Yes |
| Notification templates/document sequences/audit | Templates/EnterpriseSequence/audit | Partial | Org ownership and sensitive-view grants | Yes |
| Read-only auditor | No safe complete equivalent | No | Immutable scoped evidence/export | Yes |

## Required authorization formula

`allow = active identity AND active membership AND active organisation context AND permission AND assignment scope AND record organisation AND (ownership where required) AND state/SOD policy`.

Accounts must not inherit sales-management powers. Payment proof submitter cannot verify the same proof; bank matching/release and manual adjustments need maker-checker thresholds. Distributor/super-stockist operators can only act through an active `NetworkPartnerUser` mapping and the effective hierarchy. Founder access should be explicit organisation membership, not an unbounded platform bypass.

## Session controls

Use short-lived/revalidated authority, membership versioning, server-side active-org resolution, immediate denial for disabled memberships/users, CSRF-safe switching, audit of switches, and reauthentication for bank/role/security changes. A 30-day JWT containing only global base role is insufficient for Seera authority.

