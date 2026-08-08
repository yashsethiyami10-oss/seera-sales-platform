import type { ReactNode } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Workspace Specification
 * (Global Layout Specification §7).
 *
 * The one layout primitive every future content pattern (Dashboard, Form,
 * Table, Kanban, Timeline, Analytics, Map, AI conversation) renders inside,
 * without the Shell ever needing to know which one it is — this component
 * owns nothing but the scrollable body region itself. `PageHeader` and
 * `StickyActionBar` are separate, optional siblings a page composes
 * alongside this, not sub-parts this component renders itself.
 */
export function Workspace({ children }: { children: ReactNode }) {
  return <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>;
}
