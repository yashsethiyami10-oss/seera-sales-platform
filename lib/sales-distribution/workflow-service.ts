import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import {
  assertAssistedAction,
  assertPromisePreservesContract,
  evaluateDistributorCredit,
  inventoryPosition,
  reconciliationVariance,
} from "./business-rules";
import { requirePartyMembership } from "./scope";

type OrderLineInput = { skuId: string; quantity: number };
type ActorContext = {
  actorId: string;
  sourcePortal: string;
  commercialPartyType: string;
  commercialPartyId: string;
  onBehalfOfPartyId?: string;
  financialAcceptance?: boolean;
  assistedReason?: string;
};

export async function createSku(
  prisma: PrismaClient,
  actorId: string,
  input: {
    code: string;
    productName: string;
    category: string;
    packSize: number;
    unitType: string;
    unitsPerCase: number;
    mrp: number;
    hsn?: string;
    taxRate?: number;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  if (input.unitsPerCase < 1 || input.packSize <= 0 || input.mrp <= 0)
    throw new FoundationError(
      "INVALID_SKU",
      "Invalid SKU commercial values",
      400,
    );
  return prisma.$transaction(async (tx) => {
    const sku = await tx.seeraSku.create({
      data: {
        ...input,
        code: input.code.trim().toUpperCase(),
        brand: "Seera",
        status: "ACTIVE",
        createdById: actorId,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "sku.created",
      entityType: "SeeraSku",
      entityId: sku.id,
      afterState: { code: sku.code, mrp: sku.mrp.toString() },
    });
    return sku;
  });
}

export async function createPriceVersion(
  prisma: PrismaClient,
  actorId: string,
  input: {
    skuId: string;
    tier: "COMPANY_TO_SS" | "SS_TO_DISTRIBUTOR" | "DISTRIBUTOR_TO_RETAILER";
    amount: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
  },
) {
  await authorize(prisma, { actorId, permission: "master:manage" });
  const overlap = await prisma.seeraPriceVersion.findFirst({
    where: {
      skuId: input.skuId,
      tier: input.tier,
      status: "ACTIVE",
      effectiveFrom: { lt: input.effectiveTo ?? new Date("9999-12-31") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
    },
  });
  if (overlap)
    throw new FoundationError(
      "PRICE_VERSION_OVERLAP",
      "Active price period overlaps",
      409,
    );
  const sku = await prisma.seeraSku.findUniqueOrThrow({
    where: { id: input.skuId },
  });
  return prisma.seeraPriceVersion.create({
    data: {
      ...input,
      mrpSnapshot: sku.mrp,
      status: "ACTIVE",
      createdById: actorId,
    },
  });
}

export async function startFieldDay(
  prisma: PrismaClient,
  actorId: string,
  input: {
    employeeRole: "SALES_EXECUTIVE" | "SALES_MANAGER";
    workingType: string;
    plannedGeographyId?: string;
    latitude?: number;
    longitude?: number;
    remarks?: string;
  },
) {
  await authorize(prisma, {
    actorId,
    permission:
      input.employeeRole === "SALES_MANAGER"
        ? "manager_field:operate"
        : "field_day:manage_self",
  });
  try {
    return await prisma.seeraWorkSession.create({
      data: {
        employeeId: actorId,
        employeeRole: input.employeeRole,
        workingType: input.workingType,
        plannedGeographyId: input.plannedGeographyId,
        startLatitude: input.latitude,
        startLongitude: input.longitude,
        remarks: input.remarks,
        startedAt: new Date(),
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new FoundationError(
        "ACTIVE_WORKDAY_EXISTS",
        "Only one active workday is allowed",
        409,
      );
    throw error;
  }
}

export async function endFieldDay(
  prisma: PrismaClient,
  actorId: string,
  sessionId: string,
  input: {
    latitude?: number;
    longitude?: number;
    remarks?: string;
    outcome: string;
  },
) {
  const owned = await prisma.seeraWorkSession.findFirst({
    where: { id: sessionId, employeeId: actorId, status: "ACTIVE" },
    select: { employeeRole: true },
  });
  if (!owned)
    throw new FoundationError(
      "WORKDAY_NOT_ACTIVE",
      "Active workday not found",
      409,
    );
  await authorize(prisma, {
    actorId,
    permission:
      owned.employeeRole === "SALES_MANAGER"
        ? "manager_field:operate"
        : "field_day:manage_self",
  });
  const result = await prisma.seeraWorkSession.updateMany({
    where: { id: sessionId, employeeId: actorId, status: "ACTIVE" },
    data: {
      status: "ENDED",
      endedAt: new Date(),
      endLatitude: input.latitude,
      endLongitude: input.longitude,
      remarks: input.remarks,
      outcome: input.outcome,
    },
  });
  if (result.count !== 1)
    throw new FoundationError(
      "WORKDAY_NOT_ACTIVE",
      "Active workday not found",
      409,
    );
}

export async function placeRetailerOrder(
  prisma: PrismaClient,
  context: ActorContext,
  input: {
    retailerId: string;
    idempotencyKey: string;
    requestedDeliveryAt?: Date;
    notes?: string;
    lines: OrderLineInput[];
  },
) {
  const retailer = await prisma.seeraRetailer.findUniqueOrThrow({
    where: { id: input.retailerId },
  });
  if (!retailer.distributorId)
    throw new FoundationError(
      "RETAILER_DISTRIBUTOR_REQUIRED",
      "Retailer has no active distributor",
      409,
    );
  if (context.sourcePortal === "sales-executive") {
    await authorize(prisma, {
      actorId: context.actorId,
      permission: "retailer:order",
    });
    if (retailer.distributorId !== context.commercialPartyId)
      throw new FoundationError(
        "FORGED_ASSIGNMENT",
        "Retailer assignment mismatch",
        403,
      );
  } else if (context.sourcePortal === "retailer") {
    await authorize(prisma, {
      actorId: context.actorId,
      permission: "portal:retailer",
    });
    const assigned = await prisma.seeraAssignment.findFirst({
      where: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: context.actorId,
        targetType: "RETAILER",
        targetId: retailer.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!assigned)
      throw new FoundationError(
        "RETAILER_SCOPE_DENIED",
        "Retailer account is not assigned to this business",
        403,
      );
  } else
    throw new FoundationError(
      "INVALID_SOURCE_PORTAL",
      "Retailer order source denied",
      403,
    );
  const commercialPartyId = retailer.distributorId;
  const commercialPartyType = "DISTRIBUTOR";
  return prisma.$transaction(async (tx) => {
    const existing = await tx.seeraSalesOrder.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) return existing;
    const snapshots = await Promise.all(
      input.lines.map(async (line) => {
        const sku = await tx.seeraSku.findUniqueOrThrow({
          where: { id: line.skuId },
        });
        const price = await tx.seeraPriceVersion.findFirstOrThrow({
          where: {
            skuId: line.skuId,
            tier: "DISTRIBUTOR_TO_RETAILER",
            status: "ACTIVE",
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
          },
          orderBy: { effectiveFrom: "desc" },
        });
        return {
          sku,
          price,
          quantity: line.quantity,
          total: Number(price.amount) * line.quantity,
        };
      }),
    );
    const subtotal = snapshots.reduce((sum, item) => sum + item.total, 0);
    const order = await tx.seeraSalesOrder.create({
      data: {
        orderNumber: numberFor("RO", input.idempotencyKey),
        type: "RETAILER_ORDER",
        status: "SUBMITTED",
        retailerId: retailer.id,
        sellerPartnerId: retailer.distributorId,
        salespersonId:
          context.sourcePortal === "sales-executive"
            ? context.actorId
            : undefined,
        actorId: context.actorId,
        commercialPartyType,
        commercialPartyId,
        sourcePortal: context.sourcePortal,
        financialAcceptance: false,
        subtotal,
        discountTotal: 0,
        taxTotal: 0,
        total: subtotal,
        requestedDeliveryAt: input.requestedDeliveryAt,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        submittedAt: new Date(),
        lines: {
          create: snapshots.map(({ sku, price, quantity, total }) => ({
            skuId: sku.id,
            skuCodeSnapshot: sku.code,
            productNameSnapshot: sku.productName,
            packSnapshot: `${sku.packSize} ${sku.unitType}`,
            priceSnapshot: price.amount,
            mrpSnapshot: sku.mrp,
            taxSnapshot:
              sku.taxRate == null
                ? undefined
                : { rate: sku.taxRate.toString(), hsn: sku.hsn },
            orderedQuantity: quantity,
            lineTotal: total,
          })),
        },
      },
      include: { lines: true },
    });
    await recordAudit(tx, {
      actorId: context.actorId,
      action: "retailer_order.submitted",
      entityType: "SeeraSalesOrder",
      entityId: order.id,
      details: { sourcePortal: context.sourcePortal, commercialPartyId },
    });
    return order;
  });
}

export async function fulfilRetailerOrder(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: {
    orderId: string;
    accepted: { lineId: string; quantity: number }[];
    action: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT" | "HOLD";
    reason?: string;
  },
) {
  await authorize(prisma, { actorId, permission: "distributor_orders:fulfil" });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  return prisma.$transaction(async (tx) => {
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: distributorId,
        type: "RETAILER_ORDER",
        status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order unavailable",
        403,
      );
    for (const accepted of input.accepted) {
      const line = order.lines.find((item) => item.id === accepted.lineId);
      if (
        !line ||
        accepted.quantity < 0 ||
        accepted.quantity > Number(line.orderedQuantity)
      )
        throw new FoundationError(
          "INVALID_ACCEPTED_QUANTITY",
          "Invalid line acceptance",
          400,
        );
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { acceptedQuantity: accepted.quantity },
      });
    }
    const status =
      input.action === "REJECT"
        ? "REJECTED"
        : input.action === "HOLD"
          ? "HELD"
          : input.action === "PARTIAL_ACCEPT"
            ? "PARTIAL_ACCEPTED"
            : "ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: status,
        actorId,
        reason: input.reason ?? input.action,
      },
    });
    return tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status, acknowledgedAt: new Date() },
      include: { lines: true },
    });
  });
}

