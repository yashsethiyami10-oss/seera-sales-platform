import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import type { EnterpriseTx } from "@/lib/enterprise/context";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";

/**
 * SLA Service. Response/Resolution SLA, Business Hours, Holiday Calendar,
 * pause/resume (the actual pause/resume state transition lives in
 * ticket-service.ts's transitionTicketStatus, since it's driven by the
 * ticket's own status change — this file only supplies the due-date math
 * and the breach sweep), matching lib/enterprise-finance/calendar-tax-audit-service.ts's
 * isBusinessDay pattern exactly.
 */

async function isBusinessDay(tx: EnterpriseTx | typeof prisma, organizationKey: string, date: Date) {
  const dayOfWeek = date.getUTCDay();
  const hours = await tx.supportBusinessHours.findFirst({ where: { organizationKey, dayOfWeek } });
  if (!hours) return false;
  const holiday = await tx.supportHoliday.findFirst({ where: { organizationKey, date: { gte: new Date(date.toDateString()), lt: new Date(new Date(date.toDateString()).getTime() + 86400000) } } });
  return !holiday;
}

async function addBusinessMinutes(tx: EnterpriseTx | typeof prisma, organizationKey: string, from: Date, minutes: number, businessHoursOnly: boolean) {
  if (!businessHoursOnly) return new Date(from.getTime() + minutes * 60000);
  let remaining = minutes;
  let cursor = new Date(from);
  let guard = 0;
  while (remaining > 0 && guard < 400) {
    guard++;
    if (await isBusinessDay(tx, organizationKey, cursor)) {
      const step = Math.min(remaining, 1440);
      cursor = new Date(cursor.getTime() + step * 60000);
      remaining -= step;
    } else {
      cursor = new Date(cursor.getTime() + 1440 * 60000);
    }
  }
  return cursor;
}

export async function computeSlaDueDates(tx: EnterpriseTx, organizationKey: string, category: string, priority: string) {
  const policy = await tx.supportSlaPolicy.findFirst({ where: { organizationKey, active: true, category: category as never, priority: priority as never } })
    ?? await tx.supportSlaPolicy.findFirst({ where: { organizationKey, active: true, category: category as never, priority: null } })
    ?? await tx.supportSlaPolicy.findFirst({ where: { organizationKey, active: true, category: null, priority: null } });
  if (!policy) return { policyId: null, responseDueAt: null, resolutionDueAt: null };
  const now = new Date();
  const responseDueAt = await addBusinessMinutes(tx, organizationKey, now, policy.responseMinutes, policy.businessHoursOnly);
  const resolutionDueAt = await addBusinessMinutes(tx, organizationKey, now, policy.resolutionMinutes, policy.businessHoursOnly);
  return { policyId: policy.id, responseDueAt, resolutionDueAt };
}

const slaPolicyInput = z.object({
  name: z.string().min(2).max(120),
  category: z.enum(["GENERAL_INQUIRY", "COMPLAINT", "PRODUCT_ISSUE", "RETURN_REPLACEMENT", "REFUND", "WARRANTY_CLAIM", "ORDER_STATUS", "BILLING", "FEEDBACK"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"]).optional(),
  responseMinutes: z.coerce.number().int().positive(),
  resolutionMinutes: z.coerce.number().int().positive(),
  businessHoursOnly: z.coerce.boolean().default(true),
});

export async function createSlaPolicy(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_SLA_CONFIGURE);
  const data = slaPolicyInput.parse(input);
  const entity = await prisma.supportSlaPolicy.create({ data: { organizationKey: principal.organizationKey, ...data } });
  await recordEnterpriseMutation(prisma as unknown as EnterpriseTx, principal, { module: "support", action: "SLA_POLICY_CREATED", entityType: "SupportSlaPolicy", entityId: entity.id, description: `SLA policy "${entity.name}" created` }).catch(() => {});
  return entity;
}

export async function listSlaPolicies() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportSlaPolicy.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: { createdAt: "desc" } });
}

export async function setBusinessHours(input: { dayOfWeek: number; startTime: string; endTime: string }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_SLA_CONFIGURE);
  return prisma.supportBusinessHours.upsert({
    where: { organizationKey_dayOfWeek: { organizationKey: principal.organizationKey, dayOfWeek: input.dayOfWeek } },
    create: { organizationKey: principal.organizationKey, ...input },
    update: { startTime: input.startTime, endTime: input.endTime },
  });
}

export async function listBusinessHours() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportBusinessHours.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: { dayOfWeek: "asc" } });
}

export async function addHoliday(input: { date: string; name: string }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_SLA_CONFIGURE);
  return prisma.supportHoliday.create({ data: { organizationKey: principal.organizationKey, date: new Date(input.date), name: input.name } });
}

export async function listHolidays() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportHoliday.findMany({ where: { organizationKey: principal.organizationKey }, orderBy: { date: "asc" } });
}

/**
 * Breach sweep — idempotent (a re-run only ever flips slaBreached from
 * false to true, never toggles it back, and setting an already-true flag
 * again is a no-op), safe to call on a schedule or lazily on read. Does
 * NOT change ticket status — breach is an orthogonal, still-workable flag.
 */
export async function sweepSlaBreaches() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const now = new Date();
  const candidates = await prisma.supportTicket.findMany({
    where: {
      organizationKey: principal.organizationKey, slaBreached: false,
      status: { notIn: ["RESOLVED", "CLOSED"] },
      OR: [{ responseDueAt: { lt: now }, firstRespondedAt: null }, { resolutionDueAt: { lt: now } }],
    },
    select: { id: true, ticketNumber: true },
  });
  if (candidates.length === 0) return { breached: 0 };
  await prisma.supportTicket.updateMany({ where: { id: { in: candidates.map((c) => c.id) } }, data: { slaBreached: true } });
  return { breached: candidates.length, ticketNumbers: candidates.map((c) => c.ticketNumber) };
}

export async function getSlaPerformance(input: { from?: Date; to?: Date }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_REPORTS_VIEW);
  const where = { organizationKey: principal.organizationKey, ...(input.from || input.to ? { createdAt: { gte: input.from, lte: input.to } } : {}) };
  const [total, breached] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { ...where, slaBreached: true } }),
  ]);
  return { total, breached, breachRate: total > 0 ? Math.round((breached / total) * 1000) / 10 : 0 };
}

export { isBusinessDay };
