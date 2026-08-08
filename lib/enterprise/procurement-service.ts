import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, requireVersion } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";
import { recordFinanceEvent } from "@/lib/enterprise-finance/event-posting-service";
import { getOrCreateVendorAccount, createAndPostVendorBill } from "@/lib/enterprise-finance/ap-service";

const requisitionInput = z.object({
  requiredByDate: z.coerce.date().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  purpose: z.string().max(5000).optional(),
  warehouseId: z.string().cuid().optional(),
  preferredVendorId: z.string().cuid().optional(),
  items: z.array(z.object({
    variantId: z.string().cuid(),
    quantity: z.coerce.number().positive(),
    unitOfMeasure: z.string().min(1).max(30),
    estimatedPrice: z.coerce.number().nonnegative().optional(),
  })).min(1),
});

export async function createPurchaseRequisition(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REQUISITION_CREATE, "ENTERPRISE_PROCUREMENT_ENABLED");
  const data = requisitionInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    if (data.warehouseId && !(await tx.warehouse.findUnique({ where: { id: data.warehouseId } }))) {
      throw new AppError("Warehouse is invalid");
    }
    const variants = await tx.productVariant.count({ where: { id: { in: data.items.map((item) => item.variantId) } } });
    if (variants !== new Set(data.items.map((item) => item.variantId)).size) throw new AppError("A material reference is invalid");
    if (data.preferredVendorId) {
      const vendor = await tx.enterpriseVendor.findFirst({ where: { id: data.preferredVendorId, organizationKey: principal.organizationKey } });
      if (!vendor) throw new AppError("Preferred vendor is invalid");
    }
    const requisitionNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "PURCHASE_REQUISITION", "PR");
    const requisition = await tx.enterprisePurchaseRequisition.create({
      data: {
        organizationKey: principal.organizationKey, requisitionNumber, requesterId: principal.id,
        requiredByDate: data.requiredByDate, priority: data.priority, purpose: data.purpose,
        warehouseId: data.warehouseId, preferredVendorId: data.preferredVendorId,
        createdById: principal.id,
        items: { create: data.items.map((item) => ({ ...item, organizationKey: principal.organizationKey })) },
      },
      include: { items: true },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_procurement", action: "PURCHASE_REQUISITION_CREATED",
      entityType: "EnterprisePurchaseRequisition", entityId: requisition.id,
      description: `Purchase requisition ${requisitionNumber} created`,
      next: { requisitionNumber, status: requisition.status, itemCount: requisition.items.length },
    });
    return { entity: requisition, correlationId };
  });
}

export async function submitPurchaseRequisition(id: string, version: number) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REQUISITION_SUBMIT, "ENTERPRISE_PROCUREMENT_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const current = await tx.enterprisePurchaseRequisition.findFirst({ where: { id, organizationKey: principal.organizationKey }, include: { items: true } });
    if (!current) throw new NotFoundError("Purchase requisition");
    requireVersion(current.version, version);
    if (current.status !== "DRAFT" || current.items.length === 0) throw new AppError("Only complete draft requisitions may be submitted", 409, "INVALID_TRANSITION");
    const entity = await tx.enterprisePurchaseRequisition.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), version: { increment: 1 }, updatedById: principal.id } });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_procurement", action: "PURCHASE_APPROVAL_REQUIRED",
      entityType: "EnterprisePurchaseRequisition", entityId: id,
      description: `Purchase requisition ${current.requisitionNumber} submitted for centralized approval`,
      previous: { status: current.status }, next: { status: entity.status },
    });
    return { entity, correlationId };
  });
}

