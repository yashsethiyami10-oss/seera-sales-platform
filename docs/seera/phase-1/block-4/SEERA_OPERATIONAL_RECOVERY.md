# Operational Recovery

- Test reset: exact destructive confirmation plus guarded TEST-only wrapper.
- Seed: rerun guarded idempotent foundation seed; catalogs do not duplicate.
- Founder bootstrap: supply secure process environment values and TEST role; repeated execution is idempotent.
- Disabled/revoked Founder: an authorized remaining Founder reactivates/reassigns; if none exists, stop and use an audited operator recovery procedure after identity proof—never edit production ad hoc.
- Migration failure: stop, preserve logs, inspect `_prisma_migrations`, correct only with a new forward migration; never rewrite frozen history.
- Bad flag/setting: restore previous audited value through governed API.
- Auth outage: inspect safe readiness, environment identity, session state/version and redacted operational logs; never print secrets.
