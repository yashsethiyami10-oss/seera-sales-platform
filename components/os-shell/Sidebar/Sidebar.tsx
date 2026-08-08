"use client";

import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";
import { filterNavByPermission } from "@/lib/os-shell/nav-permission-filter";
import { getNavRegistry, type NavManifestEntry } from "@/components/os-shell/registry/navigation";
import { SidebarSearch } from "./SidebarSearch";
import { SidebarSection } from "./SidebarSection";
import { NavItem } from "./NavItem";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Sidebar Specification
 * (Global Layout Specification §5). Composes search + permission/search
 * filtering + grouped nav rendering + the collapse toggle. Deliberately
 * container-agnostic (no fixed/aside positioning here) — the composing
 * shell renders this once inside a desktop `<aside>` and once inside the
 * mobile `Drawer`, the same "build the content once, place it twice"
 * approach already proven in `EnterpriseShell.tsx`.
 *
 * Must render sensibly against an empty registry — every real App is out
 * of scope for this milestone, so that is the actual, expected state
 * today, not a loading placeholder.
 *
 * Milestone 2: calls `getNavRegistry()` directly rather than receiving it
 * as a prop from a Server Component — see OSShellProvider.tsx's note on
 * why (icon components can't cross the Server→Client prop boundary).
 */
export function Sidebar({
  grantedPermissions,
  onNavigate,
}: {
  grantedPermissions: ReadonlySet<string>;
  onNavigate?: () => void;
}) {
  const collapsed = useOSShellStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useOSShellStore((s) => s.toggleSidebar);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => getNavRegistry(), []);

  const visible = useMemo(() => {
    const byPermission = filterNavByPermission(entries, grantedPermissions).filter((e) => e.placement !== "hidden");
    const q = query.trim().toLowerCase();
    return q ? byPermission.filter((e) => e.label.toLowerCase().includes(q)) : byPermission;
  }, [entries, grantedPermissions, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, NavManifestEntry[]>();
    for (const entry of [...visible].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const key = entry.group ?? "";
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return groups;
  }, [visible]);

  return (
    <div className="flex flex-col h-full py-3">
      {!collapsed && (
        <div className="mb-3">
          <SidebarSearch value={query} onChange={setQuery} />
        </div>
      )}

      <nav aria-label="Primary" className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-2">
        {grouped.size === 0 ? (
          !collapsed && (
            <p className="px-3 py-6 text-xs text-center" style={{ color: "rgba(var(--text-rgb),0.4)" }}>
              No applications installed yet.
            </p>
          )
        ) : (
          [...grouped.entries()].map(([group, groupEntries]) => (
            <SidebarSection key={group || "_ungrouped"} label={group || "General"} collapsed={collapsed}>
              {groupEntries.map((entry) => (
                <NavItem key={entry.id} entry={entry} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </SidebarSection>
          ))
        )}
      </nav>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="muv-os-btn-ghost mx-2 mt-2 hidden lg:flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ color: "rgba(var(--text-rgb),0.5)" }}
      >
        {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        {!collapsed && "Collapse"}
      </button>
    </div>
  );
}
