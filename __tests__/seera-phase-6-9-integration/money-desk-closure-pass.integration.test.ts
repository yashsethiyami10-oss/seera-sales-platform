import { randomBytes } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma, roleUsers, setup, expectCode } from "@/__tests__/seera-block3/test-context";
import { seedDefaultChartOfAccounts } from "@/lib/finance/chart-of-accounts";
import { createTreasuryAccount } from "@/lib/finance/treasury-service";
import { createVendor, createVendorBill } from "@/lib/finance/vendor-service";
import { recordAndPostReceipt } from "@/lib/sales-distribution/financial-service";
import { partyLedgerStatement } from "@/lib/finance/party-ledger-service";
import { createMoneyDeskTransaction, moneyDeskTransactionDetail } from "@/lib/finance/money-desk-service";
import { deriveCostCentre } from "@/lib/finance/cost-centre";

// SEERA MONEY DESK — Founder pre-push closure pass (24-Aug). Covers the genuinely new pieces of
// this pass, against real TEST DB state: the Guided Money In receipt orchestrator (wraps the
// EXISTING recordPayment/verifyPayment/allocateVerifiedPayment pipeline, never a new posting
// path), the Money Desk Transaction Detail read model, and the Cost Centre / TA-vs-DA presentation
// rules. Does not re-test anything already proven by party-ledger-statement.integration.test.ts.
const suffix = randomBytes(5).toString("hex");
let founder = "", treasuryId = "";

