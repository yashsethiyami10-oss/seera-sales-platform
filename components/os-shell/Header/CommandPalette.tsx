"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";
import { useGlobalShortcut } from "@/lib/os-shell/keyboard-shortcuts";
import { getGlobalCommands, type Command } from "@/components/os-shell/registry/commands";
import { getSearchProviders, type SearchResultItem } from "@/components/os-shell/registry/search";
import { isSafeInternalPath } from "@/lib/auth/safe-path";
import { getNavRegistry } from "@/components/os-shell/registry/navigation";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1). Serves two of this
 * milestone's deliverables through one surface, per Global Layout
 * Specification §6's own explicit decision: "Global Search trigger...
 * opens the Command Palette" — one entry point, not two competing ones.
 *
 * Three result groups, each real and wired (not stubbed): Commands (from
 * `registry/commands.ts` — real, Shell-owned entries), "Go to" (a live
 * filter over the Navigation registry), and Results (from
 * `registry/search.ts`'s provider architecture — genuinely wired end to
 * end, currently always empty because zero App search providers are
 * registered, not because the wiring is incomplete).
 *
 * Milestone 2: calls `getNavRegistry()` directly rather than receiving it
 * as a prop — see OSShellProvider.tsx's note on why (icons can't cross
 * the Server→Client prop boundary).
 */
export function CommandPalette() {
  const open = useOSShellStore((s) => s.commandPaletteOpen);
  const openPalette = useOSShellStore((s) => s.openCommandPalette);
  const closePalette = useOSShellStore((s) => s.closeCommandPalette);
  const navEntries = useMemo(() => getNavRegistry(), []);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useGlobalShortcut("shell", "Mod+K", () => openPalette());

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePalette();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePalette]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    Promise.all(getSearchProviders().map((provider) => provider.search(q))).then((lists) => {
      if (!cancelled) setSearchResults(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const commandResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const commands = getGlobalCommands();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [query]);

  const navResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return navEntries.filter((e) => e.placement !== "hidden" && e.label.toLowerCase().includes(q)).slice(0, 5);
  }, [query, navEntries]);

  if (!open) return null;

  function runCommand(command: Command) {
    command.run();
    closePalette();
  }

  function goTo(href: string) {
    router.push(href);
    closePalette();
  }

  const hasResults = commandResults.length > 0 || navResults.length > 0 || searchResults.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" onClick={closePalette}>
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg rounded-2xl shadow-lg"
        style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <label className="muv-os-field-wrap flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <Search size={15} style={{ color: "rgba(var(--text-rgb),0.45)" }} aria-hidden="true" />
          <span className="sr-only">Search commands and destinations</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands and destinations…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "rgba(var(--text-rgb),0.9)" }}
          />
        </label>
        <div className="max-h-80 overflow-y-auto p-2">
          {!hasResults ? (
            <p className="px-3 py-6 text-center text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
              No matches.
            </p>
          ) : (
            <>
              {commandResults.length > 0 && (
                <ResultGroup label="Commands">
                  {commandResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => runCommand(c)}
                      className="muv-os-interactive flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left"
                      style={{ color: "rgba(var(--text-rgb),0.85)" }}
                    >
                      {c.label}
                      {c.shortcut && <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>{c.shortcut}</span>}
                    </button>
                  ))}
                </ResultGroup>
              )}
              {navResults.length > 0 && (
                <ResultGroup label="Go to">
                  {navResults.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => goTo(entry.href)}
                        className="muv-os-interactive flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left"
                        style={{ color: "rgba(var(--text-rgb),0.85)" }}
                      >
                        <Icon size={15} aria-hidden="true" />
                        {entry.label}
                      </button>
                    );
                  })}
                </ResultGroup>
              )}
              {searchResults.length > 0 && (
                <ResultGroup label="Results">
                  {searchResults
                    .filter((r) => isSafeInternalPath(r.href))
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => goTo(r.href)}
                        className="muv-os-interactive flex w-full flex-col items-start rounded-lg px-3 py-2 text-sm text-left"
                        style={{ color: "rgba(var(--text-rgb),0.85)" }}
                      >
                        <span>{r.title}</span>
                        {r.subtitle && (
                          <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
                            {r.subtitle}
                          </span>
                        )}
                      </button>
                    ))}
                </ResultGroup>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-[10px] uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.4)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}
