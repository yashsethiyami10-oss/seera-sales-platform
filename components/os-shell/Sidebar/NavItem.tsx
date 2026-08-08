"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavManifestEntry } from "@/components/os-shell/registry/navigation";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Navigation System
 * "Active state". Same prefix-match rule already proven in
 * `components/enterprise-shell/EnterpriseShell.tsx`'s own `isActive`
 * (`pathname === href || pathname.startsWith(href + "/")`) — reused as a
 * pattern, not imported, per the isolation boundary.
 */
export function NavItem({ entry, collapsed, onNavigate }: { entry: NavManifestEntry; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  const Icon = entry.icon;

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? entry.label : undefined}
      className="muv-os-interactive flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm"
      style={{
        color: isActive ? "var(--lavender)" : "rgba(var(--text-rgb),0.75)",
        ...(isActive ? ({ "--muv-os-bg": "rgba(var(--lavender-rgb),0.12)" } as React.CSSProperties) : {}),
      }}
    >
      <Icon size={17} aria-hidden="true" />
      {!collapsed && <span className="truncate">{entry.label}</span>}
    </Link>
  );
}
