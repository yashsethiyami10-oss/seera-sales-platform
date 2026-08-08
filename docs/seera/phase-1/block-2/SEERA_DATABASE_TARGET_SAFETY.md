# Seera Database Target Safety

`lib/database/identity-guard.ts` rejects missing/malformed URLs, known MUV hosts/projects, production/test equality, test fallback, same endpoint reuse, unknown targets, role mismatch, and all production writes. `scripts/seera/guarded-prisma.ts` loads exact `.env` and `.env.test` files, authorizes TEST, prints sanitized identity only, and injects the test URL into the Prisma child process. It never rewrites environment files.

Production identity validation is URL-only. Block 2 opened no production database connection.
