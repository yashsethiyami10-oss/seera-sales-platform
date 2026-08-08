# MUV — Database Migration Forensic Audit

**AUDIT ONLY. No database was modified. No SQL was executed. No `git`/`migrate reset`/`db push`/
`migrate resolve`/deploy command was run to produce this report.** Every finding below is either a
direct file-content observation (migration SQL, `prisma/schema.prisma`, documentation already in
this repository) or explicitly labeled as inference/expected-behavior when it isn't.

## 1. All 50 migration folders, chronologically

```
20260727000000_sales_architecture_v1
20260727030000_sales_channel_architecture_v1
20260727031000_phase2_queue_defaults
20260727040000_opportunity_sales_execution_v1
20260727041000_phase3_configured_transitions
20260727050000_quotation_pricing_engine_v1
20260727051000_phase4_commercial_immutability
20260727060000_commerce_operations_v2
20260727070000_customer_growth_intelligence_v2
20260727070100_phase6_number_triggers
20260727080000_governed_muv_ai_v2
20260727100000_enterprise_operations_v3_phase1
20260727101000_enterprise_operations_supporting_records
20260727120000_enterprise_phase2_part3a_foundations
20260727120100_enterprise_phase2_provenance_key_alignment
20260727130000_enterprise_phase2_part3b_business_network
20260727131000_enterprise_phase2_part3b_remediation
20260727132000_enterprise_phase2_part3b_agreement_supersession
20260727133000_enterprise_phase2_part3b_child_immutability
20260727140000_enterprise_phase2_part3c_wave1_finance_foundation
20260727150000_enterprise_phase2_part3c_stagea_accounting_core
20260727150100_enterprise_phase2_part3c_stagea_immutability_fix
20260727160000_enterprise_phase2_part3c_stageb_accounts_receivable
20260727170000_enterprise_phase2_part3c_stageb_accounts_payable
20260727180000_enterprise_phase2_part3c_stageb_expense_banking
20260727190000_enterprise_phase2_part3c_audit_repair_reconciliation_immutability
20260727191000_enterprise_phase2_part3c_audit_repair_ledger_journal_type
20260728100000_enterprise_phase2_part3d_founder_os_stage1
20260801090000_enterprise_phase2_part3d_founder_os_stage4
20260801100000_commerce_number_trigger_remediation
20260801110000_milestone4_business_order_schema
20260801120000_milestone4_business_order_numbering
20260801130000_milestone4_1_quotation_acceptance_workflow
20260801140000_milestone4_2_direct_business_order
20260801150000_milestone5_operations_foundation
20260801160000_milestone6_dispatch_delivery
20260801170000_milestone7_manufacturing
20260801180000_milestone8_finance_accounts
20260801190000_milestone9_customer_support
20260801200000_sprint1_foundation_hardening
20260801210000_sprint2_source_registry
20260801220000_sprint3_conflict_queue
20260801230000_sprint4_governance
20260801240000_sprint5_knowledge_modeling
20260801241000_sprint5_partial_unique_indexes
20260801250000_sprint6_retrieval_platform
20260802100000_sprint8_learning_system
20260803090000_sprint9_eios_personality
20260803150000_sprint11_domain_foundations
20260803160000_stage6c_runtime_engineering
```

No `migration_lock.toml` file exists in `prisma/migrations/` — confirmed by direct filesystem
check (not fatal to `migrate deploy` itself, but worth noting as an absence from the normal Prisma
migrations folder structure).

## 2–3. `users`, `products`, `announcement_bar`, `finance_bank_accounts` — which migration creates them?

Searched every one of the 50 `migration.sql` files for `CREATE TABLE "<name>"`:

| Table | Created by | Confirmed |
|---|---|---|
| `users` | **No migration** | ❌ Never created anywhere in the 50-migration history |
| `products` | **No migration** | ❌ Never created anywhere in the 50-migration history |
| `announcement_bar` | **No migration** | ❌ Never created anywhere in the 50-migration history |
| `finance_bank_accounts` | `20260727180000_enterprise_phase2_part3c_stageb_expense_banking` | ✅ Created (line 65 of that migration) |

Three of the four named tables have no `CREATE TABLE` statement anywhere in this repository's
migration history. This is not a search-tooling artifact — a full extraction of every
`CREATE TABLE` statement across all 50 files (317 statements, cataloged in full during this audit)
confirms it by exhaustive enumeration, not sampling.

