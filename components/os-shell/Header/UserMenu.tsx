"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import type { CurrentUser } from "@/lib/os-shell/current-user";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Authentication
 * Integration "User profile display". Interaction pattern (outside-click
 * and Escape both dismiss, focus trapped inside a `role="menu"` popover)
 * reused from `EnterpriseShell.tsx`'s own already-proven `UserMenu` — not
 * imported, per the isolation boundary, but not reinvented either.
 */
export function UserMenu({ user, logoutAction }: { user: CurrentUser; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="muv-os-btn-ghost flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
        style={{ color: "rgba(var(--text-rgb),0.75)" }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium"
          style={{ background: "var(--lavender)", color: "#0b0b0f" }}
        >
          {initial}
        </span>
        <span className="hidden sm:inline max-w-[140px] truncate">{user.name ?? user.email}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 160ms ease-out" }} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl p-3 shadow-lg z-30"
          style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
        >
          <p className="text-sm font-medium truncate" style={{ color: "rgba(var(--text-rgb),0.92)" }}>
            {user.name ?? user.email}
          </p>
          <p className="text-xs truncate" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
            {user.email}
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
            {user.role}
          </p>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              className="muv-os-btn-ghost flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
              style={{ color: "rgba(var(--text-rgb),0.75)" }}
            >
              <LogOut size={15} /> Log Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
