/**
 * Route-level Suspense fallback — same `.muv-skeleton` token as the
 * homepage's and /shop's loading states, not a new skeleton language.
 */
export default function CollectionLoading() {
  return (
    <div className="px-6">
      <p className="sr-only" role="status">Loading collection</p>

      <div aria-hidden="true" className="max-w-7xl mx-auto">
        <div style={{ paddingTop: 96, paddingBottom: 56 }} className="flex flex-col gap-4">
          <div className="muv-skeleton" style={{ height: 11, width: 120, borderRadius: 999 }} />
          <div className="muv-skeleton" style={{ height: 40, width: "40%", maxWidth: 320 }} />
          <div className="muv-skeleton" style={{ height: 14, width: "55%", maxWidth: 460 }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ aspectRatio: "3 / 4", borderRadius: 20 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
