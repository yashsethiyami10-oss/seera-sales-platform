# MUV — Orphan Table Classification

Covers Phase 3 of the Neon Targeted Schema Reconciliation protocol.

## Headline correction: none of the 5 tables are actually orphans

The "5 Neon-only tables with no corresponding model in current `schema.prisma`" finding, carried
forward from an earlier audit pass in this engagement, was based on a manual regex extraction of
`@@map("...")` declarations that missed 5 real entries. Re-verified directly against
`prisma/schema.prisma` this pass, all 5 have a real, current model:

| Table | Model | Location |
|---|---|---|
| `phase2_operations` | `Phase2Operation` | `prisma/schema.prisma:6027` |
| `phase2_policy_versions` | `Phase2PolicyVersion` | `prisma/schema.prisma:6054` |
| `phase2_source_references` | `Phase2SourceReference` | `prisma/schema.prisma:6075` |
| `phase2_sod_policies` | `Phase2SodPolicy` | `prisma/schema.prisma:6096` |
| `phase6_configuration` | `Phase6Configuration` | `prisma/schema.prisma:3612` |

This was independently confirmed, not just corrected on paper: `prisma migrate diff --from-url
<live Neon> --to-schema-datamodel prisma/schema.prisma --script` — a tool that computes its diff
directly from Prisma's own schema introspection, not from any prior manual audit — **never
proposed a `DROP TABLE` for any of these five**, and only added `CREATE INDEX` statements for them
(confirming their tables and columns already fully existed; only their index layer was
incomplete, exactly like the other 373 pre-existing tables). If they had truly been orphaned
(absent from the target schema), Prisma's diff would have proposed dropping them to reconcile the
live database toward the target — it did not.

## What they actually are

`Phase2Operation`, `Phase2PolicyVersion`, `Phase2SourceReference`, and `Phase2SodPolicy` are part
of "Enterprise Architecture v3.0 Phase 2 Part 3A shared foundations" — per the model's own code
comment, cross-pillar governance records (idempotent operation tracking, versioned policy
configuration, source-of-record cross-references, and segregation-of-duties policy rules) that
Parts 3B/3C/3D of the Enterprise track build on. `Phase6Configuration` is a separate,
Phase-6-scoped configuration table. All are real, current, actively-declared parts of the schema.

## Classification (adapted — the A–D scheme assumed some might be genuinely orphaned)

Since none are orphaned, the applicable classification for all 5 is:

**A. Legacy but still required** — actively declared in `schema.prisma` today, already held real
(if currently empty) table structure in Neon, and are now fully reconciled (indexed) alongside
every other table. No further action needed. None were dropped, altered destructively, or
otherwise touched beyond having their (previously entirely absent) indexes added.

## What this means for Phase 3's original mandate

"Do NOT drop any orphan table in this stage" was followed — trivially, since investigation showed
there was never a genuine orphan to consider dropping. This correction is recorded here rather than
silently absorbed into the reconciliation report, since it materially changes the picture from what
the protocol's own "Confirmed Current State" section stated going in.
