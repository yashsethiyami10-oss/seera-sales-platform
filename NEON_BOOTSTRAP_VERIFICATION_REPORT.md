# MUV — Neon Bootstrap Verification Report (Phase 1 results)

**This report documents Phase 1 — Target Verification only.** Phases 2–7 of the approved protocol
were **not executed**. Phase 1's own explicit rule — "If the database is not safely empty, STOP" —
was triggered by what this inspection actually found, which contradicts the forensic audit's
working assumption. See `DATABASE_BASELINE_IMPLEMENTATION_REPORT.md` for what that means for the
approved plan, and `DATABASE_MIGRATION_HEALTH_REPORT.md` for the full migration-state analysis.

## 1–2. Target confirmed: Neon, not localhost

`.env`'s `DATABASE_URL` (credential redacted): `postgresql://neondb_owner:<redacted>@ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

- Host: `ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech` — a Neon-managed endpoint. ✅
- Confirmed: does **not** contain `localhost` or `127.0.0.1`. ✅
- `npx prisma --version` confirms this environment resolves `DATABASE_URL` from `.env` normally;
  no override was in effect during this inspection.

## 3–4. Read-only inspection — actual findings

A temporary, read-only inspection script (`$queryRawUnsafe` `SELECT`-only queries via Prisma
Client, deleted immediately after use — not committed) was run against the confirmed Neon target.
It performed exactly three read operations: list `information_schema.tables`, read
`_prisma_migrations` in full, and `COUNT(*)` on six specifically business/customer/order-relevant
tables. No write, no DDL, no `db push`, no `migrate` command was run.

**Finding, contradicting the forensic audit's working assumption: the Neon database is NOT
schema-empty.**

| Check | Result |
|---|---|
| Tables in `public` schema | **374** (373 application tables + `_prisma_migrations`) |
| `users` row count | 0 |
| `customers` row count | 0 |
| `orders` row count | 0 |
| `products` row count | 0 |
| `order_items` row count | 0 |
| `sales_inquiries` row count | 0 |

**No business, customer, or order data exists** — every row-count check returned 0, satisfying the
*data* half of Phase 1's "confirm no business/customer/order data" check. But the *schema* itself
is already substantially built: `users`, `products`, `announcement_bar`, `finance_bank_accounts` —
all three tables the original Vercel failure named, plus every other table the prior audit's static
migration-file analysis flagged as "missing" — **already exist in this live Neon database**, along
with 373 tables total. The prior forensic audit's "Neon is empty" conclusion was a reasonable
inference from the failed-migration log alone (it never queried the live database, because SQL
execution was explicitly forbidden during that audit) — this direct inspection shows that inference
was incorrect. Something (almost certainly a `prisma db push` run directly against this Neon
instance, separately from the failed `migrate deploy` attempt) already created nearly the complete
schema here, without ever updating `_prisma_migrations` bookkeeping to match.

## 5. `_prisma_migrations` — full documented state

Exactly **one row** exists:

```json
{
  "id": "11210769-122d-483a-99e6-3788134c2339",
  "checksum": "879c3909f496ee18b2aa0365369193d04b041437c31c8a42f5cf8a8f7a64531a",
  "migration_name": "20260727000000_sales_architecture_v1",
  "rolled_back_at": null,
  "started_at": "2026-08-01T18:11:44.860Z",
  "applied_steps_count": 0,
  "finished_at": null
}
```

`logs` (full text, reproduced verbatim): `A migration failed to apply... Database error code: 42P01
... relation "users" does not exist ...`. `finished_at: null` and `applied_steps_count: 0` confirm
this migration never completed — this is the dirty/failed record Phase 1 §5 asked to be documented.
It is the **only** row in the table; no other migration (of the 50 in the repository) has ever been
attempted against this database through Prisma's own migration tooling. This row is what currently
blocks any future `prisma migrate deploy` against this target (P3018's documented behavior:
"New migrations cannot be applied before the error is recovered from").

## Schema diff — Neon's actual live tables vs. `prisma/schema.prisma`'s 403 mapped tables

Run in both directions, read-only, off the same table listing:

**34 tables `schema.prisma` declares that do NOT exist in Neon** — concentrated in three
identifiable, recent feature areas, not scattered randomly:

- The entire Customer Support module (Milestone 9) — 22 tables: `support_attachments`,
  `support_business_hours`, `support_csat_responses`, `support_departments`,
  `support_escalation_rules`, `support_escalations`, `support_faqs`, `support_feedback`,
  `support_follow_ups`, `support_holidays`, `support_kb_article_versions`,
  `support_kb_article_views`, `support_kb_articles`, `support_kb_categories`, `support_messages`,
  `support_nps_responses`, `support_product_issue_reports`, `support_refund_requests`,
  `support_resolution_templates`, `support_return_requests`, `support_sla_policies`,
  `support_template_usage`, `support_ticket_links`, `support_ticket_notes`, `support_tickets`,
  `support_warranty_registrations`
- The Stage 6C Runtime/AI engineering layer — `runtime_audit_logs`,
  `founder_decision_registry_entries`, `learning_candidates`
- Governance/compliance additions — `approval_authorities`, `hard_maker_checker_categories`,
  `recall_events`
- Part of the Knowledge Modeling sprint — `knowledge_change_proposals`, `knowledge_embeddings`,
  `knowledge_usage_references`

**5 tables exist in Neon that are NOT declared anywhere in the current `prisma/schema.prisma`** —
orphaned/stray relative to the current schema: `phase2_operations`, `phase2_policy_versions`,
`phase2_sod_policies`, `phase2_source_references`, `phase6_configuration`. These need a deliberate
reconciliation decision (drop, or confirm they're genuinely unused) — not investigated further in
this read-only pass, since that determination requires understanding their history, which is
outside a verification report's scope.

## Why this triggers Phase 1's STOP rule

The approved strategy is explicitly "Generate and apply one new consolidated baseline for a
**brand-new database**," and Phase 2's `prisma migrate diff --from-empty ...` command generates
plain `CREATE TABLE` statements with no `IF NOT EXISTS` guard. Applying that script against a
database that already has 373 of those 403 tables would fail immediately on the first
already-existing table it tries to create (safe failure, but not the intended outcome), or would
require silently rewriting the generated SQL to tolerate pre-existing objects — a materially
different action than what was approved, not undertaken without new instruction. Per Phase 1's own
explicit rule — **"If the database is not safely empty, STOP"** — this inspection stops here.