export async function createDistributorReplenishment(
  prisma: PrismaClient,
  actorId: string,
  distributorId: string,
  input: { idempotencyKey: string; notes?: string; lines: OrderLineInput[] },
) {
  await authorize(prisma, {
    actorId,
    permission: "distributor_replenishment:create",
  });
  await requirePartyMembership(prisma, actorId, distributorId, "DISTRIBUTOR");
  if (!input.lines.length || input.lines.some((line) => line.quantity <= 0))
    throw new FoundationError(
      "INVALID_ORDER_LINES",
      "At least one positive order line is required",
      400,
    );
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.seeraSalesOrder.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { lines: true },
      });
      if (existing) return existing;
      const distributor = await tx.seeraPartner.findFirst({
        where: { id: distributorId, type: "DISTRIBUTOR", lifecycle: "ACTIVE" },
      });
      if (!distributor?.assignedSuperStockistId)
        throw new FoundationError(
          "UPSTREAM_STOCKIST_REQUIRED",
          "Distributor has no active Super Stockist assignment",
          409,
        );
      const stockist = await tx.seeraPartner.findFirst({
        where: {
          id: distributor.assignedSuperStockistId,
          type: "SUPER_STOCKIST",
          lifecycle: "ACTIVE",
        },
        select: { id: true },
      });
      if (!stockist)
        throw new FoundationError(
          "UPSTREAM_STOCKIST_UNAVAILABLE",
          "Assigned Super Stockist is unavailable",
          409,
        );
      const now = new Date();
      const snapshots = await Promise.all(
        input.lines.map(async (line) => {
          const sku = await tx.seeraSku.findFirst({
            where: { id: line.skuId, status: "ACTIVE" },
          });
          if (!sku)
            throw new FoundationError(
              "SKU_UNAVAILABLE",
              "An ordered SKU is unavailable",
              409,
            );
          const price = await tx.seeraPriceVersion.findFirst({
            where: {
              skuId: sku.id,
              tier: "SS_TO_DISTRIBUTOR",
              status: "ACTIVE",
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: "desc" },
          });
          if (!price)
            throw new FoundationError(
              "PRICE_UNAVAILABLE",
              `No active distributor price for ${sku.code}`,
              409,
            );
          return {
            sku,
            price,
            quantity: line.quantity,
            total: Number(price.amount) * line.quantity,
          };
        }),
      );
      const subtotal = snapshots.reduce((sum, line) => sum + line.total, 0);
      const terms = await tx.seeraCreditTerm.findFirst({
        where: {
          distributorId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (!terms)
        throw new FoundationError(
          "CREDIT_TERMS_REQUIRED",
          "Distributor credit terms are not configured",
          409,
        );
      const outstanding = await tx.seeraSalesOrder.aggregate({
        where: {
          buyerPartnerId: distributorId,
          type: "DISTRIBUTOR_REPLENISHMENT",
          status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
        },
        _sum: { total: true },
      });
      const credit = evaluateDistributorCredit({
        creditEnabled: terms.creditEnabled,
        creditLimit: Number(terms.creditLimit),
        outstanding: Number(outstanding._sum.total ?? 0),
        orderValue: subtotal,
        warningThreshold:
          terms.warningThreshold == null
            ? null
            : Number(terms.warningThreshold),
        blockThreshold:
          terms.blockThreshold == null ? null : Number(terms.blockThreshold),
        now,
      });
      const held = ["BLOCK", "HOLD", "OVERRIDE_REQUIRED"].includes(
        credit.decision,
      );
      const originalDueDate = new Date(
        now.getTime() + terms.creditDays * 86_400_000,
      );
      const order = await tx.seeraSalesOrder.create({
        data: {
          orderNumber: numberFor("DO", input.idempotencyKey),
          type: "DISTRIBUTOR_REPLENISHMENT",
          status: held ? "HELD" : "SUBMITTED",
          buyerPartnerId: distributorId,
          sellerPartnerId: stockist.id,
          actorId,
          commercialPartyType: "DISTRIBUTOR",
          commercialPartyId: distributorId,
          sourcePortal: "distributor",
          financialAcceptance: true,
          subtotal,
          discountTotal: 0,
          taxTotal: 0,
          total: subtotal,
          contractualCreditDays: terms.creditDays,
          originalDueDate,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          submittedAt: now,
          lines: {
            create: snapshots.map(({ sku, price, quantity, total }) => ({
              skuId: sku.id,
              skuCodeSnapshot: sku.code,
              productNameSnapshot: sku.productName,
              packSnapshot: `${sku.packSize} ${sku.unitType}`,
              priceSnapshot: price.amount,
              mrpSnapshot: sku.mrp,
              taxSnapshot:
                sku.taxRate == null
                  ? undefined
                  : { rate: sku.taxRate.toString(), hsn: sku.hsn },
              orderedQuantity: quantity,
              lineTotal: total,
            })),
          },
        },
        include: { lines: true },
      });
      await recordAudit(tx, {
        actorId,
        action: "distributor_replenishment.submitted",
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        afterState: {
          orderNumber: order.orderNumber,
          creditDecision: credit.decision,
          total: subtotal,
        },
      });
      return order;
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );
}

export async function fulfilDistributorReplenishment(
  prisma: PrismaClient,
  actorId: string,
  stockistId: string,
  input: {
    orderId: string;
    accepted: { lineId: string; quantity: number }[];
    action: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT" | "HOLD";
    reason?: string;
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "super_stockist_orders:fulfil",
  });
  await requirePartyMembership(prisma, actorId, stockistId, "SUPER_STOCKIST");
  return prisma.$transaction(async (tx) => {
    const order = await tx.seeraSalesOrder.findFirst({
      where: {
        id: input.orderId,
        sellerPartnerId: stockistId,
        type: "DISTRIBUTOR_REPLENISHMENT",
        status: { in: ["SUBMITTED", "ACKNOWLEDGED", "HELD"] },
      },
      include: { lines: true },
    });
    if (!order)
      throw new FoundationError(
        "ORDER_SCOPE_OR_STATE_DENIED",
        "Order unavailable",
        403,
      );
    for (const accepted of input.accepted) {
      const line = order.lines.find(
        (candidate) => candidate.id === accepted.lineId,
      );
      if (
        !line ||
        accepted.quantity < 0 ||
        accepted.quantity > Number(line.orderedQuantity)
      )
        throw new FoundationError(
          "INVALID_ACCEPTED_QUANTITY",
          "Invalid line acceptance",
          400,
        );
      await tx.seeraOrderLine.update({
        where: { id: line.id },
        data: { acceptedQuantity: accepted.quantity },
      });
    }
    const status =
      input.action === "REJECT"
        ? "REJECTED"
        : input.action === "HOLD"
          ? "HELD"
          : input.action === "PARTIAL_ACCEPT"
            ? "PARTIAL_ACCEPTED"
            : "ACCEPTED";
    await tx.seeraStatusHistory.create({
      data: {
        entityType: "SeeraSalesOrder",
        entityId: order.id,
        fromStatus: order.status,
        toStatus: status,
        actorId,
        reason: input.reason ?? input.action,
      },
    });
    return tx.seeraSalesOrder.update({
      where: { id: order.id },
      data: { status, acknowledgedAt: new Date() },
      include: { lines: true },
    });
  });
}

