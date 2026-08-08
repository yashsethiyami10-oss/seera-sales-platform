"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError, ForbiddenError, ConflictError, AppError } from "@/lib/errors";
import { requirePermission, requireAnyPermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { assignedScopeWhere } from "@/lib/inst-sales/scope";
import { createBusinessOrderCore } from "@/lib/business-orders/core";
import { priceLines } from "@/lib/inst-sales/pricing";
import { recordFinanceEvent } from "@/lib/enterprise-finance/event-posting-service";
import { assertCustomerCreditOkForSale } from "@/lib/enterprise-finance/credit-control-service";
import {
  createBusinessOrderFromQuotationSchema, updateBusinessOrderStatusSchema,
  recordBusinessOrderDispatchSchema, listBusinessOrdersQuerySchema, createDirectBusinessOrderSchema,
  dispatchBusinessOrderSchema, deliverBusinessOrderSchema, amendBusinessOrderDispatchDeliverySchema,
} from "@/lib/validations/business-orders";

/**
 * Milestone 4 — Order Management OS. Follows the same file shape every
 * other Inst* domain uses (actions/inst-quotations.ts, actions/
 * inst-opportunities.ts) — logic and Server Actions live together in one
 * file, not split into a separate service layer, matching this codebase's
 * established convention rather than the general commerce track's
 * lib/commerce/services.ts + actions/commerce.ts split (no reason to
 * introduce a second pattern for a single-channel-origin milestone).
 */

// CONFIRMED -> PROCESSING -> DISPATCHED -> DELIVERED, or CONFIRMED/PROCESSING
// -> CANCELLED. DELIVERED and CANCELLED are terminal. Hardcoded, not a
// DB-driven transition table — matches lib/validations/order.ts's existing
// ALLOWED_TRANSITIONS pattern for the frozen D2C Order, at the same "tracking
// only" rigor level as Milestone 3's own ad hoc per-action quotation guards.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

type SerializableOrder = {
  subtotal: unknown; discountTotal: unknown; taxTotal: unknown; grandTotal: unknown;
  items?: { unitPrice: unknown; discountPercent: unknown; taxRate: unknown; lineTotal: unknown }[];
};

/** Decimal->number conversion for the Server->Client boundary, matching actions/inst-quotations.ts's serializeVersion. */
function serializeOrder<T extends SerializableOrder>(o: T): Omit<T, keyof SerializableOrder> & {
  subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number;
  items: T["items"] extends (infer Item)[] ? (Omit<Item, "unitPrice" | "discountPercent" | "taxRate" | "lineTotal"> & { unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number })[] : never;
} {
  return {
    ...o,
    subtotal: Number(o.subtotal), discountTotal: Number(o.discountTotal), taxTotal: Number(o.taxTotal), grandTotal: Number(o.grandTotal),
    items: o.items?.map((li) => ({ ...li, unitPrice: Number(li.unitPrice), discountPercent: Number(li.discountPercent), taxRate: Number(li.taxRate), lineTotal: Number(li.lineTotal) })),
  } as never;
}

/**
 * Business orders are created only from an accepted institutional
 * quotation — no manual creation path. Every field is derived server-side
 * from the quotation; nothing about totals, ownership, or line items is
 * accepted from client input.
 *
 * Milestone 4.1: this remains the entry point for quotations that were
 * already ACCEPTED before the v4.1 acceptance-workflow change shipped (a
 * quotation stuck ACCEPTED-with-no-order can now only be a pre-v4.1 legacy
 * row — the new acceptQuotation flow in actions/inst-quotations.ts makes
 * that state structurally impossible for anything accepted going forward,
 * since acceptance and order creation now happen in one atomic
 * transaction there). This function's own behavior is otherwise unchanged;
 * it now calls the shared createBusinessOrderCore() (lib/business-orders/core.ts)
 * so both call sites run the exact same order-creation logic.
 */
export async function createBusinessOrderFromQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_CREATE_FROM_QUOTATION);
    const data = createBusinessOrderFromQuotationSchema.parse(input);

    const version = await prisma.instQuotationVersion.findUnique({
      where: { id: data.quotationVersionId },
      include: {
        quotation: { include: { opportunity: true, customer: true } },
        lineItems: true,
        businessOrder: true,
      },
    });
    if (!version) throw new NotFoundError("Quotation version");
    if (version.status !== "ACCEPTED") throw new ForbiddenError("Only an accepted quotation can be converted into an order");
    if (version.businessOrder) throw new ConflictError("An order already exists for this quotation");

    const { quotation } = version;
    const { customer, opportunity } = quotation;
    if (!customer.active) throw new ForbiddenError("Cannot create an order for an inactive customer");

    const order = await prisma.$transaction(async (tx) => {
      const created = await createBusinessOrderCore(tx, {
        source: "QUOTATION",
        quotationVersionId: version.id,
        customer, opportunity, fallbackOwnerId: quotation.ownerId,
        subtotal: version.subtotal, discountTotal: version.discountTotal, taxTotal: version.taxTotal, grandTotal: version.grandTotal,
        lineItems: version.lineItems,
      });
      await appendAuditLog({
        userId: principal.id, module: "business_orders", action: "ORDER_CREATED_FROM_QUOTATION",
        recordType: "BusinessOrder", recordId: created.id,
        newValue: { orderNumber: created.orderNumber, quotationVersionId: version.id, grandTotal: Number(created.grandTotal) },
      }, tx);
      return created;
    });

    revalidatePath("/os/orders");
    revalidatePath(`/os/sales/quotations/${quotation.id}`);
    return { success: true as const, data: { id: order.id, orderNumber: order.orderNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 4.2 — Direct Business Order Workflow. For institutional
 * customers who don't need a formal quotation (local restaurants, salons,
 * gyms, etc.) — creates a Business Order straight from an Opportunity
 * (itself created/reused via the unmodified convertLeadToOpportunity),
 * with no InstQuotation/InstQuotationVersion involved at all.
 *
 * Opportunity creation is a genuinely separate, earlier user action/
 * transaction (approved design: the officer may start this workflow and
 * leave the order form incomplete) — but everything from this function's
 * own entry point onward is one atomic transaction, per the mandatory
 * correction: permission/scope revalidation → eligibility checks → line
 * pricing → order+items creation → opportunity WON → customer lifecycle →
 * audit, commit or fully roll back together. On failure, the Opportunity
 * itself is untouched (it was already committed by the earlier, separate
 * conversion step) — it simply stays open for the officer to retry.
 */
export async function createDirectBusinessOrder(input: unknown) {
  try {
    // 1. Permission.
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_CREATE_FROM_QUOTATION);
    const data = createDirectBusinessOrderSchema.parse(input);

    // Pricing reads live product/GST data — same pattern createQuotation
    // already uses (computed before the transaction, using the general
    // prisma client for the read; the transaction only needs the result).
    const { priced, totals } = await priceLines(data.lineItems);

    // Milestone 8 — Finance & Accounts. Credit control enforcement, run
    // before the transaction opens (a credit check is inherently a
    // moment-in-time read, not something requiring the same serializable
    // consistency as the order-creation writes below) — throws (never a
    // silent pass) if this order would push the customer over their
    // available credit or they are on an unoverridden credit hold.
    const opportunityForCreditCheck = await prisma.instOpportunity.findUnique({ where: { id: data.opportunityId }, select: { customerId: true } });
    if (opportunityForCreditCheck) {
      await assertCustomerCreditOkForSale(opportunityForCreditCheck.customerId, principal.id, totals.grandTotal);
    }

    const order = await prisma.$transaction(async (tx) => {
      // 3. Revalidate Opportunity and Customer eligibility (fresh read
      // inside the transaction).
      const opportunity = await tx.instOpportunity.findUnique({
        where: { id: data.opportunityId },
        include: { customer: true },
      });
      if (!opportunity) throw new NotFoundError("Opportunity");
      if (!opportunity.customer.active) throw new ForbiddenError("Cannot create an order for an inactive customer");

      // 2. Assigned scope / territory access — matches the same
      // unrestricted-if-founder-or-view_all-or-manage, else-must-be-owner
      // pattern assertCanViewOrder already established for reading a
      // Business Order's detail; applied here to the *creation* attempt
      // itself, since INST_QUOTATIONS/BUSINESS_ORDERS has no separate
      // view_all/view_assigned split for creation specifically to check
      // against — ownership of the underlying Opportunity is this
      // codebase's one real scoping signal for this workflow.
      const unrestricted = principal.isFounder || principal.permissions.has(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL) || principal.permissions.has(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
      if (!unrestricted && opportunity.ownerId !== principal.id) throw new ForbiddenError("You don't have access to this opportunity");

      // Milestone 8 — Finance & Accounts. Credit control enforcement (run
      // before this transaction opens — see the top-level call above this
      // block): a sales transaction must not silently bypass the
      // applicable credit-control rule.

      // 5. Prevent duplicate submission — app-level pre-check for a clean
      // error message; the real, concurrency-safe guard is the partial
      // unique index on (opportunityId) WHERE source='DIRECT_LEAD'
      // (migration 20260801140000) hit by createBusinessOrderCore below.
      const existingOrder = await tx.businessOrder.findFirst({ where: { opportunityId: opportunity.id, source: "DIRECT_LEAD" } });
      if (existingOrder) throw new ConflictError("A direct business order already exists for this opportunity");

      // 6-7. Create the Business Order + items — same shared core every
      // other creation path uses, source=DIRECT_LEAD, no quotationVersionId.
      const businessOrder = await createBusinessOrderCore(tx, {
        source: "DIRECT_LEAD",
        quotationVersionId: null,
        customer: opportunity.customer, opportunity, fallbackOwnerId: opportunity.ownerId,
        subtotal: totals.subtotal, discountTotal: totals.discountTotal, taxTotal: totals.taxTotal, grandTotal: totals.grandTotal,
        lineItems: priced,
      });

      // 8. Opportunity -> WON.
      await tx.instOpportunity.update({ where: { id: opportunity.id }, data: { stage: "WON", wonAt: new Date() } });
      // 9. Customer lifecycle.
      await tx.customer.update({ where: { id: opportunity.customer.id }, data: { lifecycleStage: "CUSTOMER" } });

      // 10. Order-creation audit (also covers "any required opportunity/
      // status audit" via its newValue payload — matching acceptQuotation's
      // own precedent of one rich audit row per creation rather than a
      // separate row purely for the opportunity stage change).
      await appendAuditLog({
        userId: principal.id, module: "business_orders", action: "ORDER_CREATED_FROM_LEAD",
        recordType: "BusinessOrder", recordId: businessOrder.id,
        newValue: {
          orderNumber: businessOrder.orderNumber, opportunityId: opportunity.id, leadId: opportunity.leadId,
          grandTotal: Number(businessOrder.grandTotal), workflowUsed: "DIRECT_BUSINESS_ORDER",
        },
      }, tx);

      return businessOrder;
      // 12. Commit.
    });

    revalidatePath("/os/orders");
    revalidatePath("/os/sales/opportunities");
    revalidatePath("/os/sales/leads");
    return { success: true as const, data: { id: order.id, orderNumber: order.orderNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateBusinessOrderStatus(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const data = updateBusinessOrderStatusSchema.parse(input);

    const order = await prisma.businessOrder.findUnique({ where: { id: data.id } });
    if (!order) throw new NotFoundError("Business order");

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new ForbiddenError(`Cannot transition a ${order.status.toLowerCase()} order to ${data.status.toLowerCase()}`);
    }
    if (data.status === "CANCELLED" && !data.reason) {
      throw new AppError("Cancelling an order requires a reason (at least 3 characters)", 400, "VALIDATION_ERROR");
    }

    const updateData: Prisma.BusinessOrderUpdateInput = { status: data.status };
    if (data.status === "DISPATCHED") updateData.dispatchedAt = new Date();
    if (data.status === "DELIVERED") updateData.deliveredAt = new Date();
    if (data.status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelReason = data.reason;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.businessOrder.update({ where: { id: data.id }, data: updateData });

      // Milestone 5 — Operations Foundation. Cancelling an order that had
      // stock reserved (via reserveInventoryAndAssignWarehouse) must
      // release that reservation back to available stock — otherwise a
      // cancelled order would leak reserved-but-never-consumed stock
      // permanently. Only meaningful once Milestone 5's reservation step
      // exists; a no-op for any order that was never reserved.
      if (data.status === "CANCELLED") {
        const released = await tx.inventoryReservation.updateMany({
          where: { businessOrderId: data.id, status: "ACTIVE" },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        if (released.count > 0) {
          await appendAuditLog({
            userId: principal.id, module: "business_ops", action: "INVENTORY_RELEASED",
            recordType: "BusinessOrder", recordId: order.id, newValue: { releasedReservationCount: released.count },
          }, tx);
        }
      }

      await appendAuditLog({
        userId: principal.id, module: "business_orders", action: "ORDER_STATUS_CHANGED",
        recordType: "BusinessOrder", recordId: order.id,
        previousValue: { status: order.status }, newValue: { status: data.status, reason: data.reason ?? null },
      }, tx);

      return result;
    });

    revalidatePath("/os/orders");
    revalidatePath(`/os/orders/business/${data.id}`);
    revalidatePath("/os/operations");
    return { success: true as const, data: serializeOrder(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 6 — Dispatch & Delivery. "Founder" already bypasses every
 * permission check (requirePermission/requireAnyPermission), so the only
 * new case this needs to detect is the base platform's ADMIN role (the same
 * Role enum lib/rbac.ts's requireAdmin() checks for the D2C/admin side of
 * the app) for a principal who isn't Founder in the Sales OS role sense.
 */
function isFounderOrAdmin(principal: { isFounder: boolean; role: string }) {
  return principal.isFounder || principal.role === "ADMIN";
}

/**
 * Dispatch panel (Milestone 4, Step 15) — deliberately separate from status
 * transitions, so staff can record carrier/tracking info before or
 * independently of formally moving the order to DISPATCHED. Plain tracking
 * fields only — no courier API, no AWB generation, no label.
 *
 * Milestone 6: superseded for the normal flow by dispatchBusinessOrder
 * below (which records this same info atomically with the status
 * transition), but left callable/unchanged for backward compatibility —
 * with one addition required for integration: a DELIVERED order must be
 * read-only except for Founder/Admin, and this action had no status guard
 * at all before, which would otherwise let it silently rewrite dispatch
 * info on an already-delivered order.
 */
export async function recordBusinessOrderDispatch(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const data = recordBusinessOrderDispatchSchema.parse(input);

    const order = await prisma.businessOrder.findUnique({ where: { id: data.id } });
    if (!order) throw new NotFoundError("Business order");
    if (order.status === "DELIVERED" && !isFounderOrAdmin(principal)) {
      throw new ForbiddenError("A delivered order is read-only — only Founder/Admin can amend it");
    }

    const updated = await prisma.businessOrder.update({
      where: { id: data.id },
      data: {
        carrierName: data.carrierName || null,
        trackingReference: data.trackingReference || null,
        ...(data.dispatchDate ? { dispatchedAt: data.dispatchDate } : {}),
        ...(data.expectedDeliveryDate ? { expectedDeliveryDate: data.expectedDeliveryDate } : {}),
      },
    });

    await appendAuditLog({
      userId: principal.id, module: "business_orders", action: "ORDER_DISPATCH_INFO_UPDATED",
      recordType: "BusinessOrder", recordId: order.id,
      newValue: { carrierName: updated.carrierName, trackingReference: updated.trackingReference },
    });
    revalidatePath(`/os/orders/business/${data.id}`);
    return { success: true as const, data: serializeOrder(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 6 — Dispatch & Delivery. The normal dispatch path: records
 * dispatch method/courier/tracking/notes and moves PROCESSING -> DISPATCHED
 * in one atomic transaction (status re-checked fresh inside the
 * transaction, matching reserveInventoryAndAssignWarehouse's own
 * concurrency-safe pattern from Milestone 5 — two simultaneous dispatch
 * attempts on the same order can't both succeed). No delete path exists for
 * dispatch info by design — a mistake is corrected via
 * amendBusinessOrderDispatchDelivery (Founder/Admin only), never overwritten
 * silently.
 *
 * Finance Hook: ORDER_DISPATCHED is a stable, documented audit action name
 * with a fixed payload shape — a future Finance & Accounts module can query
 * SalesAuditLog on module="business_ops" + this action name as its
 * dispatch-triggered integration point, without this milestone needing to
 * know anything about Finance itself.
 */
export async function dispatchBusinessOrder(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const data = dispatchBusinessOrderSchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.businessOrder.findUnique({ where: { id: data.id } });
      if (!order) throw new NotFoundError("Business order");
      if (order.status !== "PROCESSING") {
        throw new ForbiddenError(`Only a processing order can be dispatched (this order is ${order.status.toLowerCase()})`);
      }

      const result = await tx.businessOrder.update({
        where: { id: data.id },
        data: {
          status: "DISPATCHED",
          dispatchedAt: data.dispatchedAt ?? new Date(),
          dispatchMethod: data.dispatchMethod,
          dispatchedById: principal.id,
          carrierName: data.carrierName || null,
          trackingReference: data.trackingReference || null,
          dispatchNotes: data.dispatchNotes || null,
        },
      });

      // Block 3, Part D (Founder-approved integration #3) — BusinessOrder ->
      // Shipment, proper integration. Creates the same Shipment/ShipmentEvent
      // records the D2C Order track already gets on fulfillment (see
      // actions/shipping.ts's fulfillOrder), rather than leaving dispatch
      // as plain string fields with no structured event history. provider
      // stays null — dispatchMethod SELF_DELIVERY/TRANSPORT has no real
      // courier-API provider; carrierName/awbNumber (pre-existing free-text
      // columns) carry that case, exactly like the plain fields did before.
      // upsert (not create) so re-dispatch after amendBusinessOrderDispatch
      // Delivery-driven correction never violates the businessOrderId unique
      // constraint.
      const shipment = await tx.shipment.upsert({
        where: { businessOrderId: order.id },
        create: {
          businessOrderId: order.id, awbNumber: result.trackingReference, courierName: result.carrierName,
          status: "IN_TRANSIT",
        },
        update: { awbNumber: result.trackingReference, courierName: result.carrierName, status: "IN_TRANSIT" },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id, status: "IN_TRANSIT",
          description: `Dispatched via ${result.dispatchMethod ?? "unspecified method"}${result.carrierName ? ` (${result.carrierName})` : ""}`,
          occurredAt: result.dispatchedAt ?? new Date(),
        },
      });

      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "ORDER_DISPATCHED",
        recordType: "BusinessOrder", recordId: order.id,
        previousValue: { status: order.status },
        newValue: {
          orderNumber: result.orderNumber, customerId: result.customerId, grandTotal: Number(result.grandTotal),
          status: "DISPATCHED", dispatchMethod: result.dispatchMethod, carrierName: result.carrierName,
          trackingReference: result.trackingReference, dispatchedAt: result.dispatchedAt, dispatchedById: principal.id,
        },
      }, tx);

      return result;
    });

    revalidatePath("/os/orders");
    revalidatePath(`/os/orders/business/${data.id}`);
    revalidatePath("/os/operations");
    return { success: true as const, data: serializeOrder(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 6 — Dispatch & Delivery. The normal delivery path: DISPATCHED
 * -> DELIVERED, terminal (ALLOWED_TRANSITIONS already has DELIVERED: []),
 * which together with recordBusinessOrderDispatch's/this milestone's own
 * read-only guard is what makes a delivered order read-only for anyone
 * except Founder/Admin going forward.
 */
export async function deliverBusinessOrder(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const data = deliverBusinessOrderSchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.businessOrder.findUnique({ where: { id: data.id } });
      if (!order) throw new NotFoundError("Business order");
      if (order.status !== "DISPATCHED") {
        throw new ForbiddenError(`Only a dispatched order can be marked delivered (this order is ${order.status.toLowerCase()})`);
      }

      const result = await tx.businessOrder.update({
        where: { id: data.id },
        data: {
          status: "DELIVERED",
          deliveredAt: data.deliveredAt ?? new Date(),
          deliveredById: principal.id,
          deliveryConfirmation: data.deliveryConfirmation || null,
          deliveryRemarks: data.deliveryRemarks || null,
        },
      });

      // Block 3, Part D — closes the Shipment dispatchBusinessOrder opened.
      // Uses updateMany (not update) since a shipment row is only guaranteed
      // to exist if this order was dispatched through the normal path above;
      // this stays defensive rather than throwing if one is somehow missing.
      const shipment = await tx.shipment.findUnique({ where: { businessOrderId: order.id } });
      if (shipment) {
        await tx.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED", deliveredAt: result.deliveredAt } });
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id, status: "DELIVERED",
            description: `Delivered${result.deliveryConfirmation ? ` — confirmation: ${result.deliveryConfirmation}` : ""}`,
            occurredAt: result.deliveredAt ?? new Date(),
          },
        });
      }

      // Finance Hook: ORDER_DELIVERED, same stable-payload convention as
      // ORDER_DISPATCHED above.
      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "ORDER_DELIVERED",
        recordType: "BusinessOrder", recordId: order.id,
        previousValue: { status: order.status },
        newValue: {
          orderNumber: result.orderNumber, customerId: result.customerId, grandTotal: Number(result.grandTotal),
          status: "DELIVERED", deliveredAt: result.deliveredAt, deliveredById: principal.id,
          deliveryConfirmation: result.deliveryConfirmation,
        },
      }, tx);

      return result;
    });

    revalidatePath("/os/orders");
    revalidatePath(`/os/orders/business/${data.id}`);
    revalidatePath("/os/operations");

    // Milestone 8 — Finance & Accounts event-driven integration. Fired
    // after commit — a Finance posting failure must never fail (or roll
    // back) the delivery confirmation itself.
    await recordFinanceEvent({
      actingUserId: principal.id, sourceModule: "business_ops", sourceEventAction: "ORDER_DELIVERED",
      sourceRecordId: updated.id, amount: updated.grandTotal, description: `Order ${updated.orderNumber}: revenue recognized on delivery`,
    }).catch(() => {});

    return { success: true as const, data: serializeOrder(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 6 — Founder/Admin-only correction path for already-recorded
 * dispatch/delivery data. Never changes status — only the factual fields.
 * Only usable once dispatch info exists (order is DISPATCHED or DELIVERED);
 * always produces its own distinct, reason-carrying audit row rather than
 * silently overwriting the original ORDER_DISPATCHED/ORDER_DELIVERED entry.
 */
export async function amendBusinessOrderDispatchDelivery(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    if (!isFounderOrAdmin(principal)) throw new ForbiddenError("Only Founder/Admin can amend dispatch or delivery information");
    const data = amendBusinessOrderDispatchDeliverySchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.businessOrder.findUnique({ where: { id: data.id } });
      if (!order) throw new NotFoundError("Business order");
      if (order.status !== "DISPATCHED" && order.status !== "DELIVERED") {
        throw new ForbiddenError("Nothing to amend — this order has no recorded dispatch information");
      }

      const updateData: Prisma.BusinessOrderUpdateInput = {};
      if (data.dispatchMethod !== undefined) updateData.dispatchMethod = data.dispatchMethod;
      if (data.carrierName !== undefined) updateData.carrierName = data.carrierName || null;
      if (data.trackingReference !== undefined) updateData.trackingReference = data.trackingReference || null;
      if (data.dispatchNotes !== undefined) updateData.dispatchNotes = data.dispatchNotes || null;
      if (data.deliveryConfirmation !== undefined) updateData.deliveryConfirmation = data.deliveryConfirmation || null;
      if (data.deliveryRemarks !== undefined) updateData.deliveryRemarks = data.deliveryRemarks || null;

      const result = await tx.businessOrder.update({ where: { id: data.id }, data: updateData });

      // Block 3, Part D — keep the Shipment record in sync with a
      // Founder/Admin correction so it never silently drifts from the
      // BusinessOrder fields it was derived from at dispatch time.
      if (data.carrierName !== undefined || data.trackingReference !== undefined) {
        await tx.shipment.updateMany({
          where: { businessOrderId: order.id },
          data: { courierName: result.carrierName, awbNumber: result.trackingReference },
        });
      }

      await appendAuditLog({
        userId: principal.id, module: "business_ops", action: "DISPATCH_DELIVERY_AMENDED",
        recordType: "BusinessOrder", recordId: order.id,
        previousValue: {
          dispatchMethod: order.dispatchMethod, carrierName: order.carrierName, trackingReference: order.trackingReference,
          dispatchNotes: order.dispatchNotes, deliveryConfirmation: order.deliveryConfirmation, deliveryRemarks: order.deliveryRemarks,
        },
        newValue: {
          reason: data.reason, dispatchMethod: result.dispatchMethod, carrierName: result.carrierName, trackingReference: result.trackingReference,
          dispatchNotes: result.dispatchNotes, deliveryConfirmation: result.deliveryConfirmation, deliveryRemarks: result.deliveryRemarks,
        },
      }, tx);

      return result;
    });

    revalidatePath(`/os/orders/business/${data.id}`);
    return { success: true as const, data: serializeOrder(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listBusinessOrders(input?: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, PERMISSIONS.BUSINESS_ORDERS_VIEW_ASSIGNED, PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const query = listBusinessOrdersQuerySchema.parse(input ?? {});
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");

    const where: Prisma.BusinessOrderWhereInput = {
      AND: [
        scope,
        query.status ? { status: query.status } : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.territoryId ? { territoryId: query.territoryId } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.q ? { OR: [{ orderNumber: { contains: query.q, mode: "insensitive" } }, { customer: { name: { contains: query.q, mode: "insensitive" } } }] } : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.businessOrder.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { customer: { select: { name: true } }, owner: { select: { name: true } }, territory: { select: { name: true } } },
      }),
      prisma.businessOrder.count({ where }),
    ]);

    return {
      success: true as const,
      data: {
        items: items.map((o) => serializeOrder(o)),
        total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * A principal with only `view_assigned` (no `view_all`/`manage`) must not
 * be able to read another owner's order by guessing/navigating to its
 * direct URL — assignedScopeWhere already prevents this for listBusinessOrders'
 * query, but a single findUnique-by-id bypasses that WHERE clause entirely
 * unless re-checked explicitly here. `manage` is treated as view-capable
 * too, consistent with this codebase's existing convention that `manage`
 * is an unscoped, operationally-broader permission (matches every officer's
 * actual seeded grant, which always pairs view_assigned with manage) —
 * this only actually restricts a principal holding view_assigned in
 * isolation, which no currently-seeded role does, but closes the gap for
 * whenever one might.
 */
function assertCanViewOrder(principal: { isFounder: boolean; permissions: Set<string>; id: string }, order: { ownerId: string }) {
  const unrestricted = principal.isFounder || principal.permissions.has(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL) || principal.permissions.has(PERMISSIONS.BUSINESS_ORDERS_MANAGE);
  if (!unrestricted && order.ownerId !== principal.id) throw new ForbiddenError("You don't have access to this order");
}

export async function getBusinessOrderDetail(id: string) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, PERMISSIONS.BUSINESS_ORDERS_VIEW_ASSIGNED, PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const order = await prisma.businessOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true } },
        territory: { select: { id: true, name: true } },
        opportunity: { select: { id: true, opportunityNumber: true } },
        quotationVersion: { select: { id: true, versionNumber: true, quotation: { select: { id: true, quotationNumber: true } } } },
        items: { include: { product: { select: { name: true, images: true } }, variant: { select: { size: true } } }, orderBy: { displayOrder: "asc" } },
        // Milestone 5 — Operations Foundation.
        warehouse: { select: { id: true, name: true } },
        // Milestone 6 — Dispatch & Delivery.
        dispatchedBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
      },
    });
    if (!order) throw new NotFoundError("Business order");
    assertCanViewOrder(principal, order);
    return {
      success: true as const,
      data: {
        ...serializeOrder(order),
        customer: { ...order.customer, creditLimit: order.customer.creditLimit ? Number(order.customer.creditLimit) : null },
        canAmendDispatchDelivery: isFounderOrAdmin(principal),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Timeline (Step 14) — reuses SalesAuditLog exclusively; no new history
 * table. Queried by recordId alone (not recordType) since cuid() ids are
 * effectively globally unique across tables — this picks up every event
 * already written against this order's id regardless of which action wrote
 * it (order creation/status/dispatch from this file, notes/attachments from
 * actions/inst-shared.ts), with no risk of the two files' recordType string
 * conventions ("BusinessOrder" here vs the InstEntityType value "ORDER" in
 * inst-shared.ts) needing to match.
 */
const TIMELINE_LABELS: Record<string, string> = {
  ORDER_CREATED_FROM_QUOTATION: "Order created from quotation",
  ORDER_STATUS_CHANGED: "Status changed",
  ORDER_DISPATCH_INFO_UPDATED: "Dispatch information recorded",
  // Milestone 6 — Dispatch & Delivery.
  ORDER_DISPATCHED: "Order dispatched",
  ORDER_DELIVERED: "Order delivered",
  DISPATCH_DELIVERY_AMENDED: "Dispatch/delivery information amended (Founder/Admin)",
  NOTE_ADDED: "Note added",
  ATTACHMENT_ADDED: "Attachment added",
};

export async function getBusinessOrderTimeline(orderId: string) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, PERMISSIONS.BUSINESS_ORDERS_VIEW_ASSIGNED, PERMISSIONS.BUSINESS_ORDERS_MANAGE);
    const order = await prisma.businessOrder.findUnique({ where: { id: orderId }, select: { ownerId: true } });
    if (!order) throw new NotFoundError("Business order");
    assertCanViewOrder(principal, order);
    const events = await prisma.salesAuditLog.findMany({
      where: { recordId: orderId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    return {
      success: true as const,
      data: events.map((e) => ({
        id: e.id,
        label: TIMELINE_LABELS[e.action] ?? e.action,
        actorName: e.user?.name ?? "System",
        createdAt: e.createdAt,
        detail: e.newValue,
      })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getBusinessOrderSummaryCounts() {
  try {
    const principal = await getSalesPrincipal();
    const scope = assignedScopeWhere(principal, PERMISSIONS.BUSINESS_ORDERS_VIEW_ALL, "ownerId");
    const grouped = await prisma.businessOrder.groupBy({ by: ["status"], where: scope, _count: { _all: true } });
    const byStatus: Record<string, number> = {};
    for (const row of grouped) byStatus[row.status] = row._count._all;
    return { success: true as const, data: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
