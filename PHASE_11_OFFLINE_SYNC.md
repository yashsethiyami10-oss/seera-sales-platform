# Phase 11 Offline Sync

The Sales Executive portal uses IndexedDB for versioned drafts and bootstrap cache. APIs and authentication data are never service-worker cached. Operations carry a per-user client operation ID and are persisted server-side for idempotent replay.

Supported server dispatch covers order, collection, market-intelligence, day-end and visit drafts. The conflict engine classifies automatic resolution, user review, and server rejection for identity/session revocation, inactive retailers, disabled SKUs, credit blocks, duplicates, price/scheme/assignment changes and stock changes.

Migration `20260808224500_phase_11_offline_sync` was applied only to the guarded Seera TEST database. Production was not touched.

Guarded TEST offline UAT is not verified: the sole retry failed before assertions with Prisma P2028 while opening the setup transaction. No business assertion failed, but Phase 11 cannot freeze without a successful later authorized checkpoint.