export async function recordInventoryMovement(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    skuId: string;
    type:
      | "OPENING"
      | "RECEIPT"
      | "ALLOCATION"
      | "RELEASE"
      | "DISPATCH"
      | "DELIVERY"
      | "RETURN"
      | "DAMAGE"
      | "SHORTAGE"
      | "ADJUSTMENT"
      | "RECONCILIATION"
      | "OFF_SYSTEM_ISSUE"
      | "CORRECTION";
    direction: "IN" | "OUT" | "RESERVE" | "RELEASE";
    quantity: number;
    sourceType: string;
    sourceId: string;
    sourcePortal: string;
    reason: string;
    idempotencyKey: string;
    approvalId?: string;
    onBehalfOfPartyId?: string;
  },
) {
  const permission =
    input.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:adjust"
      : "super_stockist_inventory:adjust";
  await authorize(prisma, { actorId, permission });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  const previous = await prisma.seeraInventoryMovement.findMany({
    where: {
      partyType: input.partyType,
      partyId: input.partyId,
      skuId: input.skuId,
    },
    select: { direction: true, quantity: true },
    orderBy: { occurredAt: "asc" },
  });
  inventoryPosition([
    ...previous.map((item) => ({
      direction: item.direction,
      quantity: Number(item.quantity),
    })),
    { direction: input.direction, quantity: input.quantity },
  ]);
  return prisma.seeraInventoryMovement.create({ data: { ...input, actorId } });
}

