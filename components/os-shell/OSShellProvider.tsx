"use client";

import type { ReactNode } from "react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";
import { WorkspaceContextProvider } from "@/lib/os-shell/workspace-context";
import type { CurrentUser } from "@/lib/os-shell/current-user";
import { Sidebar } from "./Sidebar/Sidebar";
import { Drawer } from "./primitives/Drawer";
import { Header } from "./Header/Header";
import { CommandPalette } from "./Header/CommandPalette";
import { AIPanel } from "./AIPanel/AIPanel";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Component Hierarchy
 * (Global Layout Specification §9). The single place Sidebar, Header,
 * Workspace (passed as `children`), AI Panel, and the Command Palette
 * overlay are assembled — mirrors `EnterpriseShell.tsx`'s own role for the
 * existing shell, kept as a fully separate component per the isolation
 * boundary this initiative has held since the Specification was approved.
 *
 * `data-theme` (Theme & Design System Integration) is applied on this
 * component's own root element only — never `<html>`/`<body>` — so it can
 * never affect the live storefront or any EnterpriseShell-based page.
 *
 * Milestone 2 correction: `navEntries` used to be resolved once in
 * `app/os/layout.tsx` (a Server Component) and threaded down as a prop.
 * That worked while `getNavRegistry()` returned `[]` (Milestone 1), but
 * breaks the moment real entries exist — a `NavManifestEntry.icon` is a
 * React component (a function), and functions cannot cross the
 * Server→Client prop boundary ("Only plain objects can be passed to
 * Client Components from Server Components"). Fixed by having each client
 * component that needs the registry (`Sidebar`, `Header`, `CommandPalette`)
 * call the same synchronous, in-memory `getNavRegistry()` directly instead
 * — no serialization ever needed, since it never crosses the boundary.
 */
export function OSShellProvider({
  brand,
  homeHref,
  homeLabel,
  grantedPermissions,
  user,
  logoutAction,
  children,
}: {
  brand: ReactNode;
  homeHref: string;
  homeLabel: string;
  grantedPermissions: ReadonlySet<string>;
  user: CurrentUser;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const theme = useOSShellStore((s) => s.theme);
  const mobileNavOpen = useOSShellStore((s) => s.mobileNavOpen);
  const closeMobileNav = useOSShellStore((s) => s.closeMobileNav);
  const openCommandPalette = useOSShellStore((s) => s.openCommandPalette);

  return (
    <div data-theme={theme === "light" ? "light" : undefined} className="muv-os-shell flex min-h-screen" style={{ background: "var(--surface)" }}>
      <WorkspaceContextProvider>
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col" style={{ borderRight: "1px solid var(--card-border)" }}>
          {brand}
          <Sidebar grantedPermissions={grantedPermissions} />
        </aside>

        {/* Mobile drawer */}
        <Drawer open={mobileNavOpen} onClose={closeMobileNav} label="Navigation">
          {brand}
          <Sidebar grantedPermissions={grantedPermissions} onNavigate={closeMobileNav} />
        </Drawer>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            homeHref={homeHref}
            homeLabel={homeLabel}
            user={user}
            onOpenCommandPalette={openCommandPalette}
            logoutAction={logoutAction}
          />
          <div className="flex min-h-0 flex-1">
            {children}
            <AIPanel />
          </div>
        </div>

        <CommandPalette />
      </WorkspaceContextProvider>
    </div>
  );
}
