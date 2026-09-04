import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// Final Integration mission, Part K — STRICTLY READ-ONLY. This does not delete or modify anything.
//
// Purpose: give the Founder a real, evidence-based list of every candidate record for the mandated
// trial-data cleanup (spec Part K), WITHOUT this agent guessing which ones are "trial" and silently
// acting on that guess. Every row below is printed with enough identifying detail (name, contact,
// date, amount, status, and whether it has a downstream accounting/FK dependency) for a human to
// decide KEEP vs REMOVE. Nothing here is auto-classified as safe to delete.
//
// This script intentionally does NOT write to production — see cleanup-trial-data-PLAYBOOK.md
// (companion doc) for why the actual removal step is not a single autonomous script: several of
// these tables have real accounting impact (Money Desk transactions, Commercial Documents, TA
// claims) where the correct "removal" is voiding/reversing through the app's own canonical actions,
// never a raw DELETE — and several have Prisma onDelete: Restrict foreign keys, so a naive delete
// order will simply fail rather than silently cascade (a safety net, not a script bug).
function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "production", write: false, targetUrl: prod, productionUrl: prod, testUrl: test });
const url = new URL(prod);
url.searchParams.set("connect_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

// Weak, non-authoritative signal only — printed as a hint, never used to auto-decide. A real
// business name can legitimately contain "test" (e.g. "Testu Kirana Store"); a fixture name almost
// always matches one of these more specifically (seera.test domain, "Test Retailer", "zz-", "UAT").
function looksLikeFixture(...fields: (string | null | undefined)[]): boolean {
  const joined = fields.filter(Boolean).join(" ").toLowerCase();
  return /seera\.test|@test\.|test retailer|test customer|test vendor|zz-test|zz_test|^test |fixture|uat[\s-]?test|dummy|sample data/.test(joined);
}

async function main() {
  console.log(`[GUARD] role=${target.role} fp=${target.fingerprint} (READ-ONLY — no writes issued)\n`);

  const realSalesUserIds = new Set(
    (
      await prisma.userRoleAssignment.findMany({
        where: { status: "ACTIVE", role: { code: { in: ["SALES_EXECUTIVE", "SALES_MANAGER", "SALES_HEAD", "INSTITUTIONAL_SALES_OFFICER", "ACCOUNTS_MANAGER", "ACCOUNTS_EXECUTIVE"] } } },
        select: { userId: true },
      })
    ).map((r) => r.userId),
  );

  console.log("=== RETAILERS ===");
  const retailers = await prisma.seeraRetailer.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, businessName: true, ownerName: true, mobile: true, email: true, source: true, lifecycle: true, createdById: true, createdAt: true, _count: { select: { orders: true, visits: true } } },
  });
  for (const r of retailers) {
    const flag = looksLikeFixture(r.businessName, r.ownerName, r.email) ? "  <-- looks fixture-like (name/email pattern)" : "";
    const createdByKnownSalesUser = realSalesUserIds.has(r.createdById) ? "known-sales-user" : "UNKNOWN-CREATOR";
    console.log(`  [${r.id}] ${r.code} "${r.businessName}" owner=${r.ownerName ?? "—"} mobile=${r.mobile ?? "—"} source=${r.source} lifecycle=${r.lifecycle} created=${r.createdAt.toISOString().slice(0, 10)} by=${createdByKnownSalesUser} orders=${r._count.orders} visits=${r._count.visits}${flag}`);
  }

  console.log("\n=== SALES ORDERS ===");
  const orders = await prisma.seeraSalesOrder.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, orderNumber: true, type: true, status: true, retailerId: true, total: true, source: true, sourcePortal: true, createdAt: true },
  });
  for (const o of orders) {
    console.log(`  [${o.id}] ${o.orderNumber} type=${o.type} status=${o.status} retailerId=${o.retailerId ?? "—"} total=${o.total} source=${o.source}/${o.sourcePortal} created=${o.createdAt.toISOString().slice(0, 10)}`);
  }

  console.log("\n=== VISITS ===");
  const visitCount = await prisma.seeraVisit.count();
  console.log(`  ${visitCount} visit row(s) — printed as a count only (no standalone business meaning outside their retailer/order); see the retailer rows above for the _count.visits per retailer.`);

  console.log("\n=== DISTRIBUTORS / SUPER STOCKISTS / VENDORS ===");
  const partners = await prisma.seeraPartner.findMany({ where: { type: { in: ["DISTRIBUTOR", "SUPER_STOCKIST"] } }, select: { id: true, type: true, legalName: true, primaryContact: true, createdAt: true } });
  for (const p of partners) console.log(`  [${p.id}] ${p.type} "${p.legalName}" contact=${JSON.stringify(p.primaryContact)} created=${p.createdAt.toISOString().slice(0, 10)}`);
  const vendors = await prisma.seeraVendor.findMany({ select: { id: true, legalName: true, phone: true, createdAt: true } });
  for (const v of vendors) console.log(`  [${v.id}] VENDOR "${v.legalName}" phone=${v.phone ?? "—"} created=${v.createdAt.toISOString().slice(0, 10)}`);

  console.log("\n=== MONEY DESK TRANSACTIONS (financial — removal = VOID via voidMoneyDeskTransaction, never raw delete) ===");
  const mdTxns = await prisma.seeraMoneyDeskTransaction.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, transactionNumber: true, purposeCode: true, direction: true, status: true, amount: true, counterpartyName: true, voidedAt: true, createdAt: true },
  });
  for (const t of mdTxns) console.log(`  [${t.id}] ${t.transactionNumber} ${t.purposeCode} ${t.direction} status=${t.status} amount=${t.amount} party=${t.counterpartyName ?? "—"} voided=${t.voidedAt ? "YES" : "no"} created=${t.createdAt.toISOString().slice(0, 10)}`);

  console.log("\n=== COMMERCIAL DOCUMENTS (invoices/receipts — real accounting artifacts, removal = void/cancel via canonical action, never raw delete) ===");
  const docs = await prisma.seeraCommercialDocument.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, documentNumber: true, type: true, status: true, grandTotal: true, buyerSnapshot: true, createdAt: true } });
  for (const d of docs) {
    const buyer = (d.buyerSnapshot as { name?: string } | null)?.name ?? "—";
    console.log(`  [${d.id}] ${d.documentNumber} ${d.type} status=${d.status} grandTotal=${d.grandTotal} buyer=${buyer} created=${d.createdAt.toISOString().slice(0, 10)}`);
  }

  console.log("\n=== EXPENSES ===");
  const expenses = await prisma.seeraExpense.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, expenseNumber: true, status: true, amount: true, description: true, createdAt: true } });
  for (const e of expenses) console.log(`  [${e.id}] ${e.expenseNumber} status=${e.status} amount=${e.amount} desc=${e.description ?? "—"} created=${e.createdAt.toISOString().slice(0, 10)}`);

  console.log("\n=== TA/DA CLAIMS ===");
  const claims = await prisma.seeraTaClaim.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, claimNumber: true, status: true, totalApproved: true, employeeId: true, createdAt: true } });
  for (const c of claims) console.log(`  [${c.id}] ${c.claimNumber} status=${c.status} approved=${c.totalApproved ?? "—"} employeeId=${c.employeeId} created=${c.createdAt.toISOString().slice(0, 10)}`);

  console.log("\n=== USERS / TREASURY ACCOUNTS (Part K — MUST be preserved, printed here only for completeness) ===");
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  console.log(`  ${users.length} user(s) — NOT a deletion candidate under Part K.`);
  const treasury = await prisma.seeraTreasuryAccount.findMany({ select: { id: true, name: true } });
  console.log(`  ${treasury.length} Treasury Account(s) — NOT a deletion candidate under Part K.`);

  console.log("\n=== SUMMARY ===");
  console.log({ retailers: retailers.length, orders: orders.length, visits: visitCount, distributorsAndSS: partners.length, vendors: vendors.length, moneyDeskTxns: mdTxns.length, moneyDeskVoided: mdTxns.filter((t) => t.voidedAt).length, commercialDocs: docs.length, expenses: expenses.length, taClaims: claims.length });
  console.log("\nNo classification decision was made by this script. Review each section above and build an explicit ID allow-list before running any removal step (see cleanup-trial-data-PLAYBOOK.md).");
}
main().finally(() => prisma.$disconnect());