export async function reconcileStock(
  prisma: PrismaClient,
  actorId: string,
  input: {
    partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
    partyId: string;
    periodEnd: Date;
    sourcePortal: string;
    reason: string;
    idempotencyKey: string;
    lines: {
      skuId: string;
      opening: number;
      receipts: number;
      issues: number;
      physicalClosing: number;
      reason: string;
    }[];
  },
) {
  const permission =
    input.partyType === "DISTRIBUTOR"
      ? "distributor_inventory:reconcile"
      : "super_stockist_inventory:reconcile";
  await authorize(prisma, { actorId, permission });
  await requirePartyMembership(prisma, actorId, input.partyId, input.partyType);
  return prisma.seeraStockReconciliation.create({
    data: {
      partyType: input.partyType,
      partyId: input.partyId,
      periodEnd: input.periodEnd,
      actorId,
      sourcePortal: input.sourcePortal,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      lines: {
        create: input.lines.map((line) => {
          const systemClosing = line.opening + line.receipts - line.issues;
          return {
            skuId: line.skuId,
            openingQuantity: line.opening,
            receiptQuantity: line.receipts,
            issueQuantity: line.issues,
            systemClosing,
            physicalClosing: line.physicalClosing,
            variance: reconciliationVariance(
              systemClosing,
              line.physicalClosing,
            ),
            reason: line.reason,
          };
        }),
      },
    },
    include: { lines: true },
  });
}

