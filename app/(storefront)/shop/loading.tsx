/**
 * Route-level Suspense fallback — same `.muv-skeleton` token used by
 * app/(storefront)/loading.tsx (the homepage), not a new skeleton language.
 */
export default function ShopLoading() {
  return (
    <div className="px-6">
      <p className="sr-only" role="status">Loading shop</p>

      <div aria-hidden="true" className="max-w-7xl mx-auto">
        {/* Hero skeleton */}
        <div style={{ paddingTop: 96, paddingBottom: 56 }} className="text-center flex flex-col items-center gap-4">
          <div className="muv-skeleton" style={{ height: 12, width: 140, borderRadius: 999 }} />
          <div className="muv-skeleton" style={{ height: 40, width: "50%", maxWidth: 420 }} />
          <div className="muv-skeleton" style={{ height: 14, width: "60%", maxWidth: 480 }} />
        </div>

        {/* Category strip skeleton */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 pb-16">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 96, borderRadius: 20 }} />
          ))}
        </div>

        {/* Product grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ aspectRatio: "3 / 4", borderRadius: 20 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
