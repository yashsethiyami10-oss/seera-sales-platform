/**
 * Route-level Suspense fallback — same `.muv-skeleton` token as every other
 * loading.tsx in this route group. Previously missing (cart.page.tsx awaits
 * real Prisma queries for recommended products with nothing shown while it
 * resolves).
 */
export default function CartLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading cart</p>

      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 12, width: 100, borderRadius: 999, marginBottom: 12 }} />
        <div className="muv-skeleton" style={{ height: 36, width: "40%", maxWidth: 320, marginBottom: 40 }} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="muv-skeleton" style={{ height: 120, borderRadius: 20 }} />
            ))}
          </div>
          <div className="muv-skeleton" style={{ height: 260, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}
