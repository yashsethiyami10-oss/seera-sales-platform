# Seera Phase 4 — Distributor Portal

## Executive summary

Phase 4 activates a distinct distributor experience for retailer-order acknowledgement, line-level partial acceptance, delivery-ready state, movement-ledger inventory, adjustments, month-end reconciliation, replenishment, credit visibility, claims, notifications, and audited assisted operations.

## Architecture and models

Distributor scope is enforced by `SeeraPartyUser`; seller partner scope is also present on every retailer order. Ordered, accepted, allocated, dispatched, delivered, cancelled, refused, and returned quantities are independent. Inventory is derived from `SeeraInventoryMovement`; reconciliation creates a variance record and requires a later explicit adjustment movement rather than overwriting balance.

## Workflows, permissions, and UX

The Distributor portal navigation is Order Inbox, Deliveries, Inventory, Replenishment, and Credit & Claims. Delivery users receive only `distributor_delivery:execute`; they cannot edit credit or stock. Assisted actions require Manager permission, explicit actor, source portal, on-behalf-of party, reason, and `financialAcceptance=false`.

## Tests and security

Tests cover partial fulfilment, cross-distributor denial, negative-stock denial, movement-derived stock, reconciliation variance, least privilege, and assisted provenance.

## Acceptance verdict

Requirements implemented in the authorized Phase 4 scope. Phase 8 retains financial claims settlement. Final freeze depends on the combined regression and freeze report.
