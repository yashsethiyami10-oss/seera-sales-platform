# Part K — Trial Data Cleanup Playbook (Founder-executed)

Generated 2026-09-05 from `classify-trial-vs-genuine-production-data-readonly.ts` (strictly
read-only — see that script for the exact raw output this table is built from; re-run it any time
for a fresh snapshot before acting, since production keeps changing).

**Why this is a playbook, not one autonomous script:** several of these tables carry real accounting
or traceability weight (Money Desk transactions are ledger postings; Commercial Documents are
invoices/credit notes; TA Claims feed payroll), most FK relations from Retailer/Order use
`onDelete: Restrict` (Postgres will simply refuse a delete that would orphan a row — a safety net,
not a bug), and this agent's standing rule is to never guess at which real customer/vendor/financial
record is "just test data" — that judgment belongs to the Founder. What follows is evidence, a
recommendation per category, and (only where the evidence is unambiguous) a ready script.

## 1. Retailers (50 total) — ALL already `lifecycle: INACTIVE`

Every retailer currently in production is already `INACTIVE`. Since the retailer-visibility fix
shipped earlier this session (`lib/sales-distribution/field-portal-service.ts`, `executiveBeat`),
inactive retailers are already excluded from field executives' live stop lists — so the *functional*
zero-state (nobody sees this clutter in their daily work) is already achieved for this table without
any deletion. What remains is only a **cosmetic** concern: Founder/Manager dashboards that list
retailers regardless of lifecycle would still show these 50 rows.

Two rows are unambiguous, zero-value QA fixtures from this session's own earlier testing, with the
only two Restrict-enforced relations (`orders`, `visits`) both confirmed at 0 by the classification
script's own Prisma `_count`:

| id | code | name | orders | visits |
|---|---|---|---|---|
| `cmt584m1n000m19nq1k9f3u9n` | RT-8F276754EB51F5 | "Jhansi Handoff Proof Retailer" | 0 | 0 |
| `cmt5g3p10000f42xh4z1yj93e` | RT-D3E65D018E5AF9 | "Stop Snapshot Immutability Proof Retailer" | 0 | 0 |

**Recommendation: safe to delete.** Script: `delete-zero-dependency-proof-retailers.ts` (below),
dry-run by default.

