/**
 * Route-level Suspense fallback — same `.muv-skeleton` token used by the
 * homepage, /shop, and /collections/[category], not a new skeleton language.
 */
export default function ProductLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading product</p>

      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 11, width: 220, borderRadius: 999, marginBottom: 24 }} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="muv-skeleton" style={{ height: 460, borderRadius: 20 }} />
          <div className="flex flex-col gap-4">
            <div className="muv-skeleton" style={{ height: 12, width: 160, borderRadius: 999 }} />
            <div className="muv-skeleton" style={{ height: 44, width: "80%" }} />
            <div className="muv-skeleton" style={{ height: 14, width: "100%" }} />
            <div className="muv-skeleton" style={{ height: 14, width: "70%" }} />
            <div className="muv-skeleton" style={{ height: 36, width: 140, marginTop: 12 }} />
            <div className="muv-skeleton" style={{ height: 46, width: 220, borderRadius: 999, marginTop: 12 }} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-16">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 90, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