## 4. Does migration ordering place dependents before their prerequisites?

Yes, starting at the very first migration. `20260727000000_sales_architecture_v1` — migration #1
of 50, the oldest in the entire history — opens with:

```sql
ALTER TABLE "users"
  ADD COLUMN "salesRoleId" TEXT,
  ...
```

This is the first executable statement in the first migration Prisma will ever attempt against a
fresh database, and it assumes `users` already exists. There is no possible correct ordering that
fixes this — no migration anywhere in the history contains the missing `CREATE TABLE "users"`
statement for a reorder to move earlier. This is not a sequencing defect; it's a genuine content
gap (see §7).

## 5. Full inventory: every pre-existing object `20260727000000_sales_architecture_v1` assumes exists

Read in full (52 lines). It assumes exactly **one** pre-existing table — `users` — referenced 8
times (`ALTER TABLE "users"` ×2, 3× `ADD CONSTRAINT ... REFERENCES`, 3× `CREATE INDEX ON "users"`,
1× FK inside the new `sales_audit_logs` table it creates). Every other object this migration
touches (`sales_roles`, `sales_permissions`, `sales_role_permissions`, `territories`,
`sales_audit_logs`, the `reject_sales_audit_mutation()` function, the
`sales_audit_logs_immutable` trigger) is created fresh within this same migration — none of those
are prerequisite gaps.

## 6. Full schema-vs-migration-history comparison

