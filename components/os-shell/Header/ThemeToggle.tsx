"use client";

import { Moon, Sun } from "lucide-react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Theme & Design System
 * Integration.
 *
 * `styles/globals.css` already defines a complete `[data-theme="light"]`
 * token override block (Phase 5 Design System) — its own comment there
 * notes it is "currently unused" because nothing in the app has ever set
 * that attribute. This is the first real toggle for it. Scoped to the OS
 * Shell's own root container only (see `OSShellProvider.tsx`, which reads
 * this store value and applies `data-theme`) — not `<html>`/`<body>` —
 * so it cannot affect the live storefront or EnterpriseShell-based pages,
 * consistent with this initiative's isolation boundary.
 */
export function ThemeToggle() {
  const theme = useOSShellStore((s) => s.theme);
  const toggleTheme = useOSShellStore((s) => s.toggleTheme);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="muv-os-btn-ghost flex h-8 w-8 items-center justify-center rounded-lg"
      style={{ color: "rgba(var(--text-rgb),0.65)" }}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
