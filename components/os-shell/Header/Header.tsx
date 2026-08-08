"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ChevronRight, Search, Sparkles } from "lucide-react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";
import { getNavRegistry } from "@/components/os-shell/registry/navigation";
import type { CurrentUser } from "@/lib/os-shell/current-user";
import { UserMenu } from "./UserMenu";
import { CompanySwitcher } from "./CompanySwitcher";
import { NotificationsPopover } from "./NotificationsPopover";
import { ThemeToggle } from "./ThemeToggle";
import { ConnectionStatus } from "./ConnectionStatus";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Header Specification
 * (Global Layout Specification §6). Breadcrumb rendering is inlined here
 * (a local, non-exported component) rather than its own file — the
 * approved folder structure never named a separate Breadcrumb file, and
 * `EnterpriseShell.tsx`'s own proven Breadcrumbs are inlined the same way.
 *
 * Approvals and Tasks popovers, named in the original Specification's
 * Header sketch, are deliberately not built here — Milestone 1's own scope
 * list names only "Notification Center", and building them now would be
 * speculative (there is no App yet to produce an approval or a task).
 * Recorded as a deferred item in this milestone's report.
 *
 * Milestone 2: calls `getNavRegistry()` directly for the breadcrumb rather
 * than receiving it as a prop — see OSShellProvider.tsx's note on why.
 */
export function Header({
  homeHref,
  homeLabel,
  user,
  onOpenCommandPalette,
  logoutAction,
}: {
  homeHref: string;
  homeLabel: string;
  user: CurrentUser;
  onOpenCommandPalette: () => void;
  logoutAction: () => Promise<void>;
}) {
  const openMobileNav = useOSShellStore((s) => s.openMobileNav);
  const toggleAIPanel = useOSShellStore((s) => s.toggleAIPanel);

  return (
    <header
      className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6"
      style={{ borderBottom: "1px solid var(--card-border)", height: 56 }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={openMobileNav}
          aria-label="Open navigation"
          className="muv-os-btn-ghost lg:hidden p-1 -ml-1"
          style={{ color: "rgba(var(--text-rgb),0.75)" }}
        >
          <Menu size={20} />
        </button>
        <Breadcrumb homeHref={homeHref} homeLabel={homeLabel} />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open search and commands"
          className="muv-os-interactive hidden sm:flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
          style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.5)" }}
        >
          <Search size={13} />
          Search
          <span className="ml-2 rounded px-1" style={{ border: "1px solid var(--card-border)" }}>
            ⌘K
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open search and commands"
          className="muv-os-btn-ghost sm:hidden flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ color: "rgba(var(--text-rgb),0.65)" }}
        >
          <Search size={16} />
        </button>

        <button
          type="button"
          onClick={toggleAIPanel}
          aria-label="Open AI panel"
          className="muv-os-btn-ghost flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ color: "var(--lavender)" }}
        >
          <Sparkles size={16} />
        </button>

        <NotificationsPopover />
        <ThemeToggle />
        <ConnectionStatus />
        <CompanySwitcher />
        <UserMenu user={user} logoutAction={logoutAction} />
      </div>
    </header>
  );
}

function humanize(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Breadcrumb({
  homeHref,
  homeLabel,
}: {
  homeHref: string;
  homeLabel: string;
}) {
  const pathname = usePathname();
  const navEntries = getNavRegistry();
  const matched = navEntries
    .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const trail: { label: string; href?: string }[] = [{ label: homeLabel, href: homeHref }];
  if (matched && matched.href !== homeHref) {
    trail.push({ label: matched.label, href: matched.href });
    pathname
      .slice(matched.href.length)
      .split("/")
      .filter(Boolean)
      .forEach((segment) => trail.push({ label: humanize(segment) }));
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={13} style={{ color: "rgba(var(--text-rgb),0.35)" }} />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="truncate hover:underline" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate" style={{ color: isLast ? "rgba(var(--text-rgb),0.85)" : "rgba(var(--text-rgb),0.5)" }}>
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
