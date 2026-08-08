import type { ReactNode } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Workspace Specification
 * §7: "sticky action bar — save/cancel bars, bulk-action bars". Sticks
 * within whatever scroll container it's placed in (typically `Workspace`),
 * not the viewport — matching §7's own wording exactly.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-3"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--card-border)" }}
    >
      {children}
    </div>
  );
}
