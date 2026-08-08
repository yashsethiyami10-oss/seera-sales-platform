import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ConflictError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireSupportPrincipal } from "./context";

/**
 * Product Issue Management + Manufacturing Batch Lookup. Read-only join into
 * EnterpriseBatch by plain id — Support never owns or duplicates
 * manufacturing data (Milestone 7's own frozen model, untouched).
 */

const reportInput = z.object({
  ticketId: z.string().cuid(),
  productId: z.string().cuid(),
  variantId: z.string().cuid().optional(),
  batchId: z.string().cuid().optional(),
  issueType: z.string().min(1).max(60),
  evidenceUrls: z.array(z.string().url()).default([]),
});

export async function createProductIssueReport(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = reportInput.parse(input);
  const ticket = await prisma.supportTicket.findFirst({ where: { id: data.ticketId, organizationKey: principal.organizationKey } });
  if (!ticket) throw new NotFoundError("Ticket");
  const existing = await prisma.productIssueReport.findUnique({ where: { ticketId: data.ticketId } });
  if (existing) throw new ConflictError("This ticket already has a product issue report");
  return prisma.productIssueReport.create({ data: { organizationKey: principal.organizationKey, ...data } });
}

export async function updateRootCauseNotes(ticketId: string, rootCauseNotes: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const report = await prisma.productIssueReport.findFirst({ where: { ticketId, organizationKey: principal.organizationKey } });
  if (!report) throw new NotFoundError("Product issue report");
  return prisma.productIssueReport.update({ where: { ticketId }, data: { rootCauseNotes } });
}

export async function getProductIssueReport(ticketId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.productIssueReport.findFirst({ where: { ticketId, organizationKey: principal.organizationKey } });
}

/** Live lookup only — never a cached copy of manufacturing data. */
export async function lookupBatch(batchId: string) {
  await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const batch = await prisma.enterpriseBatch.findUnique({
    where: { id: batchId },
    select: { id: true, batchNumber: true, status: true, qualityStatus: true, productVariantId: true, actualQuantity: true, manufacturingDate: true, completedAt: true },
  });
  if (!batch) throw new NotFoundError("Batch");
  return batch;
}

/** Quality trend signal: how many other tickets reference this same batch. */
export async function getTicketCountByBatch(batchId: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  return prisma.productIssueReport.count({ where: { organizationKey: principal.organizationKey, batchId } });
}

export async function listProductComplaints(input: { page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey };
  const [items, total] = await Promise.all([
    prisma.productIssueReport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.productIssueReport.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
