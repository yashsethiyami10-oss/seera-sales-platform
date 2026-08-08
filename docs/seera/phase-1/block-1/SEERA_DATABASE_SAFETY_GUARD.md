# Seera Database Safety Guard

Implementation: `lib/database/identity-guard.ts`

The guard parses URLs locally using the platform URL parser. It never imports Prisma, opens a socket, resolves DNS, or logs credentials/full URLs.

## Rejections

- missing or invalid production identity;
- missing `TEST_DATABASE_URL` (no fallback to `DATABASE_URL`);
- literal production/test equality;
- distinct URLs resolving to the same normalized host/database;
- known MUV hosts and Neon project identifiers;
- non-PostgreSQL or missing database path.

## Safe output

Only role, normalized host, database name, Neon host-label project identifier, and a 16-character SHA-256 host/database fingerprint are returned. Username, password, query token and full URL are absent.

`instrumentation.ts` validates production identity at Node startup without connecting and logs only the fingerprint or error code. Test selection must call `requireDatabaseUrlForRole("test", env)`, which requires the explicit test variable.

Static vectors cover accepted separate identities, both known MUV hosts, literal equality, normalized identity reuse, malformed/missing identity and forbidden fallback.

