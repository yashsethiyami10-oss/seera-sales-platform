import type { AppId } from "./types";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Command Palette
 * Registration Model (Manifest Architecture §8).
 *
 * Unlike the other registries in this milestone, this one is not empty:
 * §8 is explicit that "MUV OS itself owns a small set of shell-level
 * commands... independent of any App" — these three exist today because
 * the Shell itself exists today, regardless of whether any App does.
 * `ownerAppId: null` is how a Shell-owned command is distinguished from a
 * future App-owned one, mirroring the same optional-ownership shape
 * `registry/navigation.ts`'s `NavManifestEntry.ownerModuleId` already uses.
 */
export interface Command {
  id: string;
  /** `null` means owned by MUV OS itself, not any App — see §8 "Global commands". */
  ownerAppId: AppId | null;
  label: string;
  /** e.g. "Mod+K" — "Mod" is Cmd on macOS, Ctrl elsewhere, matching `lib/os-shell/keyboard-shortcuts.ts`'s own convention. */
  shortcut?: string;
  run: () => void;
  /** A declarative reference only, never executed logic — undefined means always available. */
  requiredPermission?: string;
}

export function getGlobalCommands(): readonly Command[] {
  return [
    {
      id: "shell.toggle-theme",
      ownerAppId: null,
      label: "Toggle theme",
      shortcut: "Mod+J",
      run: () => useOSShellStore.getState().toggleTheme(),
    },
    {
      id: "shell.toggle-sidebar",
      ownerAppId: null,
      label: "Toggle sidebar",
      shortcut: "Mod+B",
      run: () => useOSShellStore.getState().toggleSidebar(),
    },
    {
      id: "shell.open-ai-panel",
      ownerAppId: null,
      label: "Open AI Panel",
      shortcut: "Mod+I",
      run: () => useOSShellStore.getState().toggleAIPanel(),
    },
  ];
}