export async function listPurchaseRequisitions(input: { q?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, "ENTERPRISE_PROCUREMENT_ENABLED");
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.status ? { status: input.status } : {}),
    ...(input.q ? { OR: [
      { requisitionNumber: { contains: input.q, mode: "insensitive" as const } },
      { purpose: { contains: input.q, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterprisePurchaseRequisition.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterprisePurchaseRequisition.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Milestone 7 — Manufacturing (Including Procurement). Purchase Order and
 * Goods Receipt had schema (EnterprisePurchaseOrder/Item,
 * EnterpriseGoodsReceipt/Item) but no Business Service — the requisition
 * workflow above was the only procurement step actually wired. requisitionId
 * is optional by design: the approved high-level workflow
 * (Low Raw Material -> Procurement -> Purchase Order -> Supplier -> Goods
 * Receipt) doesn't require a formal requisition/RFQ/comparison chain first,
 * so a PO can be raised directly against a vendor — kept simple per "no
 * unnecessary ERP complexity" rather than forcing every PO through an
 * approval chain this milestone didn't ask for.
 */
const purchaseOrderInput = z.object({
  vendorId: z.string().cuid(),
  requisitionId: z.string().cuid().optional(),
  warehouseId: z.string().cuid(),
  orderDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  currency: z.string().min(1).max(10).default("INR"),
  paymentTerms: z.string().max(200).optional(),
  deliveryTerms: z.string().max(200).optional(),
  items: z.array(z.object({
    variantId: z.string().cuid(), quantity: z.coerce.number().positive(),
    unitOfMeasure: z.string().min(1).max(30), unitPrice: z.coerce.number().nonnegative(),
    tax: z.coerce.number().nonnegative().default(0),
  })).min(1),
});

export async function createPurchaseOrder(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PO_CREATE, "ENTERPRISE_PROCUREMENT_ENABLED");
  const data = purchaseOrderInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const vendor = await tx.enterpriseVendor.findFirst({ where: { id: data.vendorId, organizationKey: principal.organizationKey } });
    if (!vendor) throw new AppError("Vendor is invalid");
    if (!(await tx.warehouse.findUnique({ where: { id: data.warehouseId } }))) throw new AppError("Warehouse is invalid");
    const variantCount = await tx.productVariant.count({ where: { id: { in: data.items.map((item) => item.variantId) } } });
    if (variantCount !== new Set(data.items.map((item) => item.variantId)).size) throw new AppError("A material reference is invalid");

    // Totals are always server-computed from line items — never trusted from the client.
    let subtotal = 0, taxTotal = 0;
    for (const item of data.items) { subtotal += item.quantity * item.unitPrice; taxTotal += item.tax; }
    const grandTotal = subtotal + taxTotal;

    const purchaseOrderNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "PURCHASE_ORDER", "PO");
    const order = await tx.enterprisePurchaseOrder.create({
      data: {
        organizationKey: principal.organizationKey, purchaseOrderNumber, vendorId: data.vendorId, requisitionId: data.requisitionId,
        orderDate: data.orderDate ?? new Date(), expectedDeliveryDate: data.expectedDeliveryDate, currency: data.currency,
        paymentTerms: data.paymentTerms, deliveryTerms: data.deliveryTerms, warehouseId: data.warehouseId,
        subtotal, taxTotal, grandTotal, createdById: principal.id,
        items: { create: data.items.map((item) => ({
          organizationKey: principal.organizationKey, variantId: item.variantId, quantity: item.quantity,
          unitOfMeasure: item.unitOfMeasure, unitPrice: item.unitPrice, tax: item.tax,
        })) },
      },
      include: { items: true },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_procurement", action: "PURCHASE_ORDER_CREATED", entityType: "EnterprisePurchaseOrder",
      entityId: order.id, description: `Purchase order ${purchaseOrderNumber} created for ${vendor.displayName}`,
      next: { purchaseOrderNumber, vendorId: vendor.id, grandTotal, status: order.status },
    });
    return { entity: order, correlationId };
  });
}

export async function issuePurchaseOrder(id: string, version: number) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PO_ISSUE, "ENTERPRISE_PROCUREMENT_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const current = await tx.enterprisePurchaseOrder.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Purchase order");
    requireVersion(current.version, version);
    if (current.status !== "DRAFT") throw new AppError("Only a draft purchase order can be issued", 409, "INVALID_TRANSITION");
    const entity = await tx.enterprisePurchaseOrder.update({ where: { id }, data: { status: "ISSUED", issuedAt: new Date(), version: { increment: 1 }, updatedById: principal.id } });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_procurement", action: "PURCHASE_ORDER_ISSUED", entityType: "EnterprisePurchaseOrder",
      entityId: id, description: `Purchase order ${current.purchaseOrderNumber} issued to vendor`,
      previous: { status: current.status }, next: { status: entity.status },
    });
    return { entity, correlationId };
  });
}

