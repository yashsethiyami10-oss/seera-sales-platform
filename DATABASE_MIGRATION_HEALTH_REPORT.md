# MUV — Database Migration Health Report

Companion to `NEON_BOOTSTRAP_VERIFICATION_REPORT.md` (the raw findings) — this report interprets
what those findings mean for migration health specifically, and what would actually need to happen
to reach a healthy state. **No migration was applied, resolved, or generated as SQL in this pass.**

## Current health status: UNHEALTHY

`prisma migrate deploy` / `prisma migrate status` against this Neon target will report an error
condition (P3018-class: a failed migration blocking further application) for as long as the single
dirty `_prisma_migrations` row documented in `NEON_BOOTSTRAP_VERIFICATION_REPORT.md` §5 remains
unresolved. This is independent of whether the underlying schema is otherwise complete — Prisma's
migration tooling will not proceed past a failed migration record regardless of the actual table
state.

## What "unhealthy" does NOT mean here — a correction to the prior audit's risk framing

The prior forensic audit (`DATABASE_MIGRATION_FORENSIC_AUDIT.md`) reasonably assumed, from the
failed-migration log alone, that Neon held no application tables. Direct read-only inspection this
pass shows that assumption was wrong: **373 of 403 schema-declared tables already exist**,
including all three tables the original Vercel failure specifically named (`products`,
`announcement_bar`, `finance_bank_accounts`) plus `users`. The *practical* severity of this
migration-health problem is therefore narrower than the forensic audit's original framing implied —
this is not "rebuild the entire schema from nothing," it is "34 specific newer tables are missing,
plus one bookkeeping record needs resolving, plus 5 stray tables need a reconciliation decision."

## Root cause, refined with this pass's direct evidence

The forensic audit's root-cause finding (C: migrations designed assuming an already-existing
database, via repeated `prisma db push` usage instead of `migrate dev`/`migrate deploy`) is now
directly confirmed against the live target, not just inferred from migration file content: Neon's
373 existing tables are proof that `db push` (or an equivalent direct-schema-sync action) was run
against this exact database at some point — most likely **after** the recorded failed `migrate
deploy` attempt (`started_at: 2026-08-01T18:11:44.860Z`), since that attempt's own error message
(`relation "users" does not exist`) is only possible if `users` did not exist yet at that moment,
and it clearly exists now. The dirty `_prisma_migrations` row was simply never cleaned up after
whatever later action created the rest of the schema.

The 34 genuinely-missing tables are not randomly distributed — they cluster almost entirely around
the *most recently added* features in `schema.prisma` (Milestone 9 Customer Support, Stage 6C
Runtime engineering, parts of the Knowledge Modeling sprint, a handful of governance tables). This
is consistent with: whatever `db push` created the other 373 tables ran at some point **before**
those specific features were added to `schema.prisma` in this repository — i.e., Neon's schema is a
snapshot from an earlier point in this project's schema evolution, not from the very beginning.

## What migration health actually requires from here (not executed — for Founder decision)

Given the real state, the originally-approved "consolidated baseline for a brand-new database" is
the wrong-sized tool. What migration health would actually require is:

1. **Resolve the one dirty `_prisma_migrations` row** — `prisma migrate resolve --rolled-back
   "20260727000000_sales_architecture_v1"` remains the technically correct command (its 0
   `applied_steps_count` confirms no partial schema effect to account for), but this alone does not
   make the 50-migration chain deployable, since migrations #2 onward still assume tables/columns
   that may or may not match Neon's actual (earlier-snapshot) schema state — this needs verification
   before assuming `migrate deploy` would cleanly proceed past migration #1 even after resolving it.
2. **A much smaller, additive migration** creating only the 34 genuinely-missing tables (Customer
   Support module + Runtime/AI layer + governance additions + partial Knowledge Modeling) — not a
   full 403-table baseline. This could be generated via `prisma migrate diff
   --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
   --script` (diffing the *live database* against the target schema, not diffing from empty) —
   this is the Prisma-correct approach for "database and schema have diverged, reconcile them,"
   which is the actual situation here, distinct from "bootstrap a truly empty database."
3. **A deliberate decision on the 5 orphaned tables** (`phase2_operations`,
   `phase2_policy_versions`, `phase2_sod_policies`, `phase2_source_references`,
   `phase6_configuration`) — whether they're safe to drop or need to be preserved/reconciled into
   the current schema — before or after the above, but not silently ignored.
4. **A full column-level diff**, not just table-existence — this pass confirmed table *names* match
   for 373 tables, but did not inspect column-level schema drift within those 373 (e.g., a column
   added to an existing model in `schema.prisma` after Neon's schema was pushed would not show up
   as a missing *table* in this analysis). This is a real, unclosed gap in this health report,
   stated plainly rather than implied to be covered.

## Why this report stops short of prescribing exact commands to run

The approved protocol's Phase 2–7 commands were written for a genuinely empty target. None of them
are still the correct next action given what Phase 1 actually found. Prescribing a *new* exact
command sequence for this different situation, in a report whose own stated scope was "database
bootstrap repair" under an already-approved plan, would be substituting a materially different
action than what was authorized. That substitution is a decision for the Founder to make with this
corrected picture in hand, not one to make unilaterally mid-execution.
