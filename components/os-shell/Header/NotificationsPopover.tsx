"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getNotificationProviders, type PlatformNotification } from "@/components/os-shell/registry/notifications";
import { isSafeInternalPath } from "@/lib/auth/safe-path";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Notification Center
 * (Manifest Architecture §7).
 *
 * Read/unread state is real, working local state — toggled on click, ready
 * to hold real notifications the moment a provider exists. It is
 * genuinely empty today (`getNotificationProviders()` returns nothing —
 * see that file) because MUV OS's Notification Center is a pure aggregator
 * per §7: it is not allowed to originate a notification itself, and no App
 * exists yet to originate one either.
 *
 * Deep-links are re-validated with `isSafeInternalPath` (the same
 * open-redirect guard `lib/auth/redirect-policy.ts` already uses) before
 * being rendered as a real link — §7's "must never link somewhere the
 * recipient cannot actually open" is enforced here, not just documented.
 */
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(getNotificationProviders().map((provider) => provider.list())).then((lists) => {
      if (!cancelled) setNotifications(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="muv-os-btn-ghost relative flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ color: "rgba(var(--text-rgb),0.65)" }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-medium"
            style={{ background: "var(--lavender)", color: "#0b0b0f" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 rounded-xl p-2 shadow-lg z-30"
          style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
        >
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
              No notifications yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={isSafeInternalPath(n.href) ? n.href : "#"}
                    onClick={() => markRead(n.id)}
                    className="muv-os-interactive block rounded-lg px-3 py-2 text-sm"
                    style={{
                      color: "rgba(var(--text-rgb),0.85)",
                      ...(!n.read ? ({ "--muv-os-bg": "rgba(var(--lavender-rgb),0.08)" } as React.CSSProperties) : {}),
                    }}
                  >
                    <p className="font-medium truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs truncate" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
                        {n.body}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