export async function recordPaymentPromise(
  prisma: PrismaClient,
  actorId: string,
  input: {
    orderId: string;
    promisedPaymentDate: Date;
    reason: string;
    verbalCommitmentContext?: string;
    sourcePortal: "sales-manager" | "super-stockist";
  },
) {
  await authorize(prisma, { actorId, permission: "payment_promise:create" });
  const order = await prisma.seeraSalesOrder.findUniqueOrThrow({
    where: { id: input.orderId },
  });
  if (!order.originalDueDate)
    throw new FoundationError(
      "ORIGINAL_DUE_DATE_REQUIRED",
      "Original due date is required",
      409,
    );
  assertPromisePreservesContract({
    originalDueDate: order.originalDueDate,
    storedOriginalDueDate: order.originalDueDate,
    promisedPaymentDate: input.promisedPaymentDate,
  });
  return prisma.seeraPaymentPromise.create({
    data: {
      orderId: order.id,
      originalDueDate: order.originalDueDate,
      promisedPaymentDate: input.promisedPaymentDate,
      reason: input.reason,
      verbalCommitmentContext: input.verbalCommitmentContext,
      actorId,
      sourcePortal: input.sourcePortal,
    },
  });
}

export async function createCompanyOrder(
  prisma: PrismaClient,
  actorId: string,
  superStockistId: string,
  input: {
    idempotencyKey: string;
    subtotal: number;
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "company_replenishment:create",
  });
  await requirePartyMembership(
    prisma,
    actorId,
    superStockistId,
    "SUPER_STOCKIST",
  );
  return prisma.seeraSalesOrder.create({
    data: {
      orderNumber: numberFor("CO", input.idempotencyKey),
      type: "COMPANY_REPLENISHMENT",
      status: "SUBMITTED",
      buyerPartnerId: superStockistId,
      actorId,
      commercialPartyType: "SUPER_STOCKIST",
      commercialPartyId: superStockistId,
      sourcePortal: "super-stockist",
      financialAcceptance: false,
      subtotal: input.subtotal,
      discountTotal: 0,
      taxTotal: 0,
      total: input.subtotal,
      contractualCreditDays: 0,
      idempotencyKey: input.idempotencyKey,
      submittedAt: new Date(),
    },
  });
}

