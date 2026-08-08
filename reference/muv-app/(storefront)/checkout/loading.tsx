/**
 * Route-level Suspense fallback — same `.muv-skeleton` token used by the
 * homepage, /shop, /collections/[category], /products/[slug], and /cart.
 */
export default function CheckoutLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading checkout</p>

      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 11, width: 140, borderRadius: 999, marginBottom: 16 }} />
        <div className="muv-skeleton" style={{ height: 36, width: 220, marginBottom: 24 }} />
        <div className="flex gap-2 mb-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 24, width: 90, borderRadius: 999 }} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="muv-skeleton" style={{ height: 140, borderRadius: 20 }} />
            <div className="muv-skeleton" style={{ height: 46, width: 220, borderRadius: 999 }} />
          </div>
          <div className="muv-skeleton" style={{ height: 260, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}
