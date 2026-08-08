import { AppError, NotFoundError } from "@/lib/errors";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 3 — Notification
 * Rules. Deliberately no new Prisma model: escalation is a real, pure,
 * rule-based function over the existing `FounderNotification` row's own
 * fields (`priority`, `readAt`, `createdAt`) — the same "plain documented
 * business rule, not a trained model" convention `ALERT_THRESHOLDS`
 * establishes in `domain.ts`. "Escalating" a notification means bumping
 * `priority` to `CRITICAL` in place; there is no separate escalation
 * table or state machine because the existing `priority` column already
 * is that state.
 *
 * Scope is organization-wide (not limited to `recipientId: principal.id`
 * the way `listMyNotifications` is) because evaluating/triggering
 * escalation is a supervisory Enterprise Control Center capability, not
 * a personal-inbox one — consistent with the Exception Center and
 * Approval Center both being organization-wide reads.
 */

const ESCALATION_UNREAD_AGE_HOURS = 24;
/** Priorities eligible to escalate. CRITICAL is already the ceiling — there is nothing above it to escalate to. */
const ESCALATABLE_PRIORITIES = ["HIGH"];

function hoursSince(date: Date, now: Date) {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

/** Pure rule: unread, still-escalatable priority, older than the threshold. */
export function isEscalationDue(
  notification: { priority: string; readAt: Date | null; createdAt: Date },
  now: Date,
): boolean {
  if (notification.readAt) return false;
  if (!ESCALATABLE_PRIORITIES.includes(notification.priority)) return false;
  return hoursSince(notification.createdAt, now) >= ESCALATION_UNREAD_AGE_HOURS;
}

export async function getEscalationCandidates() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_ACCESS);
  const now = new Date();
  const cutoff = new Date(now.getTime() - ESCALATION_UNREAD_AGE_HOURS * 60 * 60 * 1000);

  const candidates = await enterpriseTransaction((tx) =>
    tx.founderNotification.findMany({
      where: {
        organizationKey: principal.organizationKey,
        readAt: null,
        priority: { in: ESCALATABLE_PRIORITIES },
        createdAt: { lte: cutoff },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 100,
    })
  );

  return { asOf: now, thresholdHours: ESCALATION_UNREAD_AGE_HOURS, count: candidates.length, items: candidates };
}

export async function escalateNotification(notificationId: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_NOTIFICATIONS_MANAGE);
  const now = new Date();

  return enterpriseTransaction(async (tx) => {
    const notification = await tx.founderNotification.findFirst({
      where: { id: notificationId, organizationKey: principal.organizationKey },
    });
    if (!notification) throw new NotFoundError("Notification");
    if (!isEscalationDue(notification, now)) {
      throw new AppError("Notification does not meet escalation rules (already read, already CRITICAL, or not yet aged past the threshold).");
    }
    return tx.founderNotification.update({ where: { id: notification.id }, data: { priority: "CRITICAL" } });
  });
}
