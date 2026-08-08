import { MessageCircle } from "lucide-react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), AI Panel Foundation.
 * "No business AI implementation yet" — a real, honest empty state, not a
 * fake conversation. Wiring to an actual AI backend (this codebase's own
 * documented Experience Platform, `docs/phase-8`) is explicitly out of
 * scope for this milestone; see Global Layout Specification §8.
 */
export function ChatTab() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <MessageCircle size={22} style={{ color: "rgba(var(--text-rgb),0.3)" }} aria-hidden="true" />
      <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
        AI conversations aren&apos;t connected yet.
      </p>
    </div>
  );
}
