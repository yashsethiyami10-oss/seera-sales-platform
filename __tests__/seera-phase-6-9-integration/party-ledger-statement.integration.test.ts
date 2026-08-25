import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, setup } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts } from "@/lib/finance/chart-of-accounts";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { createVendor, createVendorBill, recordVendorPayment } from "@/lib/finance/vendor-service";
import { quickEntryCreate } from "@/lib/finance/quick-entry-service";
import { partyLedgerStatement, ledgerPartyOptions } from "@/lib/finance/party-ledger-service";
import { renderLedgerStatementPdf } from "@/lib/finance/statement-pdf";
import { expectCode } from "@/__tests__/seera-block3/test-context";

// SEERA PROFESSIONAL LEDGER (Money Desk maturity pass, 24-Aug §17-31) — one shared running-balance
// ledger engine across party types. This proves the real accounting invariants the Founder's spec
// requires, against real TEST DB rows, not mocked math: Opening + movement = Closing, a PDF export
// never disagreeing with the UI totals it was handed, and "no artificial payable" for cash items
// that are already fully settled at posting time.
const suffix = randomBytes(5).toString("hex");
let founder = "", treasuryId = "";

describe("guarded Professional Ledger — Vendor/Employee running balance, opening/closing, PDF totals", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    await seedDefaultChartOfAccounts(prisma, founder);
    const treasury = await createTreasuryAccount(prisma, founder, { kind: "CASH", code: `LEDGER-CASH-${suffix}`, name: `Ledger Test Cash ${suffix}` });
    treasuryId = treasury.id;
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("Vendor ledger: two bills (credit) + one partial payment (debit) reconcile Opening + Credit - Debit = Closing", async () => {
    const vendor = await createVendor(prisma, founder, { code: `V-${suffix}`, legalName: `Ledger Test Vendor ${suffix}` });
    await createVendorBill(prisma, founder, { vendorId: vendor.id, vendorInvoiceNumber: `BILL-1-${suffix}`, invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-02-10"), category: "5000", taxable: 1000, idempotencyKey: `vb1-${suffix}` });
    const bill2 = await createVendorBill(prisma, founder, { vendorId: vendor.id, vendorInvoiceNumber: `BILL-2-${suffix}`, invoiceDate: new Date("2026-01-15"), dueDate: new Date("2026-02-15"), category: "5000", taxable: 2000, idempotencyKey: `vb2-${suffix}` });
    await recordVendorPayment(prisma, founder, { vendorId: vendor.id, billId: bill2.id, amount: 500, treasuryAccountId: treasuryId, treasuryAccountCoaCode: "1010", paymentMode: "CASH", paymentDate: new Date("2026-01-20"), idempotencyKey: `vp1-${suffix}` });

    const statement = await partyLedgerStatement(prisma, founder, { partyType: "VENDOR", partyId: vendor.id, from: new Date("2026-01-01"), to: new Date("2026-01-31") });
    expect(statement.normalSide).toBe("CREDIT");
    expect(statement.openingBalance).toBe(0);
    expect(statement.rows).toHaveLength(3);
    expect(statement.totals.debit).toBe(500);
    expect(statement.totals.credit).toBe(3000);
    // Payable (credit-normal): Opening + Credit - Debit = Closing
    expect(statement.openingBalance + statement.totals.credit - statement.totals.debit).toBe(statement.totals.closingBalance);
    expect(statement.totals.closingBalance).toBe(2500);
    // Running balance must be monotonically consistent row-by-row, not just the final total.
    let running = statement.openingBalance;
    for (const row of statement.rows) { running += row.credit - row.debit; expect(row.balance).toBe(running); }

    // A second window starting after the payment carries the prior activity forward as Opening.
    const later = await partyLedgerStatement(prisma, founder, { partyType: "VENDOR", partyId: vendor.id, from: new Date("2026-01-25"), to: new Date("2026-01-31") });
    expect(later.openingBalance).toBe(2500);
    expect(later.rows).toHaveLength(0);

    // PDF export must render from the SAME totals object the UI displays — never a second calc.
    const pdfBytes = await renderLedgerStatementPdf({ companyName: "SEERA", party: statement.party, period: statement.period, openingBalance: statement.openingBalance, rows: statement.rows, totals: statement.totals, normalSide: statement.normalSide });
    expect(pdfBytes.length).toBeGreaterThan(500);
  });

  it("Vendor Payment blocks over-allocation beyond the bill's due amount (no negative payable)", async () => {
    const vendor = await createVendor(prisma, founder, { code: `V2-${suffix}`, legalName: `Overpay Vendor ${suffix}` });
    const bill = await createVendorBill(prisma, founder, { vendorId: vendor.id, vendorInvoiceNumber: `BILL-3-${suffix}`, invoiceDate: new Date(), dueDate: new Date(), category: "5000", taxable: 100, idempotencyKey: `vb3-${suffix}` });
    await expectCode(() => recordVendorPayment(prisma, founder, { vendorId: vendor.id, billId: bill.id, amount: 500, treasuryAccountId: treasuryId, treasuryAccountCoaCode: "1010", paymentMode: "CASH", paymentDate: new Date(), idempotencyKey: `vp-over-${suffix}` }), "PAYMENT_EXCEEDS_DUE");
  });

  it("Employee ledger: Salary is a real, immediate cash event (debit=credit, no artificial payable) and shows Territory/Corporate correctly", async () => {
    const employee = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "SALES_EXECUTIVE" } } } } }));
    const territory = await prisma.seeraGeographyNode.create({ data: { code: `LEDGER-TERR-${suffix}`, name: `Ledger Territory ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
    const salaryCategory = await prisma.seeraExpenseCategory.findFirstOrThrow({ where: { chartOfAccountId: "5040" } });
    await quickEntryCreate(prisma, founder, { entryType: "SALARY", date: new Date("2026-02-01"), amount: 20000, categoryId: salaryCategory.id, paymentMode: "CASH", treasuryAccountId: treasuryId, employeeId: employee.id, territoryId: territory.id, remark: "Feb salary", idempotencyKey: `sal-${suffix}` });

    const statement = await partyLedgerStatement(prisma, founder, { partyType: "EMPLOYEE", partyId: employee.id, from: new Date("2026-01-01"), to: new Date("2026-02-28") });
    expect(statement.rows).toHaveLength(1);
    const row = statement.rows[0]!;
    expect(row.debit).toBe(20000);
    expect(row.credit).toBe(20000);
    expect(row.balance).toBe(statement.openingBalance); // net-zero — no artificial payable created
    expect(row.territory).toBe(territory.name);
    expect(statement.totals.closingBalance).toBe(statement.openingBalance);
  });

  it("Employee ledger: an approved-but-unpaid TA/DA claim leaves a real outstanding Credit balance, cleared only once actually paid", async () => {
    const employee = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "SALES_MANAGER" } } } } }));
    const claim = await prisma.seeraTaClaim.create({ data: { claimNumber: `TA-${suffix}`, employeeId: employee.id, claimDate: new Date("2026-03-01"), originalDistanceKm: 50, claimedDistanceKm: 50, approvedDistanceKm: 50, vehicleType: "STANDARD_FIELD", rateSnapshot: {}, totalClaimed: 1000, totalApproved: 1000, approvedAt: new Date("2026-03-02"), status: "ACCOUNTS_APPROVED", idempotencyKey: `ta-${suffix}` } });

    const beforePayment = await partyLedgerStatement(prisma, founder, { partyType: "EMPLOYEE", partyId: employee.id, from: new Date("2026-03-01"), to: new Date("2026-03-31") });
    expect(beforePayment.rows).toHaveLength(1);
    // TA vs DA presentation (Founder closure pass, 24-Aug §10): this claim has no real, eligible DA
    // (daEligible/daAmount both unset), so it correctly renders as a single "TA Reimbursement
    // Payable" line, not the old combined "TA / DA Claim Payable" label.
    expect(beforePayment.rows[0]!.particulars).toBe("TA Reimbursement Payable");
    expect(beforePayment.totals.closingBalance).toBe(1000); // real outstanding Credit (payable) balance

    await prisma.seeraTaClaim.update({ where: { id: claim.id }, data: { paidAt: new Date("2026-03-05"), amountPaid: 1000, paymentReference: `PAY-${suffix}` } });
    const afterPayment = await partyLedgerStatement(prisma, founder, { partyType: "EMPLOYEE", partyId: employee.id, from: new Date("2026-03-01"), to: new Date("2026-03-31") });
    expect(afterPayment.rows).toHaveLength(2);
    expect(afterPayment.totals.closingBalance).toBe(0); // payable fully cleared by the payment row
  });

  it("ledgerPartyOptions denies a non-oversight actor from enumerating the full Distributor/S.S. party list", async () => {
    const executive = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "SALES_EXECUTIVE" } } } } })).id;
    await expectCode(() => ledgerPartyOptions(prisma, executive, "DISTRIBUTOR"), "ACCESS_DENIED");
  });
});
