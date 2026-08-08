# Seera Phase 3 — Sales Executive Field App

## Executive summary

Phase 3 activates the distinct mobile-oriented Sales Executive experience and shared manager field primitives. The operational core supports one active day, governed working types, visits, retailer/prospect context, snapshot order booking, delivered-sales calculation, joint-work attribution, and DSR-ready timestamps.

## Architecture and models

`SeeraWorkSession`, `SeeraVisit`, `SeeraJointWork`, `SeeraProspect`, `SeeraSalesOrder`, and `SeeraOrderLine` preserve field ownership and order snapshots. Start/end and booking services validate actor permissions and source portal. Assignments remain effective-dated so transfers do not rewrite history.

## Workflows, permissions, and UX

Sales Executives receive Today, Beat Roadmap, Retailers, Orders, and DSR navigation. They cannot fulfil distributor orders, edit stock, or access partner credit controls. Sales Managers remain in a separate shell with only Phase 2–5 primitives; the full Phase 7 portal is not implemented.

Performance uses delivered quantities less cancellation, refusal, and approved returns. Booked value is reported separately. Joint work emits one visit/order attribution key owned by the primary Sales Executive, preventing double credit.

## Tests and security

Tests cover single active workday, snapshot booking, forged retailer assignment rejection, zero booked-only performance, partial-delivery credit, joint-work attribution, and portal access isolation.

## Acceptance verdict

Requirements implemented in the authorized Phase 3 scope. Final freeze depends on the combined regression and freeze report.
