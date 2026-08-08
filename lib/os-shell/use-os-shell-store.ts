"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), shell UI state.
 *
 * Global Layout Specification §12 named this the one new client-state
 * dependency this initiative introduces (Zustand, over this codebase's
 * existing plain-React-Context precedent in `lib/cart-context.tsx`),
 * specifically because the Shell has several independent, high-frequency UI
 * slices — Sidebar, AI Panel, Command Palette, Theme — that would otherwise
 * cause cross-component re-render storms under one shared Context. Scope is
 * held to exactly that: ephemeral/persisted shell UI state only. No
 * business or server data ever belongs in this store.
 *
 * Persisted fields (sidebar/theme) survive a refresh via localStorage, the
 * same persistence mechanism `lib/cart-context.tsx` already uses elsewhere
 * in this app. Command palette open-state is intentionally NOT persisted —
 * an overlay reopening on page load would be a bug, not a feature.
 */
export interface OSShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  aiPanelOpen: boolean;
  aiPanelWidth: number;
  toggleAIPanel: () => void;
  setAIPanelWidth: (width: number) => void;

  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  /** Mobile drawer (§4) — always closed on load, never persisted, same reasoning as commandPaletteOpen. */
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;

  theme: "light" | "dark";
  toggleTheme: () => void;
}

const MIN_AI_PANEL_WIDTH = 320;
const MAX_AI_PANEL_WIDTH = 480;
const DEFAULT_AI_PANEL_WIDTH = 380;

function clampAIPanelWidth(width: number): number {
  return Math.min(MAX_AI_PANEL_WIDTH, Math.max(MIN_AI_PANEL_WIDTH, width));
}

export const useOSShellStore = create<OSShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      aiPanelOpen: false,
      aiPanelWidth: DEFAULT_AI_PANEL_WIDTH,
      toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
      setAIPanelWidth: (width) => set({ aiPanelWidth: clampAIPanelWidth(width) }),

      // Deliberately not persisted (see excludes in `partialize` below).
      commandPaletteOpen: false,
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),

      mobileNavOpen: false,
      openMobileNav: () => set({ mobileNavOpen: true }),
      closeMobileNav: () => set({ mobileNavOpen: false }),

      theme: "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "muv-os-shell",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        aiPanelOpen: state.aiPanelOpen,
        aiPanelWidth: state.aiPanelWidth,
        theme: state.theme,
      }),
    }
  )
);
