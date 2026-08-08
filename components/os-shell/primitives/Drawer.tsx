"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Shared Platform
 * Component (Global Layout Specification §9).
 *
 * A generic slide-in overlay — used today for the Sidebar's mobile drawer
 * (§4). No standalone reusable Drawer exists elsewhere in this codebase to
 * import (`components/enterprise-shell/EnterpriseShell.tsx` has the same
 * interaction inlined, not extracted), and that component is explicitly
 * off-limits to import from per the isolation boundary — so this is a new
 * component, built to the same proven interaction contract (backdrop click
 * to close, Escape to close, focus returns to the trigger on close) rather
 * than a copied one.
 */
export function Drawer({
  open,
  onClose,
  side = "left",
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  label: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerFocusRef.current = document.activeElement;
      panelRef.current?.focus();
    } else {
      (triggerFocusRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`fixed inset-y-0 ${side === "left" ? "left-0" : "right-0"} z-10 w-72 max-w-[85vw] outline-none`}
        style={{ background: "var(--surface)", borderRight: side === "left" ? "1px solid var(--card-border)" : undefined, borderLeft: side === "right" ? "1px solid var(--card-border)" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