export async function assistedDistributorOperation(
  prisma: PrismaClient,
  actorId: string,
  input: {
    distributorId: string;
    reason: string;
    idempotencyKey: string;
    subtotal: number;
  },
) {
  await authorize(prisma, {
    actorId,
    permission: "assisted_distributor:operate",
  });
  const context = {
    actorId,
    commercialPartyId: input.distributorId,
    sourcePortal: "sales-manager",
    onBehalfOfPartyId: input.distributorId,
    reason: input.reason,
    financialAcceptance: false,
  };
  assertAssistedAction(context);
  return prisma.seeraSalesOrder.create({
    data: {
      orderNumber: numberFor("AR", input.idempotencyKey),
      type: "DISTRIBUTOR_REPLENISHMENT",
      status: "DRAFT",
      buyerPartnerId: input.distributorId,
      actorId,
      commercialPartyType: "DISTRIBUTOR",
      commercialPartyId: input.distributorId,
      sourcePortal: context.sourcePortal,
      onBehalfOfPartyId: input.distributorId,
      financialAcceptance: false,
      subtotal: input.subtotal,
      discountTotal: 0,
      taxTotal: 0,
      total: input.subtotal,
      notes: input.reason,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function evaluateOrderCredit(
  prisma: PrismaClient,
  distributorId: string,
  orderValue: number,
  now = new Date(),
) {
  const terms = await prisma.seeraCreditTerm.findFirstOrThrow({
    where: {
      distributorId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  const outstanding = await prisma.seeraSalesOrder.aggregate({
    where: {
      buyerPartnerId: distributorId,
      type: "DISTRIBUTOR_REPLENISHMENT",
      status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] },
    },
    _sum: { total: true },
  });
  return evaluateDistributorCredit({
    creditEnabled: terms.creditEnabled,
    creditLimit: Number(terms.creditLimit),
    outstanding: Number(outstanding._sum.total ?? 0),
    orderValue,
    warningThreshold:
      terms.warningThreshold == null ? null : Number(terms.warningThreshold),
    blockThreshold:
      terms.blockThreshold == null ? null : Number(terms.blockThreshold),
    now,
  });
}

function numberFor(prefix: string, key: string) {
  return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 14).toUpperCase()}`;
}
