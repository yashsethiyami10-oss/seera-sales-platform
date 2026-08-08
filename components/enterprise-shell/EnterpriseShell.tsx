"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronRight, ChevronDown, LogOut } from "lucide-react";

/**
 * MUV Enterprise UI — Stage 2 (Unified Enterprise Shell).
 *
 * One shared structural/behavioral shell for /admin, /dashboard, /sales,
 * and /enterprise — sidebar, responsive drawer, breadcrumbs, and user menu
 * all behave identically everywhere. Deliberately NOT a shared visual skin:
 * `variant` swaps the actual color classes/tokens so admin keeps its
 * existing CSS-variable-driven identity and dashboard/sales/enterprise keep
 * their existing zinc dark theme exactly as they were — Stage 2's brief is
 * consistency of behavior, not a new design language. Brand markup is
 * passed in as a prop (not parametrized) for the same reason: each surface's
 * existing header block is reused pixel-for-pixel rather than reconstructed
 * from generic props.
 */

export type ShellNavItem = { href: string; label: string; icon: ReactNode };

type Variant = "admin" | "ops";

const VARIANT_CLASSES: Record<Variant, {
  sidebar: string;
  sidebarStyle?: React.CSSProperties;
  border: string;
  navLink: string;
  navLinkActive: string;
  navLinkActiveStyle?: React.CSSProperties;
  topbar: string;
  crumbMuted: string;
  crumbCurrent: string;
  userButton: string;
  userPopover: string;
  userPopoverStyle?: React.CSSProperties;
}> = {
  admin: {
    sidebar: "flex flex-col w-56 flex-shrink-0",
    sidebarStyle: { background: "var(--surface)" },
    border: "var(--card-border)",
    navLink: "flex items-center gap-3 px-3.5 py-2.5 rounded-xl muv-text-body hover:text-white text-sm transition-colors",
    navLinkActive: "text-white",
    navLinkActiveStyle: { background: "var(--card-fill)" },
    topbar: "flex items-center justify-between px-4 py-3 lg:px-6",
    crumbMuted: "muv-text-faint",
    crumbCurrent: "muv-text-body",
    userButton: "flex items-center gap-2 px-2 py-1.5 rounded-lg muv-text-body hover:text-white text-sm transition-colors",
    userPopover: "muv-text-body",
    userPopoverStyle: { background: "var(--surface)", border: "1px solid var(--card-border)" },
  },
  ops: {
    sidebar: "flex flex-col w-60 flex-shrink-0 bg-zinc-900",
    border: "rgba(255,255,255,0.1)",
    navLink: "flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors",
    navLinkActive: "bg-white/5 text-white",
    topbar: "flex items-center justify-between px-4 py-3 lg:px-6 bg-zinc-950/95",
    crumbMuted: "text-zinc-500",
    crumbCurrent: "text-zinc-300",
    userButton: "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors",
    userPopover: "text-zinc-300 bg-zinc-900",
    userPopoverStyle: { border: "1px solid rgba(255,255,255,0.1)" },
  },
};

function humanize(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Breadcrumbs({ variant, homeHref, homeLabel, navItems }: {
  variant: Variant; homeHref: string; homeLabel: string; navItems: ShellNavItem[];
}) {
  const pathname = usePathname();
  const c = VARIANT_CLASSES[variant];
  const matched = navItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const trail: { label: string; href?: string }[] = [{ label: homeLabel, href: homeHref }];
  if (matched && matched.href !== homeHref) {
    trail.push({ label: matched.label, href: matched.href });
    const rest = pathname.slice(matched.href.length).split("/").filter(Boolean);
    rest.forEach((segment) => trail.push({ label: humanize(segment) }));
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight size={13} className={c.crumbMuted} />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className={`${c.crumbMuted} hover:underline truncate`}>{crumb.label}</Link>
            ) : (
              <span className={`${isLast ? c.crumbCurrent : c.crumbMuted} truncate`}>{crumb.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function UserMenu({ variant, user, logoutAction }: {
  variant: Variant;
  user: { name: string | null; email: string; roleLabel: string };
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = VARIANT_CLASSES[variant];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Enterprise UI Integration — Responsive/accessibility validation pass:
  // the drawer already closed on Escape, but this popover didn't (only
  // outside-click did). Escape should dismiss any open overlay.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={c.userButton} aria-expanded={open} aria-haspopup="menu">
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{initial}</span>
        <span className="hidden sm:inline max-w-[140px] truncate">{user.name ?? user.email}</span>
        <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 top-full mt-2 w-64 rounded-xl p-3 shadow-lg z-30 ${c.userPopover}`} style={c.userPopoverStyle}>
          <p className="text-sm font-medium truncate">{user.name ?? user.email}</p>
          <p className={`text-xs truncate ${c.crumbMuted}`}>{user.email}</p>
          <p className={`text-xs mt-1 ${c.crumbMuted}`}>{user.roleLabel}</p>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className={`${c.navLink} w-full !px-2 !py-1.5`}>
              <LogOut size={15} /> Log Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function EnterpriseShell({
  variant, brand, homeHref, homeLabel, navItems, crossLink, user, logoutAction, children,
}: {
  variant: Variant;
  brand: ReactNode;
  homeHref: string;
  homeLabel: string;
  navItems: ShellNavItem[];
  crossLink?: { href: string; label: string };
  user: { name: string | null; email: string; roleLabel: string };
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const c = VARIANT_CLASSES[variant];
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setDrawerOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const navList = (
    <nav className="flex flex-col gap-1 p-2 flex-1 min-h-0 overflow-y-auto" aria-label="Primary">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${c.navLink} ${isActive(item.href) ? c.navLinkActive : ""}`}
          style={isActive(item.href) ? c.navLinkActiveStyle : undefined}
        >
          {item.icon} {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex ${c.sidebar}`} style={{ ...c.sidebarStyle, borderRight: `1px solid ${c.border}` }}>
        {brand}
        {navList}
      </aside>

      {/* Mobile drawer */}
      <aside
        role="dialog"
        aria-modal={drawerOpen}
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] lg:hidden transition-transform duration-300 ${c.sidebar} ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ ...c.sidebarStyle, borderRight: `1px solid ${c.border}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">{brand}</div>
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="mr-3 p-1">
            <X size={18} className={c.crumbMuted} />
          </button>
        </div>
        {navList}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={c.topbar} style={{ borderBottom: `1px solid ${c.border}` }}>
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="lg:hidden p-1 -ml-1">
              <Menu size={20} className={c.crumbCurrent} />
            </button>
            <Breadcrumbs variant={variant} homeHref={homeHref} homeLabel={homeLabel} navItems={navItems} />
          </div>
          <div className="flex items-center gap-4">
            {crossLink && (
              <Link href={crossLink.href} className={`hidden sm:inline text-sm ${c.crumbMuted} hover:underline`}>{crossLink.label}</Link>
            )}
            <UserMenu variant={variant} user={user} logoutAction={logoutAction} />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
