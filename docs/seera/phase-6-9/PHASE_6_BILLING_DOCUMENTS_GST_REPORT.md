# Phase 6 — Billing, Documents and GST

Implemented as an organisation-scoped Seera subsystem. It supports canonical document types, system/upload/assisted sources, optional billing modes, issuer-scoped numbering, effective-dated billing profiles, immutable issued snapshots, intrastate/interstate GST calculation, verification state, and expiring/revocable recipient-scoped sharing. The actor is recorded separately from the legal issuer; legal and user-entered data remain unchanged.

Verification: Phase 6 rule coverage is included in the 28/28 Phase 6–9 suite. The consolidated migration was applied once through the guarded TEST-only runner. Production was not targeted.

Status: FOUNDATION COMPLETE; FREEZE BLOCKED. A professional PDF renderer/download surface and end-to-end guarded document workflow tests remain required.
