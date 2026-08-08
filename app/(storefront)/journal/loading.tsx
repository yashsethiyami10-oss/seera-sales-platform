/** Route-level Suspense fallback — same `.muv-skeleton` token as every
 * other loading.tsx in this route group. Previously missing (journal/
 * page.tsx awaits a real prisma.blogPost.findMany with nothing shown while
 * it resolves). */
export default function JournalLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading journal</p>

      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 36, width: "30%", maxWidth: 220, marginBottom: 40 }} />
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 140, borderRadius: 20 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
