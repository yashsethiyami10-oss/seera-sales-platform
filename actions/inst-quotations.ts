"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors";
import { requirePermission, requireAnyPermission, getSalesPrincipal } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { appendAuditLog } from "@/lib/sales/audit";
import { assignedScopeWhere } from "@/lib/inst-sales/scope";
import { withRetryOnNumberConflict } from "@/lib/inst-sales/numbering";
import { createBusinessOrderCore } from "@/lib/business-orders/core";
import { priceLines } from "@/lib/inst-sales/pricing";
import {
  createQuotationSchema, reviseQuotationSchema, quotationVersionIdSchema, rejectQuotationSchema,
  sendQuotationSchema, acceptQuotationSchema, listQuotationsQuerySchema,
} from "@/lib/validations/inst-sales";
import { getMessagingProvider } from "@/lib/messaging";
import { getEmailProvider } from "@/lib/notify/providers/email";

type SerializableVersion = {
  subtotal: unknown; discountTotal: unknown; taxTotal: unknown; grandTotal: unknown;
  lineItems?: { unitPrice: unknown; discountPercent: unknown; taxRate: unknown; lineTotal: unknown }[];
};

/**
 * Not generic on purpose: an earlier generic version of this helper let
 * TypeScript's inference fall back to the (Decimal-typed) constraint shape
 * at some call sites instead of the concrete Prisma result, silently
 * un-doing the Decimal→number conversion in the *type* (values were still
 * correct at runtime — this was a type-safety gap, not a functional bug).
 * `Omit<T, keyof SerializableVersion>` keeps every field the caller's
 * concrete Prisma type actually has; the intersection then guarantees the
 * four money fields and lineItems are `number`, never `Decimal`, in the
 * return type every call site sees.
 */
function serializeVersion<T extends SerializableVersion>(v: T): Omit<T, keyof SerializableVersion> & {
  subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number;
  lineItems: T["lineItems"] extends (infer Item)[] ? (Omit<Item, "unitPrice" | "discountPercent" | "taxRate" | "lineTotal"> & { unitPrice: number; discountPercent: number; taxRate: number; lineTotal: number })[] : never;
} {
  return {
    ...v,
    subtotal: Number(v.subtotal), discountTotal: Number(v.discountTotal), taxTotal: Number(v.taxTotal), grandTotal: Number(v.grandTotal),
    lineItems: v.lineItems?.map((li) => ({ ...li, unitPrice: Number(li.unitPrice), discountPercent: Number(li.discountPercent), taxRate: Number(li.taxRate), lineTotal: Number(li.lineTotal) })),
  } as never;
}

