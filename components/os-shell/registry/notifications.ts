import type { AppId } from "./types";
import { getInstSalesNotifications } from "@/actions/inst-notifications";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Notification
 * Registration Model (Manifest Architecture §7).
 *
 * `priority` is a fixed, shared enum rather than a free-form value — §7 is
 * explicit that this is required so the Notification Center's rendering
 * rules (badge treatment, whether it interrupts) stay predictable across
 * every App's notifications, not just this one platform's.
 */
export type NotificationPriority = "informational" | "actionable" | "urgent";

export interface PlatformNotification {
  id: string;
  ownerAppId: AppId;
  /** Namespaced, e.g. a future "sales.quotation.approved" (§7). */
  type: string;
  priority: NotificationPriority;
  title: string;
  body?: string;
  /** Must be a safe, internal path. A notification whose target has since become inaccessible degrades to an unavailable state in the UI rather than erroring (§7). */
  href: string;
  createdAt: string;
  read: boolean;
}

/**
 * Every registered App's notification source. Empty today, for the same
 * reason `registry/navigation.ts` and `registry/search.ts` are empty: the
 * platform's read/unread state management and rendering are real and
 * working (see `lib/os-shell/use-os-shell-store.ts`'s sibling concerns and
 * the Header's NotificationsPopover), but there is no App yet to actually
 * originate a notification. MUV OS's Notification Center is documented in
 * §7 as a pure aggregator — it must never originate one itself, which this
 * empty registry is a direct expression of, not a gap.
 */
export interface NotificationProvider {
  ownerAppId: AppId;
  list: () => Promise<PlatformNotification[]>;
}

export function getNotificationProviders(): readonly NotificationProvider[] {
  return [
    // Milestone 3 — Institutional Sales OS. The first real provider this
    // registry has had — `list` is a Server Action (actions/inst-notifications.ts),
    // not a plain function, so the client-side NotificationsPopover can call
    // it without any Prisma/auth code entering the client bundle.
    { ownerAppId: "inst-sales" as AppId, list: getInstSalesNotifications },
  ];
}
