# Seera Migration History Strategy

Status: **Recommendation only — not executed**  
Date: 2026-08-08

## Recommendation

Choose **Option A: archive copied MUV migrations outside Prisma’s active migration path and start a clean Seera migration history**.

The current 60 migration directories are MUV history. Keeping them under `prisma/migrations` risks `prisma migrate deploy` building the MUV schema in a fresh Seera database. They have reference value but no authority in Seera.

## Intended layout

```text
docs/seera/pre-phase-1/reference/
  MUV_COPIED_SCHEMA_SNAPSHOT.prisma
  MUV_COPIED_SCHEMA_SNAPSHOT.sha256
  MUV_MIGRATION_MANIFEST.txt
prisma/reference/muv-migrations/       # future immutable archive
prisma/schema.prisma                   # future clean Seera schema
prisma/migrations/                     # future Seera-only history
```

No migration directory is moved, deleted, renamed, or edited in this pass.

## Controlled future procedure

1. Capture a Git rollback point.
2. Hash every copied migration file and record the manifest.
3. Move the unchanged directory to `prisma/reference/muv-migrations` in Seera only.
4. Verify archive file count and hashes.
5. Remove copied migrations from the active path in the same reviewed change.
6. Introduce the clean Seera schema and generate a new initial migration without applying it.
7. Inspect SQL against a Seera allowlist and MUV denylist.
8. Apply only to disposable Seera test after identity-guard and Founder approval.

The first Seera migration should use a clear independent name such as `00000000000000_seera_independent_foundation`; Seera `_prisma_migrations` must contain only Seera checksums.

Before production data, rollback is branch/database recreation from the empty Seera baseline plus code rollback. After production data, use forward correction or governed restore; never edit deployed migrations.

**Safety verdict:** copied migrations are reference-only and unsafe to execute. Fresh migration generation remains blocked until archive transition and database guard are implemented.

