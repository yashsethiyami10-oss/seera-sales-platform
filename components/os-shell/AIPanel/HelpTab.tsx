import { HelpCircle } from "lucide-react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), AI Panel Foundation.
 * Context-aware help is App-sourced (Manifest Architecture §6) — scoped to
 * whatever module is open, not a generic help search. Empty today for the
 * same reason every other tab is.
 */
export function HelpTab() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <HelpCircle size={22} style={{ color: "rgba(var(--text-rgb),0.3)" }} aria-hidden="true" />
      <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
        No help content is available here yet.
      </p>
    </div>
  );
}
