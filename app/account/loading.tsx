/**
 * Route-level Suspense fallback — same `.muv-skeleton` token used by every
 * other phase (homepage, /shop, /collections/[category], /products/[slug],
 * /cart, /checkout, /checkout/success). Covers every page under
 * app/account/ (dashboard, orders, order detail, profile, wishlist).
 */
export default function AccountLoading() {
  return (
    <div>
      <p className="sr-only" role="status">Loading account</p>
      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 30, width: 220, marginBottom: 12 }} />
        <div className="muv-skeleton" style={{ height: 14, width: 260, marginBottom: 28 }} />
        <div className="grid grid-cols-2 gap-4 mb-10">
          <div className="muv-skeleton" style={{ height: 76, borderRadius: 20 }} />
          <div className="muv-skeleton" style={{ height: 76, borderRadius: 20 }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 84, borderRadius: 16 }} />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 60, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
