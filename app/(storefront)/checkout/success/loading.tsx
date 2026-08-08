/**
 * Route-level Suspense fallback — same `.muv-skeleton` token used by every
 * other phase (homepage, /shop, /collections/[category], /products/[slug],
 * /cart, /checkout).
 */
export default function OrderSuccessLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading order confirmation</p>

      <div aria-hidden="true">
        <div className="flex flex-col items-center gap-4 mb-12">
          <div className="muv-skeleton" style={{ width: 64, height: 64, borderRadius: 999 }} />
          <div className="muv-skeleton" style={{ height: 30, width: 260 }} />
          <div className="muv-skeleton" style={{ height: 14, width: 320 }} />
          <div className="muv-skeleton" style={{ height: 60, width: 480, borderRadius: 20 }} />
        </div>
        <div className="muv-skeleton" style={{ height: 60, borderRadius: 16, marginBottom: 32 }} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="muv-skeleton" style={{ height: 220, borderRadius: 20 }} />
          <div className="flex flex-col gap-8">
            <div className="muv-skeleton" style={{ height: 140, borderRadius: 20 }} />
            <div className="muv-skeleton" style={{ height: 140, borderRadius: 20 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