The other 48 rows: a mix of clearly-gibberish names ("sfgerge", "Ndmsksjs", "Djjdj", "Xgxg",
"Fucjjc", "Ghhbb" — field-rep UAT noise) and plausible real Kirana-store names ("Sm kirana", "Ram
kirana", "Ashok kirana", "MUV CARE CO.") — all still `INACTIVE`, all still holding real
`SeeraSalesOrder`/`SeeraVisit` rows (Restrict FK), several of those orders `SUBMITTED`/`DELIVERED`/
`DISPATCHED` (not just `CANCELLED`). **Recommendation: leave as-is** — they're already invisible in
day-to-day field/beat views; a real delete would require also resolving 78 order rows and touching
Commercial Documents/Money Desk rows that trace back to some of them, which is exactly the "don't
guess" line. If the Founder wants a specific subset gone, list the exact retailer `id`s and this
becomes a five-minute follow-up (the pattern is proven below).

## 2. Sales Orders (78) — inherits the Retailer decision

No independent cleanup recommended here; see §1. Note 12 are already `CANCELLED` on their own (no
action needed — they're already terminal, just still counted in `count()` totals).

## 3. Distributors / Super Stockist / Vendors (16 + 3)

All 16 Distributor/Super-Stockist rows have real, well-formed business names and 10-digit Indian
mobile numbers ("Somya General Store", "Kuldeep Jha", "M/s Ratan Products & Traders", etc.) —
**no evidence of test data here.** Recommendation: **keep all 16**, no action.

3 Vendor rows, all named "CLASSIC INDUSTRIES", created within the last two days:
- `cmtjwx68n00083drgly7xnoyx` — phone missing
- `cmtlnmaw5000ey9w8p5k9vjvz` — phone 9928598290
- `cmtlnmryb000hy9w805or88a1` — phone 9928598290

The last two are exact duplicates of each other (same name, same phone, one day apart) and the
first is likely an earlier, incomplete attempt at creating the same vendor. **Recommendation:
Founder judgment required** — confirm which one has real Vendor Bills against it (if any) before
merging/removing the other two; do not delete blind since `SeeraVendorBill.vendorId` is a live FK.

## 4. Money Desk Transactions (12) — never raw-delete; VOID via the app itself

The canonical, audit-preserving "remove" action already exists: `voidMoneyDeskTransaction` (reverses
any posted journal, keeps the row for history, exactly Money Desk's own designed correction path).
This is a **UI action, not a script** — log in as Founder (who bypasses the self-approval/void
restriction via `system:super_admin`) and use Money Desk → Recent Transactions → Void on each row
below, reason e.g. "Pre-launch test entry — voided during trial-data cleanup":

| id | number | purpose | amount | party | status | evidence |
|---|---|---|---|---|---|---|
| `cmt4ugghn003vtkqur2b2nws9` | MD-278887B71A2F8774 | OTHER CASH_IN | 2000 | "diesel" | POSTING | lowercase free-text party, not a real counterparty name |
| `cmtix7lc40032hft7wg3khjnp` | MD-AF1D86A7E9EAB04C | OTHER BANK_IN | 358 | "Gghj" | POSTING | gibberish party name |
| `cmtix7rzf0037hft7c8qi38db` | MD-BA0A87A57AEFA0A1 | OTHER BANK_IN | 358 | "Gghj" | POSTING | gibberish party name, duplicate of the row above |

The other 9 rows (`SALE-OFF` to Asha Enterprises, `REC-INS` receipts, `EXP-FUEL`/`EXP-PACK` with real
vendor/route descriptions like "BHILWARA MATERIAL DELIVERY", "RIDHI SIDHI PACKAGING") read as
genuine, if small, real operational entries — **recommendation: keep**, Founder can void any
individually if they disagree.

## 5. Commercial Documents (29) — never raw-delete; cancel via the app (where issued) or just ignore (DRAFT)

No generic "void invoice" script exists in this codebase (only `cancelCompanyOrder` for company
replenishment orders) — cancellation of an issued Tax Invoice/Credit Note is a real accounting action
with GST implications and must go through the Founder's own judgment in the Finance workspace, not
a script. 8 rows are still `DRAFT` (never issued, zero real-world effect — e.g.
`cmsxi1ma200047xuh5fxtcva7`, `cmt4bw8lf001bmuzqr0ftwffz`) and can simply be abandoned/ignored; they
carry no obligation. The `ISSUED`/`ACCEPTED`/`CONVERTED` rows trace to the real-looking distributor
"Kuldeep Jha" (`DIST-KJ-*`) and Super Stockist "M/s Ratan Products & Traders" (`SSWS-01/*`) —
**recommendation: keep**, these look like real onboarding transactions with real parties, not test
noise.

## 6. Expenses (3) and TA/DA Claims (12)

All 3 expenses (Diesel ₹500 POSTED, Salary/Labour ₹2000, Diesel payment ₹500 — both SUBMITTED today)
read as genuine, small, real operational entries tied to the real active field team.
**Recommendation: keep, no action.**

12 TA/DA claims all trace to two real, known employee ids (`cmswmy5je00079oa9nffc08wp`,
`cmstxqe9u0000gudquhbd30nl` — the real sales roster from the read-only audit), in normal in-flight
statuses (`READY_FOR_REVIEW`, `SENT_TO_ACCOUNTS`, one `MANAGER_REJECTED`). **Recommendation: keep**
— this is the real team's real TA/DA workflow being used, not test fixtures.

## 7. Users / Treasury Accounts / Documents / RBAC / Product & Material Masters / System Configuration

Untouched, per Part K/L's explicit preserve list — not included in any script here, and none of
these tables share a foreign key with `delete-zero-dependency-proof-retailers.ts`'s two target
`SeeraRetailer` rows (confirmed by that script's own re-verified `_count` on `orders`/`visits` only).
Concretely, out of scope for any script in this playbook: `User`/`Role`/`RolePermission`/
`SeeraAssignment` (RBAC — separately, exhaustively verified zero-drift against `rbac-catalog.ts`
in `rbac-full-matrix-drift-check-readonly.ts`), `SeeraTreasuryAccount`, every document/`StoredFile`
table, `SeeraSku`/`SeeraManufacturingMaterial`/`SeeraBom`/`SeeraChartOfAccount` and every other
master/config table. Trial *business activity* (test orders, receipts, TA claims, money-desk
entries) is what Part K/L target — never the masters or configuration those transactions reference.

## Summary of what this playbook actually recommends doing right now

1. Run `delete-zero-dependency-proof-retailers.ts` (dry-run first, then `--execute`) — removes the
   2 zero-orders/zero-visits QA fixture retailers. Zero risk, proven by the DB's own relation counts.
2. Optionally void the 3 flagged Money Desk test transactions from the Money Desk UI directly.
3. Everything else: leave as-is. It's either already functionally invisible (INACTIVE retailers,
   already-CANCELLED orders), already zero-effect (DRAFT documents), or reads as genuine real
   business/operational activity from the real team — not this agent's call to remove, and not
   safe to script blind given Restrict FKs and real accounting impact.
