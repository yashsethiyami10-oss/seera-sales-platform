"use client";

import { Search } from "lucide-react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Sidebar Specification
 * §5: "Sidebar search — filters the nav tree in place, not a separate
 * palette." Purely a controlled input; `Sidebar.tsx` owns the actual filter
 * state and logic (`filterNavByPermission`'s label-matching sibling), so
 * this stays a small, reusable presentational piece.
 */
export function SidebarSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="muv-os-field-wrap flex items-center gap-2 rounded-lg px-3 py-2 mx-2" style={{ border: "1px solid var(--card-border)", transition: "border-color 120ms ease-out, box-shadow 120ms ease-out" }}>
      <Search size={14} style={{ color: "rgba(var(--text-rgb),0.45)" }} aria-hidden="true" />
      <span className="sr-only">Search navigation</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search"
        className="w-full bg-transparent text-sm outline-none"
        style={{ color: "rgba(var(--text-rgb),0.85)" }}
      />
    </label>
  );
}
