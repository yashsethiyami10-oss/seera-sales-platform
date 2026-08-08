/** Admin-scoped loading skeleton (Phase 16) — previously only the
 * storefront/checkout/account segments had a loading.tsx; every admin page
 * showed a blank white flash on first navigation before this. Deliberately
 * generic (a handful of pulsing placeholder cards) since it covers every
 * page under /admin, not one specific layout. */
export default function AdminLoading() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="muv-card animate-pulse" style={{ height: 84 }} />
      ))}
    </div>
  );
}