`prisma/schema.prisma` declares **408 models**, of which **403 have an explicit `@@map(...)`**
snake_case table name (a 1:1 model-to-`@@map` ratio was expected; 5 models resolve to a default
Prisma table name instead — not investigated further as it doesn't change the core finding).
Diffing the 403 mapped table names against the 317 unique table names actually created across all
50 migrations:

**86 tables that `prisma/schema.prisma` declares are never created by any migration.** Full list:

```
accounts, addresses, announcement_bar, banners, blog_categories, blog_posts, brands,
business_inquiries, care_actions, care_evidence_sources, care_intelligence,
care_intelligence_versions, care_required_information, categories, coupons,
customer_contact_persons, customer_documents, customer_notes, customers, departments,
experience_feedback, experience_sessions, homepage_sections, inst_attachments,
inst_consumption_estimates, inst_daily_plans, inst_expenses, inst_follow_ups, inst_leads,
inst_notes, inst_opportunities, inst_opportunity_products, inst_quotation_line_items,
inst_quotation_versions, inst_quotations, inst_routes, inst_samples, inst_surveys, inst_targets,
inst_tasks, inst_visits, institution_categories, inventory, knowledge_items,
knowledge_retrieval_logs, knowledge_versions, media_assets, muv_ai_events, newsletter_content,
notification_logs, order_items, orders, payment_attempts, payment_terms, problem_causes,
problem_common_mistakes, problem_diagnostic_questions, problem_evidence_sources,
problem_exclusion_rules, problem_expected_outcomes, problem_intelligence,
problem_intelligence_versions, problem_prevention_guidance, problem_product_relationships,
problem_question_options, problem_safety_rules, problem_symptoms, problem_usage_guidance,
product_intelligence, product_intelligence_versions, product_variants, products,
recently_viewed_items, return_requests, return_shipments, reviews, search_queries, sessions,
shipment_events, shipments, stock_history, store_settings, units, users, verification_tokens,
wishlist
```

**This is not one clean gap — it is (at least) three distinct historical waves of the same
underlying practice**, distinguishable by which tables in a related cluster are missing vs. present:

1. **The original D2C storefront/CMS/auth baseline** (Users/Accounts/Sessions, Customer/Address,
   Category, Product/ProductVariant/Inventory/StockHistory, Order/OrderItem/PaymentAttempt,
   Wishlist/RecentlyViewedItem/SearchQuery, Coupon, Review, Banner/HomepageSection/
   AnnouncementBar/NewsletterContent/StoreSettings, BlogCategory/BlogPost, MediaAsset,
   Shipment/ShipmentEvent/ReturnShipment/ReturnRequest, NotificationLog, BusinessInquiry) —
   matches CLAUDE.md's own documented core data layer almost exactly. **Entirely absent** from
   migration history.
2. **Part of an earlier "Knowledge/Problem/Care Intelligence" layer** — `product_intelligence`,
   `problem_intelligence` (+ 12 child tables), `care_intelligence` (+ 3 child tables),
   `knowledge_items`, `knowledge_versions` are all missing, while **sibling/child tables from the
   same feature area that were added later** (`category_intelligence_versions`,
   `product_variant_intelligence`, `product_variant_intelligence_versions`,
   `knowledge_change_proposals`, `knowledge_conflicts`, `knowledge_embeddings`,
   `source_provenance`, `canonical_source_documents`, `learning_candidates`) **are** present,
   created by the `sprint5_knowledge_modeling`/`sprint6_retrieval_platform`/`sprint8_learning_system`
   migrations (Aug 1–2). Those later migrations only `ALTER`/reference the missing base tables —
   they never re-create them.
3. **Part of the Institutional Sales OS layer** — `inst_opportunities` and `inst_quotation_versions`
   (among other `inst_*` tables) are referenced by foreign keys in `milestone4_business_order_schema`
   (Aug 1) and `sprint11_domain_foundations` (Aug 3) but never created by any migration, even though
   the feature they belong to is comparatively recent in this project's timeline.

Direct evidence of dependents referencing these never-created tables (a sample, not exhaustive —
`users` alone is referenced in 24 separate migration files):

```sql
-- 20260727050000_quotation_pricing_engine_v1:332
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "..._productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ...
-- 20260727060000_commerce_operations_v2:2
ALTER TABLE "orders" ADD COLUMN "acceptedQuotationVersionId" TEXT, ...
-- 20260801240000_sprint5_knowledge_modeling:87
ALTER TABLE "category_intelligence" ADD CONSTRAINT "..._categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ...
-- 20260801110000_milestone4_business_order_schema:81
ALTER TABLE "business_orders" ADD CONSTRAINT "..._opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "inst_opportunities"("id") ...
```

## 7. Root cause determination

**Primary cause: (C) — migrations were designed assuming an already-existing database**, with
**(B)** and **(D)** as the direct, observable consequences of that same root cause — these are not
competing explanations, they are one story told at three levels:

- **(C), the behavioral root cause**: this project's own tooling (`package.json`) and its own
  constitution (`CLAUDE.md`) both document `npx prisma db push` as a normal, sanctioned command —
  "fast local sync, no migration file (dev only)." The evidence shows this command was used
  repeatedly, across the project's entire timeline (not just once at the start), to create new
  tables directly against a working database without ever generating the matching migration file.
  `migrate dev`/hand-authored migrations were then used only for *incremental* `ALTER`-level changes
  layered on top of tables that already existed by that route.
- **(B), the structural consequence**: 86 tables that `schema.prisma` declares have no creation
  migration — not a single missing baseline, but the same gap recurring at three different points
  in the project's life (§6).
- **(D), how it manifests in the SQL**: dozens of `ALTER TABLE`/`REFERENCES` statements scattered
  across the migration history assume tables that were never migrated (§6's sample), which is
  exactly what produces the `relation "users" does not exist` (42P01 / P3018) failure on a fresh
  database — `migrate deploy` has no choice but to apply migrations strictly in order, and
  migration #1 already fails.

**This is not a hypothesis — this repository's own prior documentation confirms the exact same
defect was already discovered once before, locally, and worked around rather than fixed:**

> "Migration `20260803160000_stage6c_runtime_engineering` was hand-authored (not `prisma migrate dev`)
> because the shadow database used for that command's diffing fails on an unrelated, pre-existing
> migration (`20260727000000_sales_architecture_v1`, error P1014) that predates this work... Applied
> via `prisma db execute` + `prisma migrate resolve --applied`."
> — `docs/ai-intelligence-core/RUNTIME_IMPLEMENTATION_REPORT.md`, lines 22–29

This is the same `20260727000000_sales_architecture_v1` migration identified independently in this
audit as the one that fails against a fresh Neon database. Prisma's shadow-database diffing (used
by `migrate dev`) builds a *genuinely empty* database to compute a diff — and it failed on this
exact migration for the exact same underlying reason `migrate deploy` now fails against Neon: no
prior migration creates `users`. The prior workaround (hand-author raw SQL, apply directly, then
mark it "applied" via `migrate resolve --applied` without Prisma ever validating it against a truly
empty database) papered over the symptom locally without correcting the missing baseline — which is
exactly why it has now resurfaced against a genuinely fresh database.

A second, independent piece of corroborating evidence: `docs/enterprise-phase2/PART_3D_FOUNDER_OS_FREEZE.md`
(§5, "F2" finding) separately documents that at least one feature's database-level partial unique
indexes exist "only in migration SQL, not in `schema.prisma`... created by `migrate deploy`/
`migrate dev` but **not** by `prisma db push`" — direct confirmation that `db push` and the real
migration history have been allowed to diverge, as an acknowledged, disclosed, but not resolved,
condition prior to this audit.

## 8. Bootstrap process — package.json, seed scripts, deployment docs, archives

- **`package.json`** defines `db:migrate` (`prisma migrate dev`), `db:push` (`prisma db push`),
  `db:deploy` (`prisma migrate deploy`), `db:seed` (`tsx prisma/seed.ts`) as four separate, always-
  available commands — no single documented "bootstrap a fresh database" sequence exists that
  reconciles them; the project's own commands make it easy for `db push` and the migration history
  to diverge, which is what happened.
- **`prisma/seed.ts`** — real, and explicitly refuses to run against a non-`localhost` `DATABASE_URL`
  unless `ALLOW_SEED=true` is set (a deliberate safety check against seeding a shared/production
  database with a known default admin password). It assumes the schema already exists — it is a
  data-seeding script, not a schema-bootstrapping one, and does not help with the current defect.
- **`CLAUDE.md`** and `DEPLOYMENT_GUIDE.md`/`DEPLOYMENT_READINESS.md` all consistently state
  `migrate deploy` (never `db push`) is the only command meant to run against production — a correct
  policy, but one that was evidently not followed consistently during development against whichever
  database(s) `db push` was run against, which is the actual root cause here.
- No dedicated "fresh database bootstrap" doc, script, or checklist section exists anywhere in this
  repository.

## 9. Baseline SQL, dumps, or initialization scripts elsewhere in the repository

Searched the full repository (excluding `node_modules/`, `.next/`) for `.sql` files, and for any
file named with `dump`, `baseline`, `init*.sql`, or `.dump`:

- **One** `.sql` file exists outside `prisma/migrations/`: `scripts/install-sales-audit-immutability.sql`
  — read in full; it only reinstalls the `reject_sales_audit_mutation()` trigger function already
  present in `20260727000000_sales_architecture_v1` (a maintenance/idempotency helper, almost
  certainly to reinstall that trigger after a `db push`, since `db push` does not apply
  hand-written trigger SQL from migration files). **Not** a baseline or bootstrap script.
- **No** database dump, `.dump`, or baseline/init SQL file exists anywhere else in the repository.

## 10. Neon `_prisma_migrations` table — current state

**Not inspected.** The protocol's top-level constraint — "Do not execute SQL" — is explicit and
was honored in full; task 10's own "if safely possible" qualifier does not override that
constraint. No query was run against Neon.

What can be stated from file evidence alone: `.env`'s `DATABASE_URL` (checked for host/database
name only, credential redacted) already points directly at the Neon instance described in this
protocol (`...neon.tech/neondb`) — the same connection string the failed `migrate deploy` run
almost certainly used. Based on Prisma's documented, standard behavior for error P3018 (stated
here as inference, not observation): `migrate deploy` would have inserted exactly one row into
`_prisma_migrations` for `20260727000000_sales_architecture_v1` with `started_at` set and
`finished_at` left `NULL` (or `rolled_back_at` set, depending on whether Postgres auto-rolled back
the failed statement), and no further migrations would have been attempted — consistent with the
Founder's own report of a single failure on migration #1 blocking the rest. Confirming this
precisely requires the read-only query below, to be run only after Founder approval:

```sql
SELECT migration_name, started_at, finished_at, applied_steps_count, logs
FROM "_prisma_migrations"
ORDER BY started_at;
```

## Answer to Task 7's classification

**(C)** is the determined root cause. **(B)** and **(D)** are real, directly observed, and are
consequences of (C), not alternative explanations. **(A)** is false — no amount of reordering fixes
this, since the required `CREATE TABLE` statements do not exist anywhere in the history to reorder.
**(E)** is not needed — (C)/(B)/(D) together fully account for every observation in this audit.
