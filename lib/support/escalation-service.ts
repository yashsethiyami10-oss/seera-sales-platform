import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { enterpriseTransaction, recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireSupportPrincipal } from "./context";
import { DEFAULT_ESCALATION_CHAIN, CRITICAL_PRIORITIES } from "./domain";
import { upsertAlert } from "@/lib/founder-os/alert-store";

/**
 * Escalation Matrix. Manual escalation is always allowed regardless of SLA
 * state (human judgement must never wait on a timer); automatic escalation
 * is driven by the same breach sweep as sla-service.ts's sweepSlaBreaches,
 * evaluated per configured SupportEscalationRule chain level. Idempotent —
 * the unique (organizationKey, ticketId, ruleId, level) constraint makes a
 * duplicate escalation at the same level structurally impossible.
 */

const ruleInput = z.object({
  name: z.string().min(2).max(120),
  triggerType: z.enum(["SLA_BREACH", "MANUAL", "PRIORITY_CRITICAL"]),
  chain: z.array(z.object({ level: z.number().int().positive(), roleName: z.string().min(1), afterMinutes: z.number().int().nonnegative() })).min(1),
});

export async function createEscalationRule(input: unknown) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_ESCALATION_CONFIGURE);
  const data = ruleInput.parse(input);
  return prisma.supportEscalationRule.create({ data: { organizationKey: principal.organizationKey, name: data.name, triggerType: data.triggerType, chainJson: data.chain, createdById: principal.id } });
}

export async function listEscalationRules() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  return prisma.supportEscalationRule.findMany({ where: { organizationKey: principal.organizationKey, active: true }, orderBy: { createdAt: "desc" } });
}

export async function escalateTicket(ticketId: string, reason: string, level = 1, ruleId?: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_ESCALATE);
  if (!reason || reason.trim().length < 3) throw new AppError("An escalation reason is required", 422, "VALIDATION_ERROR");
  return enterpriseTransaction(async (tx) => {
    const ticket = await tx.supportTicket.findFirst({ where: { id: ticketId, organizationKey: principal.organizationKey } });
    if (!ticket) throw new NotFoundError("Ticket");
    let rule = ruleId ? await tx.supportEscalationRule.findFirst({ where: { id: ruleId, organizationKey: principal.organizationKey } }) : null;
    if (!rule) rule = await tx.supportEscalationRule.findFirst({ where: { organizationKey: principal.organizationKey, triggerType: "MANUAL", active: true } });
    const resolvedRuleId = rule?.id ?? "manual";

    const existing = await tx.supportEscalation.findFirst({ where: { organizationKey: principal.organizationKey, ticketId, ruleId: resolvedRuleId, level } });
    if (existing) return existing;

    const escalation = await tx.supportEscalation.create({
      data: { organizationKey: principal.organizationKey, ticketId, ruleId: resolvedRuleId, level, reason, triggerType: "MANUAL" },
    });
    await recordEnterpriseMutation(tx, principal, { module: "support", action: "TICKET_ESCALATED", entityType: "SupportTicket", entityId: ticketId, description: `Ticket ${ticket.ticketNumber} escalated to level ${level}: ${reason}` });

    if (CRITICAL_PRIORITIES.includes(ticket.priority as never) || level >= 4) {
      await upsertAlert(tx, principal.organizationKey, {
        alertType: "SUPPORT_ESCALATION_UNRESOLVED", severity: level >= 4 ? "CRITICAL" : "WARNING",
        title: `Ticket ${ticket.ticketNumber} escalated`, description: reason,
        sourceModule: "support", sourceEntityType: "SupportTicket", sourceEntityId: ticketId,
      });
    }
    return escalation;
  });
}

export async function resolveEscalation(id: string) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_ESCALATE);
  const escalation = await prisma.supportEscalation.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!escalation) throw new NotFoundError("Escalation");
  if (escalation.resolvedAt) throw new ConflictError("Escalation already resolved");
  return prisma.supportEscalation.update({ where: { id }, data: { resolvedAt: new Date() } });
}

export async function listEscalations(input: { ticketId?: string; unresolvedOnly?: boolean; page?: number; pageSize?: number }) {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_VIEW_ASSIGNED);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    ...(input.unresolvedOnly ? { resolvedAt: null } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supportEscalation.findMany({ where, orderBy: { escalatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.supportEscalation.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/**
 * Automatic escalation sweep — evaluates every breached, unresolved-escalation
 * ticket against the active SLA_BREACH rule chain (falling back to the
 * hardcoded DEFAULT_ESCALATION_CHAIN if no rule is configured), advancing
 * one level at a time. Safe to re-run: the unique index prevents duplicate
 * rows at the same level.
 */
export async function sweepAutomaticEscalations() {
  const principal = await requireSupportPrincipal(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
  const rule = await prisma.supportEscalationRule.findFirst({ where: { organizationKey: principal.organizationKey, triggerType: "SLA_BREACH", active: true } });
  const chain = (rule?.chainJson as typeof DEFAULT_ESCALATION_CHAIN | undefined) ?? DEFAULT_ESCALATION_CHAIN;
  const breached = await prisma.supportTicket.findMany({
    where: { organizationKey: principal.organizationKey, slaBreached: true, status: { notIn: ["RESOLVED", "CLOSED"] } },
    include: { escalations: true },
  });
  let created = 0;
  for (const ticket of breached) {
    const currentLevel = ticket.escalations.reduce((max, e) => Math.max(max, e.level), 0);
    const next = chain.find((c) => c.level === currentLevel + 1);
    if (!next) continue;
    const breachAgeMinutes = ticket.resolutionDueAt ? Math.round((Date.now() - ticket.resolutionDueAt.getTime()) / 60000) : 0;
    if (breachAgeMinutes < next.afterMinutes) continue;
    await enterpriseTransaction(async (tx) => {
      const existing = await tx.supportEscalation.findFirst({ where: { organizationKey: principal.organizationKey, ticketId: ticket.id, ruleId: rule?.id ?? "default", level: next.level } });
      if (existing) return;
      await tx.supportEscalation.create({ data: { organizationKey: principal.organizationKey, ticketId: ticket.id, ruleId: rule?.id ?? "default", level: next.level, reason: `SLA breach unresolved for ${breachAgeMinutes} minutes`, triggerType: "SLA_BREACH" } });
      created++;
      if (next.level >= 3) {
        await upsertAlert(tx, principal.organizationKey, {
          alertType: "SUPPORT_ESCALATION_UNRESOLVED", severity: next.level >= 4 ? "CRITICAL" : "WARNING",
          title: `Ticket ${ticket.ticketNumber} auto-escalated to ${next.roleName}`, description: `Unresolved SLA breach, level ${next.level}`,
          sourceModule: "support", sourceEntityType: "SupportTicket", sourceEntityId: ticket.id,
        });
      }
    });
  }
  return { created };
}
