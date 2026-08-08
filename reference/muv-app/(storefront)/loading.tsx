/**
 * Route-level Suspense fallback (Next.js `loading.tsx` convention) — shown
 * while the homepage's server-side Promise.all (Hero banner, categories,
 * featured products, sections, session) resolves. Covers Category's
 * "loading state" and Featured Products' "loading skeleton" with one
 * idiomatic mechanism rather than restructuring the page into per-section
 * Suspense boundaries.
 */
export default function HomeLoading() {
  return (
    <div className="px-6">
      <p className="sr-only" role="status">
        Loading homepage
      </p>

      <div aria-hidden="true">
        {/* Hero skeleton */}
        <div className="max-w-7xl mx-auto" style={{ paddingTop: 140, paddingBottom: 64 }}>
          <div className="muv-skeleton" style={{ height: 12, width: 200, borderRadius: 999, marginBottom: 28 }} />
          <div className="muv-skeleton" style={{ height: 52, width: "55%", marginBottom: 16 }} />
          <div className="muv-skeleton" style={{ height: 16, width: "38%", marginBottom: 36 }} />
          <div className="muv-skeleton" style={{ height: 46, width: 190, borderRadius: 999 }} />
        </div>

        {/* Category skeleton */}
        <div className="max-w-7xl mx-auto py-16">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="muv-skeleton" style={{ aspectRatio: "1 / 1", borderRadius: 24 }} />
            ))}
          </div>
        </div>

        {/* Featured products skeleton */}
        <div className="max-w-7xl mx-auto py-16">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="muv-skeleton" style={{ aspectRatio: "3 / 4", borderRadius: 20 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
