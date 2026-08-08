/** Route-level Suspense fallback — same `.muv-skeleton` token as every
 * other loading.tsx in this route group. Previously missing (this route
 * awaits a real prisma.blogPost.findUnique with nothing shown while it
 * resolves). */
export default function JournalArticleLoading() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <p className="sr-only" role="status">Loading article</p>

      <div aria-hidden="true">
        <div className="muv-skeleton" style={{ height: 11, width: 90, borderRadius: 999, marginBottom: 12 }} />
        <div className="muv-skeleton" style={{ height: 36, width: "80%", marginBottom: 16 }} />
        <div className="muv-skeleton" style={{ height: 12, width: 160, marginBottom: 40 }} />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="muv-skeleton" style={{ height: 14, width: i % 3 === 2 ? "70%" : "100%" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
