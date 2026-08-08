import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";
import { upsertAlert } from "@/lib/founder-os/alert-store";

/** Customer Feedback + CSAT Framework + NPS-ready Framework. Measures the
 * journey, not one score (Principle 9) — reported together, never alone. */

const feedbackInput = z.object({ ticketId: z.string().cuid().optional(), customerId: z.string().cuid(), rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(2000).optional() });

export async function submitFeedback(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = feedbackInput.parse(input);
  return prisma.supportFeedback.create({ data: { organizationKey: principal.organizationKey, ...data } });
}

export async function listFeedback(input: { customerId?: string; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey, ...(input.customerId ? { customerId: input.customerId } : {}) };
  const [items, total] = await Promise.all([
    prisma.supportFeedback.findMany({ where, orderBy: { submittedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportFeedback.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

const csatScore = z.object({ ticketId: z.string().cuid(), score: z.coerce.number().int().min(1).max(5), comment: z.string().max(1000).optional() });

/** The CSAT request row already exists (created on RESOLVED->CLOSED by
 * ticket-service.ts) — this records the customer's actual response. */
export async function submitCsatResponse(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = csatScore.parse(input);
  const existing = await prisma.supportCsatResponse.findFirst({ where: { ticketId: data.ticketId, organizationKey: principal.organizationKey } });
  if (!existing) throw new NotFoundError("CSAT request");
  return enterpriseTransaction(async (tx) => {
    const response = await tx.supportCsatResponse.update({ where: { ticketId: data.ticketId }, data: { score: data.score, comment: data.comment, respondedAt: new Date() } });
    if (data.score <= 2) {
      const ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: data.ticketId } });
      await upsertAlert(tx, principal.organizationKey, {
        alertType: "SUPPORT_CSAT_DROP", severity: "WARNING", title: `Low CSAT on ticket ${ticket.ticketNumber}`,
        description: data.comment ?? `Customer scored ${data.score}/5`, sourceModule: "support", sourceEntityType: "SupportTicket", sourceEntityId: data.ticketId,
      });
    }
    return response;
  });
}

export async function getCsatTrend(input: { from?: Date; to?: Date }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const where = { organizationKey: principal.organizationKey, respondedAt: { not: null, ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } };
  const responses = await prisma.supportCsatResponse.findMany({ where, select: { score: true } });
  const average = responses.length ? Math.round((responses.reduce((s, r) => s + r.score, 0) / responses.length) * 100) / 100 : null;
  return { count: responses.length, average };
}

const npsInput = z.object({ customerId: z.string().cuid(), score: z.coerce.number().int().min(0).max(10), comment: z.string().max(1000).optional(), surveyRound: z.string().min(1).max(40) });

export async function submitNpsResponse(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const data = npsInput.parse(input);
  return prisma.supportNpsResponse.create({ data: { organizationKey: principal.organizationKey, ...data } });
}

export async function getNpsScore(surveyRound?: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const responses = await prisma.supportNpsResponse.findMany({ where: { organizationKey: principal.organizationKey, ...(surveyRound ? { surveyRound } : {}) }, select: { score: true } });
  if (responses.length === 0) return { count: 0, nps: null };
  const promoters = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  const nps = Math.round(((promoters - detractors) / responses.length) * 100);
  return { count: responses.length, nps };
}
