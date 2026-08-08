import { NotFoundError } from "@/lib/errors";
import type { EnterpriseTx } from "@/lib/enterprise/context";
import { enterpriseTransaction } from "@/lib/enterprise/governance";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFounderOsPrincipal } from "./context";
import { notificationCreateInput, pageInput } from "./schemas";

/**
 * Enterprise Architecture v3.0 Phase 2 Part 3D, Stage 1 — Founder
 * Notification Center. Deliberately a new, purpose-built model
 * (`FounderNotification`), not a reuse/extension of `NotificationLog` —
 * `NotificationLog` is an outbound delivery log for customer-facing
 * channels (SMS/WhatsApp/email, keyed by `recipient` as a raw string,
 * `channel` as a `NotificationChannel` enum with no read-state, priority,
 * category, or deep-link concept), a genuinely different purpose from an
 * internal Founder read/unread feed. Supports priority, read state,
 * category, deep links, created timestamp, and organization isolation, as
 * required.
 */

export async function createNotification(input: unknown) {
  const data = notificationCreateInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_NOTIFICATIONS_MANAGE);
  return enterpriseTransaction((tx) => createNotificationInTx(tx, principal.organizationKey, data));
}

/** Internal helper for other Founder OS modules (e.g. the Alert Engine)
 * already inside their own governed transaction and principal check — not
 * itself permission-gated, matching the same internal-helper pattern
 * `postSystemGeneratedJournalInTx` establishes in the frozen Part 3C
 * Posting Engine for already-authorized, system-generated writes. */
export async function createNotificationInTx(
  tx: EnterpriseTx,
  organizationKey: string,
  input: {
    recipientId: string; category: string; priority: string; title: string; body: string;
    deepLink?: string; sourceAlertId?: string; sourceEntityType?: string; sourceEntityId?: string;
  },
) {
  return tx.founderNotification.create({
    data: {
      organizationKey, recipientId: input.recipientId, category: input.category, priority: input.priority,
      title: input.title, body: input.body, deepLink: input.deepLink, sourceAlertId: input.sourceAlertId,
      sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId,
    },
  });
}

export async function listMyNotifications(input: unknown = {}) {
  const params = pageInput.parse(input);
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_NOTIFICATIONS_VIEW);
  return enterpriseTransaction(async (tx) => {
    const where = { organizationKey: principal.organizationKey, recipientId: principal.id };
    const [total, unread, items] = await Promise.all([
      tx.founderNotification.count({ where }),
      tx.founderNotification.count({ where: { ...where, readAt: null } }),
      tx.founderNotification.findMany({
        where, orderBy: [{ createdAt: "desc" }], skip: (params.page - 1) * params.pageSize, take: params.pageSize,
      }),
    ]);
    return { items, total, unread, page: params.page, pageSize: params.pageSize };
  });
}

export async function markNotificationRead(notificationId: string) {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_NOTIFICATIONS_MANAGE);
  return enterpriseTransaction(async (tx) => {
    const notification = await tx.founderNotification.findFirst({ where: { id: notificationId, organizationKey: principal.organizationKey, recipientId: principal.id } });
    if (!notification) throw new NotFoundError("Notification");
    if (notification.readAt) return notification;
    return tx.founderNotification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  });
}

export async function markAllNotificationsRead() {
  const principal = await requireFounderOsPrincipal(PERMISSIONS.FOUNDER_OS_NOTIFICATIONS_MANAGE);
  return enterpriseTransaction((tx) => tx.founderNotification.updateMany({
    where: { organizationKey: principal.organizationKey, recipientId: principal.id, readAt: null },
    data: { readAt: new Date() },
  }));
}
