# Seera Field Sales and GPS Audit

## Existing reusable capability

Institutional Sales provides visit records, check-in/out time and latitude/longitude, outcome, survey/consumption/sample/follow-up links, daily plans, routes, targets and expenses. `components/os-sales/visits/CheckInForm.tsx` uses browser geolocation and `InstVisit` contains coordinate fields (`prisma/schema.prisma:7325-7356`). The OS shell has a genuine online/offline indicator, but its own comment states it is not offline data handling (`components/os-shell/Header/ConnectionStatus.tsx`).

This is a useful interaction and service reference, not a retail beat system.

## Gap assessment

| Requirement | Existing | Gap / required control |
|---|---|---|
| Mobile-first UI | Responsive internal forms | Dedicated low-bandwidth touch flows and partner-safe navigation |
| Start/end day and attendance | No governed work session | WorkSession with timezone, consent, device and manager exception |
| Check-in/out | Institutional point capture | Retailer/beat assignment, radius policy, checkout dependency and idempotency |
| Live/periodic GPS | No | Purpose-limited LocationEvent stream; explicit frequency/retention |
| Visit duration/outcome | Timestamps/outcome partial | Server-derived duration, no-order reasons, productive-call rules |
| Geography/beat/route | Territory and InstRoute partial | State-region-zone-territory-town-market-route-beat and effective assignments |
| Next retailer | No | Phase 11 only; first deterministic beat sequence |
| Collection/competitor/photo | Notes/attachments partial | Structured visit records and private media |
| Offline draft/delayed sync | No | Encrypted local DB, outbox, sync receipts/conflict policy |
| Duplicate prevention | Inquiry and finance examples only | Client operation UUID + server unique keys for visit/order/GPS/attachment |
| Device/fake GPS | No | Device registration, accuracy/mock indicators as risk signals—not automatic guilt |
| Permission handling | Browser error/toast | Consent rationale, denied/degraded flows, policy and audit |
| Distance/expense | InstRoute/InstExpense partial | Approved-rate version, route estimate, deviations, proofs, manager/accounts stages |

## Territory recommendation

Reuse the hierarchical idea in `Territory` and the effective-dated, organisation-scoped `NetworkTerritory`/assignment design. Seera needs explicit typed levels and effective history. Beats/routes are operational children with scheduled assignments, not merely territory labels. Salesperson, manager, distributor and super-stockist assignments all need start/end dates so historical attribution survives transfers.

## Offline strategy

Phase 10 should introduce a PWA only after online workflows and idempotency are stable. Use an encrypted IndexedDB store for minimal assigned masters and drafts; an outbox of immutable commands with UUID, membership/org/device, local sequence and payload hash; server sync receipts; retry-safe attachment queue; and visible states (`local`, `queued`, `synced`, `conflict`, `rejected`). Server time is authoritative. Never cache bank/ledger data broadly. Remote logout, membership suspension and device revocation must prevent further sync.

## GPS privacy/security

Track only during approved work sessions or explicit visits; show tracking state; define retention and purpose; restrict raw points to designated manager/security roles and assigned teams; provide aggregated routes to ordinary reporting; audit every raw export; encrypt in transit/at rest; avoid logging coordinates in general logs; and prohibit punitive decisions from mock-location heuristics without review. GPS distance remains an estimate until manager/accounts approval.

## Reporting gaps

New read models are required for attendance, daily calls, productive calls, beat compliance, visit duration, route deviation, new outlets, no-order reasons, kilometres and expense-to-delivered-sales. Institutional reports cannot be relabelled because retail beat denominators and delivery attribution differ.

