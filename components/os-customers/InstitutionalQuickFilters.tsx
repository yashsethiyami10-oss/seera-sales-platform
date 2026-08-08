import Link from "next/link";

/**
 * MUV OS™ — Milestone 2 refinement, "Institutional Quick Filters" — one
 * click per Institution Category. Rendered only when the Institutional
 * customer type is the active filter (see app/os/customers/page.tsx),
 * matching the requirement's own framing ("Inside Institutional
 * Customers..."). Plain links for the same reason as the summary cards:
 * instant, server-rendered, no client JS required.
 */
export function InstitutionalQuickFilters({
  categories,
  currentParams,
}: {
  categories: { id: string; name: string }[];
  currentParams: Record<string, string | undefined>;
}) {
  function hrefFor(categoryId?: string): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (key === "institutionCategoryId" || key === "page") continue;
      if (value) next.set(key, value);
    }
    if (categoryId) next.set("institutionCategoryId", categoryId);
    return `/os/customers?${next.toString()}`;
  }

  const current = currentParams.institutionCategoryId;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Institution category quick filters">
      <Link
        href={hrefFor(undefined)}
        aria-pressed={!current}
        className="muv-os-chip rounded-full px-3 py-1 text-xs"
        style={{ border: "1px solid var(--card-border)", color: !current ? "var(--lavender)" : "rgba(var(--text-rgb),0.6)" }}
      >
        All
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={hrefFor(c.id)}
          aria-pressed={current === c.id}
          className="muv-os-chip rounded-full px-3 py-1 text-xs"
          style={{ border: "1px solid var(--card-border)", color: current === c.id ? "var(--lavender)" : "rgba(var(--text-rgb),0.6)" }}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
