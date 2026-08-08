import type { ReactNode } from "react";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Workspace Specification
 * §7: "title, breadcrumb continuation, primary/secondary actions". Distinct
 * from `primitives/SectionHeader.tsx` by role, not just size — this is the
 * one page-level heading a Workspace page renders once; SectionHeader is
 * for repeated, smaller groupings within a page (Sidebar sections, card
 * groups).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
