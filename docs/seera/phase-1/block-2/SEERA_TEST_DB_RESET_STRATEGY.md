# Seera Test Database Reset Strategy

Use `npm run db:test:reset` only with process variable `SEERA_CONFIRM_TEST_DB_RESET=RESET_SEERA_TEST_DATABASE`. The script is explicitly destructive and refuses to start without that exact confirmation. It delegates to the atomic test-only Prisma wrapper, which rejects missing/unknown/MUV/equal/production targets and never falls back to production.

The reset was not executed in Block 2. Its unconfirmed refusal path was verified.
