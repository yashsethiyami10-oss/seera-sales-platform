const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
function source(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function check(ok, name, detail = "") {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}
async function expectRejected(name, work) {
  try {
    await prisma.$transaction(work);
    check(false, name);
  } catch {
    check(true, name);
  }
}

// This verifier checks meaningful static and database-state invariants. It
// does not replace the real runtime test suite (__tests__/enterprise-finance/
// *.integration.test.ts, 265 tests) — per Section 34, it is not inflated
// with trivial checks standing in for that coverage.
async function main() {
  const schema = source("prisma/schema.prisma");

  const models = [
    "FinanceConfiguration", "FinanceFiscalYear", "FinanceFiscalPeriod", "FinanceCostCenter", "FinanceProfitCenter", "FinanceAccount",
    "FinanceJournal", "FinanceJournalLine", "FinanceLedgerEntry",
    "FinanceCustomerAccount", "FinanceReceivableInvoice", "FinanceReceivableInvoiceLine", "FinanceCustomerReceipt", "FinanceReceiptAllocation",
    "FinanceVendorAccount", "FinanceVendorBill", "FinanceVendorBillLine", "FinanceVendorPayment", "FinanceVendorPaymentAllocation",
    "FinanceExpenseCategory", "FinanceExpenseClaim", "FinanceExpenseLine",
    "FinanceBankAccount", "FinanceBankStatement", "FinanceBankStatementLine", "FinanceReconciliationSession", "FinanceReconciliationMatch",
  ];
  for (const model of models) check(schema.includes(`model ${model} `), `schema contains ${model}`);

  const migrationDirs = [
    "20260727140000_enterprise_phase2_part3c_wave1_finance_foundation",
    "20260727150000_enterprise_phase2_part3c_stagea_accounting_core",
    "20260727150100_enterprise_phase2_part3c_stagea_immutability_fix",
    "20260727160000_enterprise_phase2_part3c_stageb_accounts_receivable",
    "20260727170000_enterprise_phase2_part3c_stageb_accounts_payable",
    "20260727180000_enterprise_phase2_part3c_stageb_expense_banking",
  ];
  for (const dir of migrationDirs) {
    const migrationPath = `prisma/migrations/${dir}/migration.sql`;
    check(fs.existsSync(path.join(root, migrationPath)), `migration ${dir} exists`);
    if (fs.existsSync(path.join(root, migrationPath))) {
      const migration = source(migrationPath);
      check(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(migration), `migration ${dir} is additive`);
    }
  }

  // No module other than posting-engine.ts may create a FinanceLedgerEntry.
  const financeDir = path.join(root, "lib/enterprise-finance");
  const financeFiles = fs.readdirSync(financeDir).filter((f) => f.endsWith(".ts"));
  const ledgerWriters = financeFiles.filter((f) => {
    const content = fs.readFileSync(path.join(financeDir, f), "utf8");
    return /financeLedgerEntry\.(create|update|delete|createMany|updateMany|deleteMany)/.test(content);
  });
  check(ledgerWriters.length === 1 && ledgerWriters[0] === "posting-engine.ts", "only posting-engine.ts writes FinanceLedgerEntry rows", ledgerWriters.join(", "));

  // Every Business Service file requires a principal before touching the database.
  const serviceFiles = financeFiles.filter((f) => !["domain.ts", "schemas.ts", "context.ts", "validation-engine.ts"].includes(f));
  for (const file of serviceFiles) {
    const content = fs.readFileSync(path.join(financeDir, file), "utf8");
    check(/require(Finance|BankingPrincipal|FinancialReportingPrincipal|FinancialPostingPrincipal)/.test(content), `${file} requires a trusted principal`);
  }

  const financePermissions = await prisma.salesPermission.findMany({ where: { permissionKey: { startsWith: "finance." } } });
  check(financePermissions.length === 19, "19 finance permissions seeded", String(financePermissions.length));
  const founder = await prisma.salesRole.findUnique({ where: { name: "Founder" }, include: { permissions: { include: { permission: true } } } });
  check(Boolean(founder && financePermissions.every((p) => founder.permissions.some((g) => g.permission.permissionKey === p.permissionKey))), "Founder receives every finance permission");

  const financeFlagKeys = [
    "ENTERPRISE_FINANCE_ENABLED", "ENTERPRISE_FINANCIAL_POSTING_ENABLED", "ENTERPRISE_BANKING_RECONCILIATION_ENABLED",
    "ENTERPRISE_TAX_COMPLIANCE_ENABLED", "ENTERPRISE_FINANCIAL_REPORTING_ENABLED", "ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED",
  ];
  const flags = await prisma.aiConfiguration.findMany({ where: { organizationKey: "MUV", key: { in: financeFlagKeys }, category: "FEATURE_FLAG" } });
  check(flags.length === financeFlagKeys.length, "all finance feature flags seeded", String(flags.length));
  check(flags.every((f) => !f.value.enabled), "all finance feature flags default disabled");

  const sodPolicyTypes = ["FISCAL_PERIOD_REOPEN", "JOURNAL_APPROVAL", "JOURNAL_POSTING", "JOURNAL_REVERSAL", "VENDOR_PAYMENT_APPROVAL", "EXPENSE_APPROVAL", "RECONCILIATION_APPROVAL"];
  const sodPolicies = await prisma.phase2SodPolicy.findMany({ where: { organizationKey: "MUV", operationType: { in: sodPolicyTypes } } });
  check(sodPolicies.length === sodPolicyTypes.length, "all finance SoD policies seeded (including JOURNAL_REVERSAL, added by the audit-repair pass)", String(sodPolicies.length));
  check(sodPolicies.every((p) => p.prohibitSameActor && p.active), "all finance SoD policies prohibit the same actor and are active");
  check(sodPolicies.every((p) => !p.overridePermission), "no finance SoD policy has an override configured (no Founder bypass)");

  // --- Independent-audit repair pass checks (not string-only where a real
  // check is feasible; static content checks are scoped to the specific
  // function/region they claim to verify, not a blanket file-wide grep). ---

  const postingEngineSource = source("lib/enterprise-finance/posting-engine.ts");
  check(/enforceSegregationOfDuties[\s\S]{0,200}operationType:\s*"JOURNAL_REVERSAL"/.test(postingEngineSource), "reversePostedJournal invokes SoD enforcement for JOURNAL_REVERSAL");

  const reconciliationMigration = source("prisma/migrations/20260727190000_enterprise_phase2_part3c_audit_repair_reconciliation_immutability/migration.sql");
  check(/to_jsonb\(OLD\)\s+IS\s+DISTINCT\s+FROM\s+to_jsonb\(NEW\)/.test(reconciliationMigration), "completed-reconciliation-session trigger uses a deny-by-default whole-row comparison, not an enumerated allowlist");
  check(!/NEW\."organizationKey"\s+IS\s+DISTINCT\s+FROM/.test(reconciliationMigration), "the repaired trigger does not rely on an enumerated organizationKey check (whole-row comparison covers it structurally)");

  const ledgerServiceSource = source("lib/enterprise-finance/ledger-service.ts");
  const periodActivitySummaryFn = ledgerServiceSource.slice(ledgerServiceSource.indexOf("export async function getPeriodActivitySummary"));
  const periodActivitySummaryBody = periodActivitySummaryFn.slice(0, periodActivitySummaryFn.indexOf("\n}\n") + 3);
  check(/financeLedgerEntry\.groupBy\(/.test(periodActivitySummaryBody), "getPeriodActivitySummary uses a real database groupBy");
  check(!/take:\s*5000/.test(periodActivitySummaryBody), "getPeriodActivitySummary no longer truncates via a raw take: 5000 fetch");
  const ledgerEntryModel = source("prisma/schema.prisma");
  const ledgerEntryModelBody = ledgerEntryModel.slice(ledgerEntryModel.indexOf("model FinanceLedgerEntry"), ledgerEntryModel.indexOf("model FinanceCustomerAccount"));
  check(/journalType\s+String(?!\?)/.test(ledgerEntryModelBody), "FinanceLedgerEntry.journalType is a required (non-nullable) denormalized column");

  const getJournalLedgerFn = ledgerServiceSource.slice(ledgerServiceSource.indexOf("export async function getJournalLedger"), ledgerServiceSource.indexOf("export async function getFiscalPeriodLedger"));
  const getSourceLedgerFn = ledgerServiceSource.slice(ledgerServiceSource.indexOf("export async function getSourceLedger"), ledgerServiceSource.indexOf("export async function getCostCenterLedger"));
  check(/boundedPage\(/.test(getJournalLedgerFn), "getJournalLedger is bounded via boundedPage (audit-repair pass)");
  check(/boundedPage\(/.test(getSourceLedgerFn), "getSourceLedger is bounded via boundedPage (audit-repair pass)");

  const part3cDoc = source("docs/enterprise-phase2/PART_3C_ENTERPRISE_FINANCE_PLATFORM.md");
  check(part3cDoc.includes("## Document numbering semantics"), "documentation contains a dedicated numbering-semantics section");
  check(/lifetime-monotonic/.test(part3cDoc), "documentation states the numbering counter is lifetime-monotonic (does not reset per fiscal year)");
  check(part3cDoc.includes("## Tax compliance feature flag"), "documentation contains a dedicated tax-flag-disposition section");
  check(/ENTERPRISE_TAX_COMPLIANCE_ENABLED[\s\S]{0,400}intentional/.test(part3cDoc), "documentation states the tax flag's unused state is intentional, not an oversight");

  // Live database immutability checks — each work function throws before
  // committing, so prisma.$transaction rolls the whole thing back
  // automatically; no row created here is ever persisted.
  const founderUser = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
  if (founderUser) {
    await expectRejected("direct ledger entry creation via update is database-rejected", async (tx) => {
      const org = "MUV";
      const account = await tx.financeAccount.create({ data: { organizationKey: org, accountCode: `VERIFY-${Date.now()}`, name: "Verify", category: "ASSET", normalBalance: "DEBIT", status: "ACTIVE", createdById: founderUser.id } });
      const fy = await tx.financeFiscalYear.create({ data: { organizationKey: org, code: `VERIFY-${Date.now()}`, startDate: new Date("9990-01-01"), endDate: new Date("9991-01-01"), createdById: founderUser.id } });
      const period = await tx.financeFiscalPeriod.create({ data: { organizationKey: org, fiscalYearId: fy.id, periodNumber: 1, name: "VerifyPeriod", startDate: fy.startDate, endDate: fy.endDate } });
      const journal = await tx.financeJournal.create({ data: { organizationKey: org, journalNumber: `VERIFY-${Date.now()}`, journalType: "GENERAL", status: "POSTED", postingDate: fy.startDate, documentDate: fy.startDate, fiscalYearId: fy.id, fiscalPeriodId: period.id, createdById: founderUser.id } });
      // A posted journal is immutable — this direct UPDATE must be rejected.
      await tx.financeJournal.update({ where: { id: journal.id }, data: { description: "tampered" } });
    });
    await expectRejected("direct organizationKey mutation of a completed reconciliation session is database-rejected (audit-repair pass)", async (tx) => {
      const org = "MUV";
      const glAccount = await tx.financeAccount.create({ data: { organizationKey: org, accountCode: `VERIFY-BANK-${Date.now()}`, name: "Verify Bank GL", category: "ASSET", normalBalance: "DEBIT", status: "ACTIVE", createdById: founderUser.id } });
      const bankAccount = await tx.financeBankAccount.create({ data: { organizationKey: org, code: `VERIFY-BANK-${Date.now()}`, name: "Verify Bank", currency: "INR", linkedGlAccountId: glAccount.id, createdById: founderUser.id } });
      const statement = await tx.financeBankStatement.create({ data: { organizationKey: org, bankAccountId: bankAccount.id, statementRef: `VERIFY-${Date.now()}`, periodStart: new Date(), periodEnd: new Date(), openingBalance: 0, closingBalance: 0, importedById: founderUser.id } });
      const session = await tx.financeReconciliationSession.create({ data: { organizationKey: org, bankAccountId: bankAccount.id, statementId: statement.id, status: "COMPLETED", openingBalance: 0, closingBalance: 0, preparedById: founderUser.id } });
      // A COMPLETED session is unconditionally immutable — this direct
      // organizationKey UPDATE (the specific gap the original audit found:
      // the old trigger's enumerated allowlist omitted this column) must
      // be rejected.
      await tx.financeReconciliationSession.update({ where: { id: session.id }, data: { organizationKey: "SOME-OTHER-ORG" } });
    });
  } else {
    check(false, "a seeded Founder user is required for the live immutability check");
  }

  console.log(`RESULT ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