export async function createQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const data = createQuotationSchema.parse(input);
    const opportunity = await prisma.instOpportunity.findUnique({ where: { id: data.opportunityId } });
    if (!opportunity) throw new NotFoundError("Opportunity");

    const { priced, totals } = await priceLines(data.lineItems);

    const result = await withRetryOnNumberConflict("QUOT", (quotationNumber) =>
      prisma.$transaction(async (tx) => {
        const quotation = await tx.instQuotation.create({
          data: { quotationNumber, opportunityId: opportunity.id, customerId: opportunity.customerId, ownerId: principal.id },
        });
        const version = await tx.instQuotationVersion.create({
          data: {
            quotationId: quotation.id, versionNumber: 1, status: "DRAFT",
            issueDate: new Date(), validUntil: data.validUntil, termsSnapshot: data.termsSnapshot,
            createdById: principal.id, ...totals,
            lineItems: { create: priced },
          },
          include: { lineItems: true },
        });
        await tx.instOpportunity.update({ where: { id: opportunity.id }, data: { stage: "QUOTATION" } });
        return { quotation, version };
      })
    );

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_CREATED", recordType: "InstQuotation", recordId: result.quotation.id, newValue: { quotationNumber: result.quotation.quotationNumber, grandTotal: totals.grandTotal } });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: { quotationId: result.quotation.id, versionId: result.version.id, quotationNumber: result.quotation.quotationNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Module 9's "Version History" — a revision creates a new, linked version rather than mutating the sent one. */
export async function reviseQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const data = reviseQuotationSchema.parse(input);
    const quotation = await prisma.instQuotation.findUnique({ where: { id: data.quotationId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } });
    if (!quotation) throw new NotFoundError("Quotation");
    const latest = quotation.versions[0];

    const { priced, totals } = await priceLines(data.lineItems);

    const version = await prisma.instQuotationVersion.create({
      data: {
        quotationId: quotation.id, versionNumber: (latest?.versionNumber ?? 0) + 1, parentVersionId: latest?.id, status: "DRAFT",
        issueDate: new Date(), validUntil: data.validUntil, termsSnapshot: data.termsSnapshot, revisionReason: data.revisionReason,
        createdById: principal.id, ...totals,
        lineItems: { create: priced },
      },
      include: { lineItems: true },
    });

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_REVISED", recordType: "InstQuotation", recordId: quotation.id, newValue: { versionNumber: version.versionNumber } });
    revalidatePath(`/os/sales/quotations/${quotation.id}`);
    return { success: true as const, data: serializeVersion(version) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function submitQuotationForApproval(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const { versionId } = quotationVersionIdSchema.parse(input);
    const version = await prisma.instQuotationVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundError("Quotation version");
    if (version.status !== "DRAFT") throw new ForbiddenError("Only a draft quotation can be submitted for approval");

    const updated = await prisma.instQuotationVersion.update({ where: { id: versionId }, data: { status: "PENDING_APPROVAL" } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_SUBMITTED", recordType: "InstQuotationVersion", recordId: versionId });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: serializeVersion(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function approveQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_APPROVE);
    const { versionId } = quotationVersionIdSchema.parse(input);
    const version = await prisma.instQuotationVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundError("Quotation version");
    if (version.status !== "PENDING_APPROVAL") throw new ForbiddenError("Only a quotation pending approval can be approved");

    const updated = await prisma.instQuotationVersion.update({ where: { id: versionId }, data: { status: "APPROVED", approvedById: principal.id, approvedAt: new Date() } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_APPROVED", recordType: "InstQuotationVersion", recordId: versionId });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: serializeVersion(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function rejectQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_APPROVE);
    const data = rejectQuotationSchema.parse(input);
    const version = await prisma.instQuotationVersion.findUnique({ where: { id: data.versionId } });
    if (!version) throw new NotFoundError("Quotation version");

    const updated = await prisma.instQuotationVersion.update({ where: { id: data.versionId }, data: { status: "REJECTED", rejectionReason: data.reason } });
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_REJECTED", recordType: "InstQuotationVersion", recordId: data.versionId, newValue: { reason: data.reason } });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: serializeVersion(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Sends via the same pluggable providers every other domain in this app
 * uses (lib/messaging for WhatsApp, lib/notify's email provider) — never a
 * new integration. A send failure is logged but never blocks marking the
 * quotation SENT, matching lib/notify/send.ts's existing "notification
 * failure must never fail the business operation" rule.
 */
export async function sendQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const data = sendQuotationSchema.parse(input);
    const version = await prisma.instQuotationVersion.findUnique({
      where: { id: data.versionId },
      include: { quotation: { include: { customer: true } } },
    });
    if (!version) throw new NotFoundError("Quotation version");
    if (version.status !== "APPROVED") throw new ForbiddenError("Only an approved quotation can be sent");

    const { customer } = version.quotation;
    const grandTotal = Number(version.grandTotal);

    if (data.channel === "WHATSAPP" || data.channel === "BOTH") {
      if (customer.phone) {
        await getMessagingProvider().sendWhatsApp(customer.phone, "quotation_sent", [customer.name, version.quotation.quotationNumber, `₹${grandTotal.toLocaleString("en-IN")}`]).catch((err) => console.error("[inst-quotation:whatsapp]", err));
      }
    }
    if (data.channel === "EMAIL" || data.channel === "BOTH") {
      if (customer.email && !customer.email.endsWith("@no-login.muv.local")) {
        await getEmailProvider()
          .send({ to: customer.email, subject: `Quotation ${version.quotation.quotationNumber} from MUV`, html: `<p>Dear ${customer.name},</p><p>Please find your quotation <strong>${version.quotation.quotationNumber}</strong> (Version ${version.versionNumber}) totalling <strong>₹${grandTotal.toLocaleString("en-IN")}</strong>, valid until ${version.validUntil.toLocaleDateString("en-IN")}.</p><p>— MUV Institutional Sales</p>` })
          .catch((err) => console.error("[inst-quotation:email]", err));
      }
    }

    const updated = await prisma.instQuotationVersion.update({ where: { id: data.versionId }, data: { status: "SENT", sentAt: new Date(), sentVia: data.channel } });
    await prisma.instOpportunity.update({ where: { id: version.quotation.opportunityId }, data: { stage: "NEGOTIATION" } }).catch(() => null);
    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_SENT", recordType: "InstQuotationVersion", recordId: data.versionId, newValue: { channel: data.channel } });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: serializeVersion(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Milestone 4.1 — Quotation Acceptance Workflow Enhancement.
 *
 * Replaces the old respondToQuotation({accepted:true}) path. A Sales
 * Officer records however the customer actually communicated acceptance
 * (verbal, phone, WhatsApp, signed copy, etc. — Customer Portal is just
 * another value here, not a separate mechanism) and the Business Order is
 * created in the same breath — no second "Create Order" step for anything
 * accepted through this action.
 *
 * Mandatory architecture correction from the approved v4.1 spec: every
 * data-mutating step (steps 1-11 below) runs inside ONE
 * `prisma.$transaction`. If Business Order creation fails for any reason,
 * the whole transaction rolls back — the quotation status write, the
 * opportunity/customer lifecycle changes, and both audit rows never commit.
 * A quotation accepted through this action can therefore never end up
 * ACCEPTED-with-no-order; that state is now only reachable by quotations
 * accepted before this change shipped (handled by the untouched
 * createBusinessOrderFromQuotation fallback in actions/business-orders.ts).
 *
 * Permission/scope are revalidated fresh at the top of this call (not
 * reused from an earlier page load) via requirePermission — this codebase's
 * INST_QUOTATIONS_* permission set has no view_all/view_assigned split (only
 * VIEW/MANAGE/APPROVE), so there is no separate "assigned scope" dimension
 * to layer on for quotations specifically; MANAGE has always been unscoped
 * here (matching every other quotation-lifecycle action in this file), and
 * that convention is preserved rather than introduced ad hoc for this one
 * action.
 */
export async function acceptQuotation(input: unknown) {
  try {
    // Requires BOTH quotation-management and order-creation authority —
    // this single action now exercises both, so it independently enforces
    // both, rather than trusting that whoever could do one could do the
    // other. requirePermission uses AND semantics across multiple keys.
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE, PERMISSIONS.BUSINESS_ORDERS_CREATE_FROM_QUOTATION);
    const data = acceptQuotationSchema.parse(input);

    const order = await prisma.$transaction(async (tx) => {
      // 1. Revalidate quotation eligibility (fresh read inside the transaction).
      const version = await tx.instQuotationVersion.findUnique({
        where: { id: data.versionId },
        include: { quotation: { include: { opportunity: true, customer: true } }, lineItems: true, businessOrder: true },
      });
      if (!version) throw new NotFoundError("Quotation version");
      if (version.status !== "SENT") throw new ForbiddenError("Only a sent quotation can be accepted");

      // 4. Confirm no Business Order already exists — the real concurrency
      // guard is the DB-level unique constraint on quotationVersionId hit
      // by createBusinessOrderCore below; this check just gives the losing
      // concurrent request (or an accidental double-click) a clean error
      // instead of relying solely on the raw P2002.
      if (version.businessOrder) throw new ConflictError("An order already exists for this quotation");

      const { quotation } = version;
      const { customer, opportunity } = quotation;
      if (!customer.active) throw new ForbiddenError("Cannot create an order for an inactive customer");

      // 5-6. Record acceptance metadata, status -> ACCEPTED.
      await tx.instQuotationVersion.update({
        where: { id: version.id },
        data: {
          status: "ACCEPTED",
          acceptanceMethod: data.acceptanceMethod,
          acceptedById: principal.id,
          acceptedAt: new Date(),
          acceptanceRemarks: data.remarks ?? null,
        },
      });

      // 7. Opportunity -> WON.
      if (opportunity) {
        await tx.instOpportunity.update({ where: { id: opportunity.id }, data: { stage: "WON", wonAt: new Date() } });
      }
      // 8. Customer lifecycle.
      await tx.customer.update({ where: { id: customer.id }, data: { lifecycleStage: "CUSTOMER" } });

      // 9. Create the Business Order + items — the exact same logic
      // createBusinessOrderFromQuotation uses, via the shared core.
      const businessOrder = await createBusinessOrderCore(tx, {
        source: "QUOTATION",
        quotationVersionId: version.id,
        customer, opportunity, fallbackOwnerId: quotation.ownerId,
        subtotal: version.subtotal, discountTotal: version.discountTotal, taxTotal: version.taxTotal, grandTotal: version.grandTotal,
        lineItems: version.lineItems,
      });

      // 10. Quotation acceptance audit.
      await appendAuditLog({
        userId: principal.id, module: "inst_sales", action: "QUOTATION_ACCEPTED",
        recordType: "InstQuotationVersion", recordId: version.id,
        newValue: { acceptanceMethod: data.acceptanceMethod, remarks: data.remarks ?? null, businessOrderId: businessOrder.id },
      }, tx);
      // 11. Business Order creation audit — same action name/shape
      // createBusinessOrderFromQuotation already writes, so both paths
      // produce an identical, filterable audit trail. Milestone 4.2 adds
      // workflowUsed/leadId here too — the same audit vocabulary the new
      // Direct Business Order path uses (ORDER_CREATED_FROM_LEAD), so both
      // workflows are equally represented rather than only the new one.
      await appendAuditLog({
        userId: principal.id, module: "business_orders", action: "ORDER_CREATED_FROM_QUOTATION",
        recordType: "BusinessOrder", recordId: businessOrder.id,
        newValue: {
          orderNumber: businessOrder.orderNumber, quotationVersionId: version.id, grandTotal: Number(businessOrder.grandTotal),
          workflowUsed: "QUOTATION_WORKFLOW", leadId: opportunity?.leadId ?? null,
        },
      }, tx);

      return businessOrder;
      // 12. Commit — this closes the $transaction callback; Prisma commits
      // everything above as one unit, or (on any throw) rolls all of it back.
    });

    revalidatePath("/os/sales/quotations");
    revalidatePath("/os/sales/opportunities");
    revalidatePath("/os/orders");
    return { success: true as const, data: { id: order.id, orderNumber: order.orderNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Customer declined the quotation — unchanged from the old respondToQuotation({accepted:false}) path, reusing rejectQuotationSchema's identical {versionId, reason?} shape rather than a duplicate one. */
export async function declineQuotation(input: unknown) {
  try {
    const principal = await requirePermission(PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const data = rejectQuotationSchema.parse(input);
    const version = await prisma.instQuotationVersion.findUnique({ where: { id: data.versionId } });
    if (!version) throw new NotFoundError("Quotation version");

    const updated = await prisma.instQuotationVersion.update({
      where: { id: data.versionId },
      data: { status: "REJECTED", rejectionReason: data.reason },
    });

    await appendAuditLog({ userId: principal.id, module: "inst_sales", action: "QUOTATION_DECLINED", recordType: "InstQuotationVersion", recordId: data.versionId });
    revalidatePath("/os/sales/quotations");
    return { success: true as const, data: serializeVersion(updated) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listQuotations(input?: unknown) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.INST_QUOTATIONS_VIEW, PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const query = listQuotationsQuerySchema.parse(input ?? {});
    const scope = assignedScopeWhere(principal, PERMISSIONS.INST_QUOTATIONS_VIEW, "ownerId");

    const where = {
      AND: [
        scope,
        query.opportunityId ? { opportunityId: query.opportunityId } : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.status ? { versions: { some: { status: query.status } } } : {},
      ],
    };

    const [items, total] = await Promise.all([
      prisma.instQuotation.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { customer: { select: { name: true } }, owner: { select: { name: true } }, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.instQuotation.count({ where }),
    ]);

    return {
      success: true as const,
      data: {
        items: items.map((q) => ({ ...q, versions: q.versions.map((v) => serializeVersion(v)) })),
        total, page: query.page, pageSize: query.pageSize, pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getQuotationDetail(id: string) {
  try {
    await requireAnyPermission(PERMISSIONS.INST_QUOTATIONS_VIEW, PERMISSIONS.INST_QUOTATIONS_MANAGE);
    const quotation = await prisma.instQuotation.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true } },
        opportunity: { select: { id: true, opportunityNumber: true, stage: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            lineItems: { include: { product: { select: { name: true, images: true } }, variant: { select: { size: true } } }, orderBy: { displayOrder: "asc" } },
            createdBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
            // Milestone 4 — Order Management OS. Lets the quotation detail
            // page show "View Order" instead of "Create Order" once one
            // already exists for this version.
            businessOrder: { select: { id: true } },
            // Milestone 4.1 — Quotation Acceptance Workflow Enhancement.
            accepter: { select: { name: true } },
          },
        },
      },
    });
    if (!quotation) throw new NotFoundError("Quotation");
    return {
      success: true as const,
      data: {
        ...quotation,
        customer: { ...quotation.customer, creditLimit: quotation.customer.creditLimit ? Number(quotation.customer.creditLimit) : null },
        versions: quotation.versions.map((v) => serializeVersion(v)),
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getQuotationSummaryCounts() {
  try {
    const principal = await getSalesPrincipal();
    const scope = assignedScopeWhere(principal, PERMISSIONS.INST_QUOTATIONS_VIEW, "ownerId");
    const quotations = await prisma.instQuotation.findMany({
      where: scope,
      select: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { status: true, grandTotal: true } } },
    });
    const latestVersions = quotations.map((q) => q.versions[0]).filter((v): v is NonNullable<typeof v> => !!v);
    const byStatus: Record<string, number> = {};
    let pendingApprovalValue = 0;
    for (const v of latestVersions) {
      byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
      if (v.status === "PENDING_APPROVAL") pendingApprovalValue += Number(v.grandTotal);
    }
    return { success: true as const, data: { total: latestVersions.length, byStatus, pendingApprovalValue } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
