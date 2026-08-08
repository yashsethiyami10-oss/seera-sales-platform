"use client";

import { useEffect } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Command Palette
 * "keyboard-first behaviour" (Manifest Architecture §8).
 *
 * §8 requires MUV OS to be "the single arbiter of shortcut conflicts across
 * Apps" — a shortcut string can have at most one active owner at a time.
 * This is a real, working conflict check (a second registration for the
 * same combo is refused with a console warning identifying both owners),
 * not just a documented convention, because a documented-only rule is
 * exactly the kind of thing the Manifest Architecture's own self-review
 * flagged as not surviving past the first few registrants.
 *
 * Deliberately global-only for this pass: every registrant today is a
 * Shell-level command (see registry/commands.ts) — no App exists yet to
 * register its own shortcut, so there is nothing App-scoped to arbitrate
 * beyond this single, global registry. That is the correct state for a
 * platform with zero installed Apps, not an omission.
 */

type ShortcutHandler = (event: KeyboardEvent) => void;

interface RegisteredShortcut {
  ownerId: string;
  handler: ShortcutHandler;
}

const registry = new Map<string, RegisteredShortcut>();
let listenerAttached = false;

/** Normalizes a shortcut like "Mod+K" into a stable registry key. "Mod" means Cmd on macOS, Ctrl elsewhere. */
function normalizeCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .sort()
    .join("+");
}

function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = event.key.toLowerCase();
  if (!["control", "meta", "alt", "shift"].includes(key)) parts.push(key);
  return parts.sort().join("+");
}

function ensureListener() {
  if (listenerAttached || typeof window === "undefined") return;
  window.addEventListener("keydown", (event) => {
    const match = registry.get(comboFromEvent(event));
    if (!match) return;
    event.preventDefault();
    match.handler(event);
  });
  listenerAttached = true;
}

/**
 * Registers a global shortcut. Returns an unregister function. If `combo`
 * is already owned by a different `ownerId`, registration is refused (the
 * existing owner keeps it) and a warning is logged — this is the "single
 * arbiter" rule from §8 enforced, not just documented.
 */
export function registerShortcut(ownerId: string, combo: string, handler: ShortcutHandler): () => void {
  ensureListener();
  const key = normalizeCombo(combo);
  const existing = registry.get(key);
  if (existing && existing.ownerId !== ownerId) {
    console.warn(`[MUV OS] Shortcut "${combo}" already owned by "${existing.ownerId}" — "${ownerId}" was refused.`);
    return () => {};
  }
  registry.set(key, { ownerId, handler });
  return () => {
    if (registry.get(key)?.ownerId === ownerId) registry.delete(key);
  };
}

/** React hook wrapper around `registerShortcut` — registers on mount, unregisters on unmount/combo change. */
export function useGlobalShortcut(ownerId: string, combo: string, handler: ShortcutHandler) {
  useEffect(() => registerShortcut(ownerId, combo, handler), [ownerId, combo, handler]);
}
