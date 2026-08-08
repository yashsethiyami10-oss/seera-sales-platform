# Seera Phase 2–5 Gap Register

| ID | Severity | Finding | Resolution | Status |
|---|---:|---|---|---|
| G-001 | High | Initial partner schema lacked an explicit user-to-partner scope boundary. | Added `SeeraPartyUser`, scope service, denial tests, and forward migration 004. | Resolved |
| G-002 | High | Company-order workflow needed explicit payment states rather than overloading retail states. | Added advance/payment states with forward migration 005 and advance verification tests. | Resolved |
| G-003 | High | Stock could become negative if movements were accepted without derived-balance validation. | Added movement replay validation and negative-position rejection. | Resolved |
| G-004 | High | Joint work could double-credit visits/orders. | Added single attribution keys and primary-executive ownership tests. | Resolved |
| G-005 | Medium | Phase 1 static test configuration excluded new suites. | Added dedicated phase and integration configurations without changing Phase 1 includes. | Resolved |
| G-006 | High | Application-level active-workday transaction expired under slow Neon latency. | Added atomic partial-unique DB constraint in migration 006 and direct-insert conflict mapping. | Resolved |
| G-007 | Medium | PJP, target, collection, and market-intelligence requirements lacked first-class records. | Added effective-dated journey plans, delivered-basis targets, idempotent collections, and scoped intelligence models in migration 007. | Resolved |
| G-008 | High | Frozen Phase 2-5 portal UI had no English/Hindi localization or persisted user language preference. | Added canonical EN/HI dictionaries, per-user preference, authenticated switch endpoint, portal selector, Devanagari rendering/fallback, migration 008, and 27 bilingual tests. | Resolved |

Open critical/high gaps: none at the documented audit checkpoint.
