import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;
export type GrowthActor = { id: string; email: string | null };
const VERSION = "phase6-v1";
const decimal = (value: number) => new Prisma.Decimal(value.toFixed(2));
const days = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);

async function configuration(tx: Tx) {
  const row = await tx.phase6Configuration.findUnique({ where: { key: "STATUS_THRESHOLDS" } });
  return (row?.value ?? { activeDays: 90, inactiveDays: 91, dormantDays: 365, atRiskDays: 120 }) as {
    activeDays: number; inactiveDays: number; dormantDays: number; atRiskDays: number;
  };
}

export async function calculateCustomerMetrics(customerId: string, tx: Tx | typeof prisma = prisma) {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    include: {
      orders: {
        include: {
          commerceStatus: true,
          items: { include: { variant: { include: { product: { include: { category: true } } } } } },
          commercialInvoice: { include: { payments: { include: { method: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!customer) throw new NotFoundError("Customer");
  const completed = customer.orders.filter(o => o.status === "DELIVERED" || o.commerceStatus?.code === "COMPLETED");
  const cancelled = customer.orders.filter(o => o.status === "CANCELLED" || o.commerceStatus?.code === "CANCELLED");
  const grossRevenue = completed.reduce((sum, o) => sum + o.subtotal + o.shippingFee, 0);
  const netRevenue = completed.reduce((sum, o) => sum + o.total, 0);
  const invoices = customer.orders.flatMap(o => o.commercialInvoice ? [o.commercialInvoice] : []);
  const payments = invoices.flatMap(i => i.payments.filter(p => p.status === "PAID"));
  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.grandTotal), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const purchases = completed.map(o => o.createdAt);
  const gaps = purchases.slice(1).map((date, i) => days(purchases[i]!, date));
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const categoryMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of completed) for (const item of order.items) {
    const product = item.variant.product;
    const p = productMap.get(product.id) ?? { name: product.name, quantity: 0, revenue: 0 };
    p.quantity += item.quantity; p.revenue += item.priceAtPurchase * item.quantity; productMap.set(product.id, p);
    const c = categoryMap.get(product.category.id) ?? { name: product.category.name, quantity: 0, revenue: 0 };
    c.quantity += item.quantity; c.revenue += item.priceAtPurchase * item.quantity; categoryMap.set(product.category.id, c);
  }
  const preferredProducts = [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const preferredCategories = [...categoryMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const paymentMethods = payments.reduce<Record<string, number>>((result, payment) => {
    result[payment.method.code] = (result[payment.method.code] ?? 0) + Number(payment.amount); return result;
  }, {});
  const paymentDays = payments.map(payment => {
    const invoice = invoices.find(i => i.id === payment.invoiceId);
    return invoice ? days(invoice.issueDate, payment.collectedAt) : 0;
  });
  return {
    customer, completed, cancelled, invoices, payments,
    firstPurchaseDate: purchases[0] ?? null,
    lastPurchaseDate: purchases.at(-1) ?? null,
    totalOrders: customer.orders.length,
    completedOrders: completed.length,
    cancelledOrders: cancelled.length,
    grossRevenue, netRevenue, totalInvoiced, totalPaid,
    outstandingAmount: Math.max(0, totalInvoiced - totalPaid),
    averageOrderValue: completed.length ? netRevenue / completed.length : 0,
    averageInvoiceValue: invoices.length ? totalInvoiced / invoices.length : 0,
    averagePaymentTimeDays: paymentDays.length ? paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length : 0,
    purchaseFrequency: purchases.length > 1 ? purchases.length / Math.max(1, days(purchases[0]!, purchases.at(-1)!)) : 0,
    averageDaysBetweenOrders: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
    repeatPurchaseCount: Math.max(0, completed.length - 1),
    repeatPurchaseRate: completed.length ? Math.max(0, completed.length - 1) / completed.length : 0,
    collectionRate: totalInvoiced ? totalPaid / totalInvoiced : 0,
    partialPaymentCount: invoices.filter(i => i.paymentStatus === "PARTIALLY_PAID").length,
    paidInvoiceCount: invoices.filter(i => i.paymentStatus === "PAID").length,
    overdueInvoiceCount: invoices.filter(i => i.paymentStatus !== "PAID" && days(i.issueDate, new Date()) > 30).length,
    preferredProducts, preferredCategories, paymentMethods,
  };
}

function statusFor(metrics: Awaited<ReturnType<typeof calculateCustomerMetrics>>, thresholds: Awaited<ReturnType<typeof configuration>>, previous?: string) {
  if (!metrics.lastPurchaseDate) return "NEW";
  const inactivity = days(metrics.lastPurchaseDate, new Date());
  if (previous && ["INACTIVE", "DORMANT", "AT_RISK"].includes(previous) && inactivity <= thresholds.activeDays) return "REACTIVATED";
  if (inactivity >= thresholds.dormantDays) return "DORMANT";
  if (metrics.completedOrders > 1 && inactivity >= thresholds.atRiskDays) return "AT_RISK";
  if (inactivity >= thresholds.inactiveDays) return "INACTIVE";
  if (metrics.completedOrders > 1) return "REPEAT";
  return "ACTIVE";
}

export async function recalculateCustomerIntelligence(actor: GrowthActor, customerId: string) {
  return prisma.$transaction(async tx => {
    const metrics = await calculateCustomerMetrics(customerId, tx);
    const existing = await tx.customerIntelligenceProfile.findUnique({ where: { customerId } });
    const statusCode = statusFor(metrics, await configuration(tx), existing?.statusCode);
    const profile = await tx.customerIntelligenceProfile.upsert({
      where: { customerId },
      update: {
        statusCode, firstPurchaseDate: metrics.firstPurchaseDate, lastPurchaseDate: metrics.lastPurchaseDate,
        totalOrders: metrics.totalOrders, completedOrders: metrics.completedOrders, cancelledOrders: metrics.cancelledOrders,
        grossRevenue: decimal(metrics.grossRevenue), netRevenue: decimal(metrics.netRevenue), totalPaid: decimal(metrics.totalPaid),
        outstandingAmount: decimal(metrics.outstandingAmount), averageOrderValue: decimal(metrics.averageOrderValue),
        averageInvoiceValue: decimal(metrics.averageInvoiceValue), averagePaymentTimeDays: decimal(metrics.averagePaymentTimeDays),
        purchaseFrequency: decimal(metrics.purchaseFrequency), averageDaysBetweenOrders: decimal(metrics.averageDaysBetweenOrders),
        repeatPurchaseCount: metrics.repeatPurchaseCount, repeatPurchaseRate: decimal(metrics.repeatPurchaseRate),
        collectionRate: decimal(metrics.collectionRate), partialPaymentCount: metrics.partialPaymentCount,
        paidInvoiceCount: metrics.paidInvoiceCount, overdueInvoiceCount: metrics.overdueInvoiceCount,
        preferredProducts: metrics.preferredProducts, preferredCategories: metrics.preferredCategories,
        paymentMethodDistribution: metrics.paymentMethods, calculationVersion: VERSION, lastCalculatedAt: new Date(),
      },
      create: {
        customerId, statusCode, firstPurchaseDate: metrics.firstPurchaseDate, lastPurchaseDate: metrics.lastPurchaseDate,
        totalOrders: metrics.totalOrders, completedOrders: metrics.completedOrders, cancelledOrders: metrics.cancelledOrders,
        grossRevenue: decimal(metrics.grossRevenue), netRevenue: decimal(metrics.netRevenue), totalPaid: decimal(metrics.totalPaid),
        outstandingAmount: decimal(metrics.outstandingAmount), averageOrderValue: decimal(metrics.averageOrderValue),
        averageInvoiceValue: decimal(metrics.averageInvoiceValue), averagePaymentTimeDays: decimal(metrics.averagePaymentTimeDays),
        purchaseFrequency: decimal(metrics.purchaseFrequency), averageDaysBetweenOrders: decimal(metrics.averageDaysBetweenOrders),
        repeatPurchaseCount: metrics.repeatPurchaseCount, repeatPurchaseRate: decimal(metrics.repeatPurchaseRate),
        collectionRate: decimal(metrics.collectionRate), partialPaymentCount: metrics.partialPaymentCount,
        paidInvoiceCount: metrics.paidInvoiceCount, overdueInvoiceCount: metrics.overdueInvoiceCount,
        preferredProducts: metrics.preferredProducts, preferredCategories: metrics.preferredCategories,
        paymentMethodDistribution: metrics.paymentMethods, calculationVersion: VERSION, lastCalculatedAt: new Date(),
      },
    });
    await tx.customerIntelligenceSnapshot.create({ data: {
      customerId, metrics: JSON.parse(JSON.stringify(profile)), segmentState: {}, statusCode,
      calculationVersion: VERSION,
    } });
    await tx.salesTimelineEvent.create({ data: {
      actorId: actor.id, customerId, eventType: "INTELLIGENCE_RECALCULATED",
      relatedRecordType: "CustomerIntelligenceProfile", relatedRecordId: profile.id,
      description: `Customer intelligence recalculated (${statusCode})`,
    } });
    await tx.salesAuditLog.create({ data: {
      userId: actor.id, module: "customer_intelligence", action: "RECALCULATE",
      recordType: "CustomerIntelligenceProfile", recordId: profile.id,
      previousValue: existing ? JSON.parse(JSON.stringify(existing)) : undefined,
      newValue: { statusCode, calculationVersion: VERSION },
    } });
    if (existing?.statusCode !== statusCode) await tx.notificationLog.create({ data: {
      channel: "DASHBOARD", type: `CUSTOMER_${statusCode}`, recipient: actor.email ?? actor.id, status: "PENDING",
    } });
    return profile;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignSegment(actor: GrowthActor, input: { customerId: string; segmentId: string; isPrimary: boolean; reason: string; protected?: boolean }) {
  if (!input.reason.trim()) throw new AppError("A reason is required");
  return prisma.$transaction(async tx => {
    const [customer, segment] = await Promise.all([
      tx.customer.findUnique({ where: { id: input.customerId } }),
      tx.customerSegment.findUnique({ where: { id: input.segmentId } }),
    ]);
    if (!customer || !segment?.active) throw new AppError("Invalid customer or segment");
    if (input.isPrimary) await tx.customerSegmentAssignment.updateMany({
      where: { customerId: input.customerId, active: true, isPrimary: true, protected: false },
      data: { active: false, removedById: actor.id, removedAt: new Date(), reason: "Primary segment replaced" },
    });
    const assignment = await tx.customerSegmentAssignment.create({ data: {
      customerId: input.customerId, segmentId: input.segmentId, assignmentType: "MANUAL",
      isPrimary: input.isPrimary, protected: input.protected ?? true, assignedById: actor.id, reason: input.reason,
    } });
    if (input.isPrimary) await tx.customerIntelligenceProfile.updateMany({
      where: { customerId: input.customerId }, data: { primarySegmentId: input.segmentId },
    });
    await tx.salesTimelineEvent.create({ data: {
      actorId: actor.id, customerId: input.customerId, eventType: "SEGMENT_ASSIGNED",
      relatedRecordType: "CustomerSegmentAssignment", relatedRecordId: assignment.id,
      description: `${segment.name} assigned: ${input.reason}`,
    } });
    await tx.salesAuditLog.create({ data: {
      userId: actor.id, module: "customer_intelligence", action: "SEGMENT_ASSIGNED",
      recordType: "CustomerSegmentAssignment", recordId: assignment.id, newValue: { ...input },
    } });
    return assignment;
  });
}
