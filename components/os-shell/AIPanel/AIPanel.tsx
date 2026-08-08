"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useOSShellStore } from "@/lib/os-shell/use-os-shell-store";
import { ChatTab } from "./ChatTab";
import { SummaryTab } from "./SummaryTab";
import { SuggestionsTab } from "./SuggestionsTab";
import { HelpTab } from "./HelpTab";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), AI Panel Foundation
 * (Global Layout Specification §8, Manifest Architecture §6).
 *
 * Four tabs, every one a real, honest empty state — no mock conversation,
 * no fake suggestions. Width comes from the persisted store value; a
 * drag-to-resize handle is deliberately not built in this pass (nothing in
 * Milestone 1's scope names it, and it is real, non-trivial interaction
 * work better done once a real AI response actually needs the extra room)
 * — recorded as a deferred item, not an oversight.
 */
const TABS = [
  { id: "chat", label: "Chat" },
  { id: "summary", label: "Summary" },
  { id: "suggestions", label: "Suggestions" },
  { id: "help", label: "Help" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AIPanel() {
  const open = useOSShellStore((s) => s.aiPanelOpen);
  const width = useOSShellStore((s) => s.aiPanelWidth);
  const toggleAIPanel = useOSShellStore((s) => s.toggleAIPanel);
  const [tab, setTab] = useState<TabId>("chat");

  if (!open) return null;

  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
        <div className="flex gap-1" role="tablist" aria-label="AI panel tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="muv-os-interactive rounded-lg px-2.5 py-1 text-xs"
              style={{
                color: tab === t.id ? "var(--lavender)" : "rgba(var(--text-rgb),0.5)",
                ...(tab === t.id ? ({ "--muv-os-bg": "rgba(var(--lavender-rgb),0.12)" } as React.CSSProperties) : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={toggleAIPanel} aria-label="Close AI panel" className="muv-os-btn-ghost p-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col">
        {tab === "chat" && <ChatTab />}
        {tab === "summary" && <SummaryTab />}
        {tab === "suggestions" && <SuggestionsTab />}
        {tab === "help" && <HelpTab />}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: docked column beside the Workspace (Global Layout Specification §2). */}
      <aside
        className="hidden lg:flex flex-shrink-0 flex-col"
        style={{ width, borderLeft: "1px solid var(--card-border)" }}
        aria-label="AI panel"
      >
        {content}
      </aside>

      {/* Tablet/mobile: full-screen overlay, never a docked column (§3, §4). */}
      <div className="lg:hidden fixed inset-0 z-50 flex flex-col" style={{ background: "var(--surface)" }} aria-label="AI panel" role="dialog" aria-modal="true">
        {content}
      </div>
    </>
  );
}
