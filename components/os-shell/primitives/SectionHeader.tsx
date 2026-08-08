import type { ReactNode } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Shared Platform
 * Component (Global Layout Specification §9): "title + optional description
 * + right-aligned actions". Used by Sidebar sections and Workspace page
 * headers alike — no existing component in this codebase covers this shape
 * (`components/ui/primitives.tsx` has Card/Badge/Button/Aura/BottleVisual,
 * none of which is this), so this one is genuinely new, not a duplicate.
 */
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium truncate" style={{ color: "rgba(var(--text-rgb),0.92)" }}>
          {title}
        </h2>
        {description && (
          <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