describe("guarded Money Desk closure pass — Guided Receipt, Transaction Detail, Cost Centre, TA/DA", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    await seedDefaultChartOfAccounts(prisma, founder);
    const treasury = await createTreasuryAccount(prisma, founder, { kind: "BANK", code: `CLOSURE-BANK-${suffix}`, name: `Closure Test Bank ${suffix}` });
    treasuryId = treasury.id;
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("Guided Distributor Receipt (unallocated/on-account) posts exactly once and appears as a real Credit on the Distributor Ledger", async () => {
    const distributor = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `D-${suffix}`, legalName: `Guided Receipt Distributor ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000021" }, addresses: {}, territoryIds: [], createdById: founder } });
    const idempotencyKey = `guided-receipt-${suffix}`;
    const result = await recordAndPostReceipt(prisma, founder, {
      payerType: "DISTRIBUTOR",
      payerId: distributor.id,
      payeeType: "COMPANY",
      payeeId: "COMPANY",
      amount: 5000,
      reference: `UTR-${suffix}`,
      paymentMode: "BANK",
      paymentDate: new Date("2026-04-01"),
      reason: "Guided Money In UAT",
      idempotencyKey,
    });
    expect(result.payment.status).toBe("VERIFIED");
    expect(result.allocation).toBeNull();

    const statement = await partyLedgerStatement(prisma, founder, { partyType: "DISTRIBUTOR", partyId: distributor.id, from: new Date("2026-01-01"), to: new Date("2026-12-31") });
    expect(statement.rows).toHaveLength(1);
    expect(statement.rows[0]!.credit).toBe(5000);
    expect(statement.totals.closingBalance).toBe(-5000); // a Distributor with only an advance has a real credit (negative debit-normal) balance until allocated

    // EXACTLY ONCE: retrying with a genuinely duplicate reference/payer/payee/date must be refused
    // by the underlying recordPayment dedup check, never silently create a second posting.
    await expectCode(
      () => recordAndPostReceipt(prisma, founder, { payerType: "DISTRIBUTOR", payerId: distributor.id, payeeType: "COMPANY", payeeId: "COMPANY", amount: 5000, reference: `UTR-${suffix}`, paymentMode: "BANK", paymentDate: new Date("2026-04-01"), reason: "retry", idempotencyKey: `${idempotencyKey}-retry` }),
      "DUPLICATE_PAYMENT_REFERENCE",
    );
  });

  it("Money Desk Transaction Detail resolves a Vendor Payment to a real Vendor Ledger link, not a raw id", async () => {
    const vendor = await createVendor(prisma, founder, { code: `MDV-${suffix}`, legalName: `Money Desk Detail Vendor ${suffix}` });
    const bill = await createVendorBill(prisma, founder, { vendorId: vendor.id, vendorInvoiceNumber: `MDV-BILL-${suffix}`, invoiceDate: new Date(), dueDate: new Date(), category: "5000", taxable: 800, idempotencyKey: `mdv-bill-${suffix}` });
    const txn = await createMoneyDeskTransaction(prisma, founder, {
      purposeCode: "PAY-VEN",
      direction: "BANK_OUT",
      amount: 800,
      date: new Date(),
      treasuryAccountId: treasuryId,
      counterpartyType: "VENDOR",
      counterpartyId: vendor.id,
      description: "Vendor payment detail UAT",
      formData: { billId: bill.id, paymentMode: "BANK", treasuryAccountCoaCode: "1000" },
      idempotencyKey: `mdv-txn-${suffix}`,
    });
    expect(txn.status).toBe("POSTED");

    const detail = await moneyDeskTransactionDetail(prisma, founder, txn.id);
    expect(detail.purposeLabel).toBe("Vendor Payment");
    expect(detail.status).toBe("POSTED");
    expect(detail.isSelf).toBe(true);
    expect(detail.ledgerLink).not.toBeNull();
    expect(detail.ledgerLink!.partyType).toBe("VENDOR");
    expect(detail.ledgerLink!.partyId).toBe(vendor.id);
    expect(detail.ledgerLink!.label).toContain("Money Desk Detail Vendor");
  });

  it("Cost Centre is a real, honest derivation — coexists with Territory, never both", () => {
    expect(deriveCostCentre({ chartOfAccountId: "5070", parentGroup: "SALES_MARKETING" }, false)).toBe("Corporate"); // Meta Ads
    expect(deriveCostCentre({ chartOfAccountId: "5000", parentGroup: "PURCHASE_OPERATIONS" }, false)).toBe("Manufacturing"); // Raw Material
    expect(deriveCostCentre({ chartOfAccountId: "5030", parentGroup: "FACTORY" }, false)).toBe("Warehouse"); // Warehousing
    expect(deriveCostCentre({ chartOfAccountId: "5220", parentGroup: "ADMIN_OFFICE" }, false)).toBe("Head Office"); // Office Expense
    expect(deriveCostCentre({ chartOfAccountId: "5070", parentGroup: "SALES_MARKETING" }, true)).toBeNull(); // Territory present -> no Cost Centre shown
    expect(deriveCostCentre(null, false)).toBe("Corporate");
  });

  it("TA/DA: a claim with no real DA shows a single, correctly-named TA Reimbursement Payable — never a combined 'TA/DA' line", async () => {
    const employee = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "SALES_EXECUTIVE" } } } } }));
    await prisma.seeraTaClaim.create({ data: { claimNumber: `TA-NODA-${suffix}`, employeeId: employee.id, claimDate: new Date("2026-05-01"), originalDistanceKm: 25, claimedDistanceKm: 25, approvedDistanceKm: 25, vehicleType: "STANDARD_FIELD", rateSnapshot: {}, totalClaimed: 500, totalApproved: 500, approvedAt: new Date("2026-05-02"), status: "ACCOUNTS_APPROVED", idempotencyKey: `ta-noda-${suffix}` } });
    const statement = await partyLedgerStatement(prisma, founder, { partyType: "EMPLOYEE", partyId: employee.id, from: new Date("2026-05-01"), to: new Date("2026-05-31") });
    expect(statement.rows).toHaveLength(1);
    expect(statement.rows[0]!.particulars).toBe("TA Reimbursement Payable");
    expect(statement.rows[0]!.credit).toBe(500);
  });

  it("TA/DA: a claim WITH a real, eligible DA amount shows two separate lines that sum exactly to totalApproved", async () => {
    const employee = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "SALES_MANAGER" } } } } }));
    await prisma.seeraTaClaim.create({ data: { claimNumber: `TA-DA-${suffix}`, employeeId: employee.id, claimDate: new Date("2026-06-01"), originalDistanceKm: 40, claimedDistanceKm: 40, approvedDistanceKm: 40, vehicleType: "STANDARD_FIELD", rateSnapshot: {}, totalClaimed: 800, totalApproved: 800, daEligible: true, daAmount: 150, approvedAt: new Date("2026-06-02"), status: "ACCOUNTS_APPROVED", idempotencyKey: `ta-da-${suffix}` } });
    const statement = await partyLedgerStatement(prisma, founder, { partyType: "EMPLOYEE", partyId: employee.id, from: new Date("2026-06-01"), to: new Date("2026-06-30") });
    expect(statement.rows).toHaveLength(2);
    const ta = statement.rows.find((r) => r.particulars === "TA Reimbursement Payable")!;
    const da = statement.rows.find((r) => r.particulars === "DA Reimbursement Payable")!;
    expect(ta).toBeDefined();
    expect(da).toBeDefined();
    expect(da.credit).toBe(150);
    expect(ta.credit + da.credit).toBe(800);
  });
});