export async function listPurchaseOrders(input: { q?: string; status?: string; page?: number; pageSize?: number }) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, "ENTERPRISE_PROCUREMENT_ENABLED");
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.status ? { status: input.status } : {}),
    ...(input.q ? { purchaseOrderNumber: { contains: input.q, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterprisePurchaseOrder.findMany({ where, include: { items: true, vendor: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterprisePurchaseOrder.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Milestone 7 — Manufacturing (Including Procurement). Closes the "Goods
 * Receipt updates Raw Material Inventory" business rule for real: only the
 * accepted-quantity portion of each line increases Inventory.quantity —
 * rejected/damaged quantities never become usable stock. This deliberately
 * treats accepted quantity as immediately available (matching the approved
 * workflow diagram's direct "Goods Receipt -> Raw Material Inventory" arrow,
 * with no separate incoming-QC gate) rather than routing every receipt
 * through a formal inspection-then-release two-step, which the approved
 * workflow didn't ask for. EnterpriseInspection/goodsReceiptId already
 * exists in schema if a future milestone needs to add that gate.
 */
const goodsReceiptInput = z.object({
  purchaseOrderId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  receiptDate: z.coerce.date().optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().cuid(), receivedQuantity: z.coerce.number().positive(),
    acceptedQuantity: z.coerce.number().nonnegative(), rejectedQuantity: z.coerce.number().nonnegative().default(0),
    damagedQuantity: z.coerce.number().nonnegative().default(0),
    vendorLotNumber: z.string().max(100).optional(), manufacturingDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional(),
  })).min(1),
});

export async function receiveGoods(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_RECEIPT_CREATE, "ENTERPRISE_PROCUREMENT_ENABLED");
  const data = goodsReceiptInput.parse(input);
  const result = await enterpriseTransaction(async (tx) => {
    const order = await tx.enterprisePurchaseOrder.findFirst({
      where: { id: data.purchaseOrderId, organizationKey: principal.organizationKey, status: "ISSUED" },
      include: { items: true },
    });
    if (!order) throw new AppError("Purchase order is not eligible to receive goods (must be issued)");
    const orderItemIds = new Set(order.items.map((item) => item.id));
    for (const item of data.items) {
      if (!orderItemIds.has(item.purchaseOrderItemId)) throw new AppError("A receipt line does not belong to this purchase order");
      if (item.acceptedQuantity + item.rejectedQuantity + item.damagedQuantity > item.receivedQuantity) {
        throw new AppError("Accepted + rejected + damaged quantity cannot exceed received quantity");
      }
    }

    const goodsReceiptNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "GOODS_RECEIPT", "GRN");
    const receipt = await tx.enterpriseGoodsReceipt.create({
      data: {
        organizationKey: principal.organizationKey, goodsReceiptNumber, purchaseOrderId: order.id, vendorId: order.vendorId,
        warehouseId: data.warehouseId, receiptDate: data.receiptDate ?? new Date(), receivedById: principal.id,
        items: { create: data.items.map((item) => ({ organizationKey: principal.organizationKey, ...item })) },
      },
      include: { items: true },
    });

    for (const item of data.items) {
      const orderItem = order.items.find((oi) => oi.id === item.purchaseOrderItemId)!;
      await tx.enterprisePurchaseOrderItem.update({ where: { id: orderItem.id }, data: { receivedQuantity: { increment: item.receivedQuantity }, returnedQuantity: { increment: item.rejectedQuantity } } });
      if (item.acceptedQuantity <= 0) continue;
      const quantity = Math.round(item.acceptedQuantity);
      const movementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "WAREHOUSE_MOVEMENT", "WM");
      await tx.enterpriseWarehouseMovement.create({
        data: {
          organizationKey: principal.organizationKey, movementNumber, movementType: "PURCHASE_RECEIPT",
          destinationWarehouseId: data.warehouseId, variantId: orderItem.variantId, quantity, unitOfMeasure: orderItem.unitOfMeasure,
          businessReferenceType: "EnterpriseGoodsReceipt", businessReferenceId: receipt.id, businessReferenceNumber: goodsReceiptNumber,
          actorId: principal.id, correlationId: crypto.randomUUID(),
        },
      });
      await tx.stockLedgerEntry.create({
        data: {
          movementNumber, movementType: "PURCHASE_RECEIPT", warehouseId: data.warehouseId, variantId: orderItem.variantId,
          quantity, referenceEntity: "EnterpriseGoodsReceipt", referenceId: receipt.id, referenceNumber: goodsReceiptNumber, userId: principal.id,
        },
      });
      const inventory = await tx.inventory.upsert({
        where: { variantId: orderItem.variantId }, update: { quantity: { increment: quantity } }, create: { variantId: orderItem.variantId, quantity },
      });
      await tx.stockHistory.create({
        data: { inventoryId: inventory.id, change: quantity, reason: "RAW_MATERIAL_RECEIPT", changedById: principal.id, note: `Goods receipt ${goodsReceiptNumber} accepted quantity` },
      });
    }

    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_procurement", action: "GOODS_RECEIPT_CREATED", entityType: "EnterpriseGoodsReceipt",
      entityId: receipt.id, description: `Goods receipt ${goodsReceiptNumber} recorded against ${order.purchaseOrderNumber}`,
      next: { goodsReceiptNumber, purchaseOrderId: order.id, itemCount: receipt.items.length },
    });
    const billableLines = data.items
      .filter((item) => item.acceptedQuantity > 0)
      .map((item) => {
        const orderItem = order.items.find((oi) => oi.id === item.purchaseOrderItemId)!;
        return { variantId: orderItem.variantId, quantity: item.acceptedQuantity, unitPrice: orderItem.unitPrice };
      });
    const acceptedValue = billableLines.reduce((sum, line) => sum.plus(line.unitPrice.times(line.quantity)), new Prisma.Decimal(0));
    return { entity: receipt, correlationId, acceptedValue, vendorId: order.vendorId, billableLines };
  });

  // Block 3, Part D (Founder-approved integration #2) — Goods Receipt ->
  // Vendor Bill, automatic. Fired after the business transaction commits,
  // never inside it, exactly like the pre-existing recordFinanceEvent call
  // this replaces — a Finance posting failure must never fail (or roll
  // back) the Goods Receipt itself.
  //
  // Tries to create and post a REAL FinanceVendorBill (a proper AP
  // subledger entry, not just a generic journal line) automatically. Falls
  // back to the original generic GRNI journal (recordFinanceEvent) if AP
  // posting isn't possible in this environment (e.g. FinanceConfiguration
  // isn't active, or its AP control account isn't set) — never both, so no
  // liability is ever posted twice for the same receipt, and an
  // environment that never had Finance/AP configured keeps behaving
  // exactly as it did before this change (zero regression).
  //
  // supplierInvoiceNo is a system-generated placeholder (the real
  // supplier invoice document is not yet known at goods-receipt time,
  // which is exactly why this was a manual step before) — deterministic
  // and unique per receipt (GRN numbers are already unique), so Finance
  // can locate and reconcile it once the real supplier invoice arrives.
  if (result.acceptedValue.greaterThan(0)) {
    const postedAutomatically = await createVendorBillFromGoodsReceipt(result).catch(() => false);
    if (!postedAutomatically) {
      await recordFinanceEvent({
        actingUserId: principal.id, sourceModule: "enterprise_procurement", sourceEventAction: "GOODS_RECEIPT_CREATED",
        sourceRecordId: result.entity.id, amount: result.acceptedValue, description: `Goods receipt ${result.entity.goodsReceiptNumber}: raw material received`,
      }).catch(() => { /* recordFinanceEvent itself never throws; this stays defensive regardless */ });
    }
  }
  return { entity: result.entity, correlationId: result.correlationId };
}

