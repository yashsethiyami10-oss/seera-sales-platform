"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Navigation System
 * "Collapsible sections". Expand/collapse is local, per-section state —
 * with zero real nav groups registered yet (see `registry/navigation.ts`),
 * there is nothing real to persist a collapsed preference for today; that
 * is a reasonable, explicitly-deferred addition once real groups exist,
 * not an oversight.
 */
export function SidebarSection({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);

  if (collapsed) return <div className="flex flex-col gap-1">{children}</div>;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="muv-os-btn-ghost flex items-center justify-between px-3 py-1 text-xs font-medium uppercase tracking-wide"
        style={{ color: "rgba(var(--text-rgb),0.45)" }}
      >
        {label}
        <ChevronDown size={13} style={{ transform: expanded ? undefined : "rotate(-90deg)", transition: "transform 160ms ease-out" }} />
      </button>
      {expanded && <div className="flex flex-col gap-1">{children}</div>}
    </div>
  );
}
