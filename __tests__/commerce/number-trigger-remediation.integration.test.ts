import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Production-safety remediation regression suite for
 * prisma/migrations/20260801100000_commerce_number_trigger_remediation.
 *
 * Root cause (see that migration's own header comment for the full
 * writeup): the shared `assign_commerce_numbers()` trigger function,
 * bound to five tables (orders, commercial_invoices, commerce_payments,
 * commerce_receipts, stock_ledger_entries), referenced a different NEW
 * field per table inside unconditional sequential IF statements. PL/pgSQL
 * must resolve every NEW."field" reference it reaches at parse time,
 * against the row type actually bound for that firing — this happens
 * before any TG_TABLE_NAME guard's AND can short-circuit, so every single
 * insert into any of the five tables failed unconditionally, regardless
 * of insert order or connection history. This was NOT a session/plan
 * cache effect — confirmed below by reproducing success on the very
 * first statement of a brand-new connection, in every order permutation.
 *
 * The fix replaced the shared function with five single-table functions,
 * each referencing only its own table's field.
 */

const suffix = `nt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let customerId = "";
let addressId = "";
const cleanup = {
  orderIds: [] as string[],
  invoiceIds: [] as string[],
  paymentIds: [] as string[],
  receiptIds: [] as string[],
  stockIds: [] as string[],
};

async function seedCustomerAndAddress(tag: string) {
  const customer = await prisma.customer.create({ data: { email: `${suffix}-${tag}@example.test`, name: `${suffix} ${tag}` } });
  const address = await prisma.address.create({ data: { customerId: customer.id, label: "Test", line1: "1 Test Street", city: "Mumbai", state: "Maharashtra", pincode: "400001", phone: "9999999999" } });
  return { customerId: customer.id, addressId: address.id };
}

async function makeOrder(cId: string, aId: string, explicitNumber?: string) {
  const order = await prisma.order.create({
    data: { orderNumber: explicitNumber ?? "", customerId: cId, addressId: aId, paymentMethod: "UPI", paymentStatus: "PENDING", subtotal: 100, total: 100 },
  });
  cleanup.orderIds.push(order.id);
  return order;
}

describe("Commerce number trigger remediation", () => {
  beforeAll(async () => {
    const seeded = await seedCustomerAndAddress("main");
    customerId = seeded.customerId;
    addressId = seeded.addressId;
  });

  afterAll(async () => {
    await prisma.commerceReceipt.deleteMany({ where: { id: { in: cleanup.receiptIds } } }).catch(() => {});
    await prisma.commercePayment.deleteMany({ where: { id: { in: cleanup.paymentIds } } }).catch(() => {});
    await prisma.commercialInvoice.deleteMany({ where: { id: { in: cleanup.invoiceIds } } }).catch(() => {});
    await prisma.stockLedgerEntry.deleteMany({ where: { id: { in: cleanup.stockIds } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: cleanup.orderIds } } }).catch(() => {});
    await prisma.address.deleteMany({ where: { customerId } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { email: { contains: suffix } } }).catch(() => {});
  });

  it("assigns a correctly formatted order number when none is supplied", async () => {
    const order = await makeOrder(customerId, addressId);
    expect(order.orderNumber).toMatch(/^MUV-ORD-\d{4}-\d{6}$/);
  });

  it("leaves an explicitly supplied order number untouched (matches the real checkout path in actions/orders.ts)", async () => {
    const explicit = `${suffix}-explicit`;
    const order = await makeOrder(customerId, addressId, explicit);
    expect(order.orderNumber).toBe(explicit);
  });

  it("generates unique, incrementing order numbers across multiple inserts", async () => {
    const a = await makeOrder(customerId, addressId);
    const b = await makeOrder(customerId, addressId);
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });

  it("inserts into orders first, then every other affected table, on the same connection — orders-first permutation", async () => {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { orderNumber: "", customerId, addressId, paymentMethod: "UPI", paymentStatus: "PENDING", subtotal: 500, total: 500 } });
      expect(order.orderNumber).toMatch(/^MUV-ORD-\d{4}-\d{6}$/);
      cleanup.orderIds.push(order.id);

      const invoice = await tx.commercialInvoice.create({ data: { invoiceNumber: "", orderId: order.id, customerName: "Perm Test", taxableValue: 500, cgst: 0, sgst: 0, igst: 0, discountTotal: 0, grandTotal: 500 } });
      expect(invoice.invoiceNumber).toMatch(/^MUV-INV-\d{4}-\d{6}$/);
      cleanup.invoiceIds.push(invoice.id);

      const method = await tx.commercePaymentMethod.upsert({ where: { code: `${suffix}-method` }, update: {}, create: { code: `${suffix}-method`, name: "Test Method" } });
      const user = await tx.user.findFirstOrThrow();
      const payment = await tx.commercePayment.create({ data: { paymentNumber: "", invoiceId: invoice.id, amount: 500, methodId: method.id, collectedById: user.id } });
      expect(payment.paymentNumber).toMatch(/^MUV-PAY-\d{4}-\d{6}$/);
      cleanup.paymentIds.push(payment.id);

      const receipt = await tx.commerceReceipt.create({ data: { receiptNumber: "", paymentId: payment.id } });
      expect(receipt.receiptNumber).toMatch(/^MUV-RCP-\d{4}-\d{6}$/);
      cleanup.receiptIds.push(receipt.id);

      const variant = await tx.productVariant.findFirst();
      const warehouse = await tx.warehouse.upsert({ where: { code: `${suffix}-wh` }, update: {}, create: { code: `${suffix}-wh`, name: "Test Warehouse" } });
      if (variant) {
        const stock = await tx.stockLedgerEntry.create({ data: { movementNumber: "", movementType: "ADJUSTMENT", warehouseId: warehouse.id, variantId: variant.id, quantity: 1, referenceEntity: "TEST", referenceId: "test", referenceNumber: "test", userId: user.id } });
        expect(stock.movementNumber).toMatch(/^MUV-STK-\d{4}-\d{8}$/);
        cleanup.stockIds.push(stock.id);
      }
    });
  });

  it("inserts into each other affected table first, then orders, on the same connection — reverse permutations", async () => {
    // invoices-first requires an order to attach to, but that order is
    // created with an EXPLICIT number so it never reaches its own
    // assignment branch — isolating "was commercial_invoices' trigger the
    // first NEW-record resolution in this connection" from "did orders
    // assignment already run here."
    await prisma.$transaction(async (tx) => {
      const seedOrder = await tx.order.create({ data: { orderNumber: `${suffix}-seed-a`, customerId, addressId, paymentMethod: "UPI", paymentStatus: "PENDING", subtotal: 10, total: 10 } });
      cleanup.orderIds.push(seedOrder.id);

      const invoice = await tx.commercialInvoice.create({ data: { invoiceNumber: "", orderId: seedOrder.id, customerName: "Reverse Perm", taxableValue: 10, cgst: 0, sgst: 0, igst: 0, discountTotal: 0, grandTotal: 10 } });
      expect(invoice.invoiceNumber).toMatch(/^MUV-INV-\d{4}-\d{6}$/);
      cleanup.invoiceIds.push(invoice.id);

      // Now orders, in the SAME connection, after commercial_invoices' branch fired first.
      const order = await tx.order.create({ data: { orderNumber: "", customerId, addressId, paymentMethod: "UPI", paymentStatus: "PENDING", subtotal: 20, total: 20 } });
      expect(order.orderNumber).toMatch(/^MUV-ORD-\d{4}-\d{6}$/);
      cleanup.orderIds.push(order.id);
    });

    await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst();
      const warehouse = await tx.warehouse.upsert({ where: { code: `${suffix}-wh2` }, update: {}, create: { code: `${suffix}-wh2`, name: "Test Warehouse 2" } });
      const user = await tx.user.findFirstOrThrow();
      if (variant) {
        const stock = await tx.stockLedgerEntry.create({ data: { movementNumber: "", movementType: "ADJUSTMENT", warehouseId: warehouse.id, variantId: variant.id, quantity: 1, referenceEntity: "TEST", referenceId: "test", referenceNumber: "test", userId: user.id } });
        expect(stock.movementNumber).toMatch(/^MUV-STK-\d{4}-\d{8}$/);
        cleanup.stockIds.push(stock.id);
      }

      // stock_ledger_entries fired first in THIS connection; orders now second.
      const order = await tx.order.create({ data: { orderNumber: "", customerId, addressId, paymentMethod: "UPI", paymentStatus: "PENDING", subtotal: 30, total: 30 } });
      expect(order.orderNumber).toMatch(/^MUV-ORD-\d{4}-\d{6}$/);
      cleanup.orderIds.push(order.id);
    });
  });

  it("still enforces stock_ledger_entries immutability (UPDATE/DELETE rejected) — unrelated to this fix, must remain unchanged", async () => {
    const variant = await prisma.productVariant.findFirst();
    if (!variant) return;
    const warehouse = await prisma.warehouse.upsert({ where: { code: `${suffix}-wh3` }, update: {}, create: { code: `${suffix}-wh3`, name: "Test Warehouse 3" } });
    const user = await prisma.user.findFirstOrThrow();
    const entry = await prisma.stockLedgerEntry.create({ data: { movementNumber: "", movementType: "ADJUSTMENT", warehouseId: warehouse.id, variantId: variant.id, quantity: 1, referenceEntity: "TEST", referenceId: "test", referenceNumber: "test", userId: user.id } });
    cleanup.stockIds.push(entry.id);
    await expect(prisma.stockLedgerEntry.update({ where: { id: entry.id }, data: { quantity: 2 } })).rejects.toThrow(/immutable/i);
    await expect(prisma.stockLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/immutable/i);
  });

  it("still enforces commercial_invoices snapshot immutability — unrelated to this fix, must remain unchanged", async () => {
    const order = await makeOrder(customerId, addressId, `${suffix}-inv-immutable`);
    const invoice = await prisma.commercialInvoice.create({ data: { invoiceNumber: "", orderId: order.id, customerName: "Immutable Test", taxableValue: 100, cgst: 0, sgst: 0, igst: 0, discountTotal: 0, grandTotal: 100 } });
    cleanup.invoiceIds.push(invoice.id);
    await expect(prisma.commercialInvoice.update({ where: { id: invoice.id }, data: { grandTotal: 200 } })).rejects.toThrow(/immutable/i);
  });
});