async function createVendorBillFromGoodsReceipt(receipt: {
  entity: { id: string; goodsReceiptNumber: string; receiptDate: Date };
  vendorId: string;
  billableLines: { variantId: string; quantity: number; unitPrice: Prisma.Decimal }[];
}): Promise<boolean> {
  const rawMaterialAccount = await prisma.financeAccount.findFirst({ where: { organizationKey: "MUV", accountCode: "1200" } });
  if (!rawMaterialAccount) return false;

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: receipt.billableLines.map((l) => l.variantId) } },
    select: { id: true, sku: true },
  });
  const skuByVariant = Object.fromEntries(variants.map((v) => [v.id, v.sku]));

  const vendorAccount = await getOrCreateVendorAccount({ vendorId: receipt.vendorId, paymentTermsDays: 30 });
  const billDate = receipt.entity.receiptDate;
  const dueDate = new Date(billDate.getTime() + vendorAccount.paymentTermsDays * 24 * 60 * 60 * 1000);

  await createAndPostVendorBill(
    {
      vendorId: receipt.vendorId,
      supplierInvoiceNo: `SYSTEM-${receipt.entity.goodsReceiptNumber}`,
      sourcePurchaseOrderId: undefined,
      billDate, dueDate, currency: "INR", taxAmount: 0,
      lines: receipt.billableLines.map((line) => ({
        description: `Goods receipt ${receipt.entity.goodsReceiptNumber}: ${skuByVariant[line.variantId] ?? line.variantId}`,
        quantity: line.quantity, unitPrice: line.unitPrice, accountId: rawMaterialAccount.id,
      })),
    },
    `goods-receipt-${receipt.entity.id}`,
  );
  return true;
}

export async function listGoodsReceipts(input: { q?: string; page?: number; pageSize?: number }) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PROCUREMENT_VIEW, "ENTERPRISE_PROCUREMENT_ENABLED");
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.q ? { goodsReceiptNumber: { contains: input.q, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enterpriseGoodsReceipt.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.enterpriseGoodsReceipt.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

