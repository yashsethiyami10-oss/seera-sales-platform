"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/primitives";
import { WriteReviewModal } from "@/components/storefront/write-review-modal";

type Review = { id: string; rating: number; title: string | null; body: string | null; customerName: string; createdAt: string | Date; isVerified: boolean };

const PAGE_SIZE = 6;
const SORTS = [
  { id: "recent", label: "Most Recent" },
  { id: "highest", label: "Highest Rated" },
  { id: "lowest", label: "Lowest Rated" },
] as const;
const RATING_FILTERS = [5, 4, 3, 2, 1] as const;

/**
 * Average + star breakdown are computed directly from the real reviews
 * already fetched server-side for this page — no separate query needed, no
 * backend work required (per the brief's "no backend implementation
 * required yet" for this section, since the data already exists). Sorting
 * and "show more" are both real, client-side operations over that same
 * real set. Photo reviews are not supported — Review has no image field in
 * the schema — so no photo UI is rendered here rather than faked.
 */
export function ProductReviews({ reviews, productId, productName }: { reviews: Review[]; productId: string; productName: string }) {
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("recent");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);

  // Average/breakdown reflect ALL real reviews regardless of the active
  // filter — a filtered view shouldn't make the store's real aggregate
  // rating look different depending on what someone happens to be viewing.
  const breakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star … index 4 = 5 star
    reviews.forEach((r) => {
      const idx = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
      counts[idx]!++;
    });
    return counts;
  }, [reviews]);

  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const verifiedCount = reviews.filter((r) => r.isVerified).length;

  const sorted = useMemo(() => {
    let list = reviews;
    if (ratingFilter != null) list = list.filter((r) => Math.round(r.rating) === ratingFilter);
    if (verifiedOnly) list = list.filter((r) => r.isVerified);
    list = [...list];
    if (sort === "highest") list.sort((a, b) => b.rating - a.rating);
    if (sort === "lowest") list.sort((a, b) => a.rating - b.rating);
    // "recent" — already the server's default order (createdAt desc)
    return list;
  }, [reviews, sort, ratingFilter, verifiedOnly]);

  // Previously rendered nothing at all for a product with zero reviews —
  // honest (no fabricated placeholder rating/count), but a silent gap in an
  // otherwise-consistent page. This is still zero fabrication: no rating,
  // no count, no invented review — just an on-brand invitation instead of
  // blank space.
  if (reviews.length === 0) {
    return (
      <section className="mt-20">
        <Reveal>
          <p className="muv-eyebrow mb-3">Reviews</p>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="muv-card text-center py-14">
            <div className="muv-icon-circle mb-4" style={{ width: 48, height: 48, margin: "0 auto" }} aria-hidden>
              <Star size={18} />
            </div>
            <p className="muv-text-solid text-sm font-medium mb-1.5">No reviews yet</p>
            <p className="muv-text-meta text-sm mb-5">Be the first to share how this worked for you.</p>
            <Button variant="ghost" onClick={() => setWriteOpen(true)}>Write a Review</Button>
          </div>
        </Reveal>
        {writeOpen && <WriteReviewModal productId={productId} productName={productName} onClose={() => setWriteOpen(false)} />}
      </section>
    );
  }

  return (
    <section className="mt-20">
      <Reveal>
        <p className="muv-eyebrow mb-3">Reviews</p>
      </Reveal>
      <Reveal delay={0.06}>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Customer Reviews</h2>
          <Button variant="ghost" onClick={() => setWriteOpen(true)}>Write a Review</Button>
        </div>
      </Reveal>
      {writeOpen && <WriteReviewModal productId={productId} productName={productName} onClose={() => setWriteOpen(false)} />}

      {/* Average + breakdown — real, computed from the reviews already on this page */}
      <Reveal delay={0.1}>
        <div className="flex flex-col sm:flex-row gap-8 mb-10 muv-card">
          <div className="text-center flex-shrink-0" style={{ minWidth: 120 }}>
            <p className="font-display text-white" style={{ fontWeight: 500, fontSize: 40 }}>{average.toFixed(1)}</p>
            <div className="flex justify-center gap-0.5 my-1.5" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ color: i < Math.round(average) ? "var(--lavender)" : "rgba(var(--text-rgb),0.2)" }}>★</span>
              ))}
            </div>
            <p className="muv-text-meta text-xs">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = breakdown[star - 1]!;
              const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="muv-text-meta w-10 flex-shrink-0">{star} star</span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(var(--text-rgb),0.08)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--lavender)" }} />
                  </div>
                  <span className="muv-text-faint w-8 flex-shrink-0 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setRatingFilter(null)} aria-pressed={ratingFilter === null} className="muv-chip px-3 py-1.5 rounded-full text-xs border" style={{ borderColor: ratingFilter === null ? "var(--lavender)" : "var(--card-border)", background: ratingFilter === null ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}>
          All Ratings
        </button>
        {RATING_FILTERS.map((star) => (
          <button key={star} onClick={() => setRatingFilter(star)} aria-pressed={ratingFilter === star} className="muv-chip px-3 py-1.5 rounded-full text-xs border" style={{ borderColor: ratingFilter === star ? "var(--lavender)" : "var(--card-border)", background: ratingFilter === star ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}>
            {star}★
          </button>
        ))}
        {verifiedCount > 0 && (
          <button onClick={() => setVerifiedOnly((v) => !v)} aria-pressed={verifiedOnly} className="muv-chip px-3 py-1.5 rounded-full text-xs border" style={{ borderColor: verifiedOnly ? "var(--lavender)" : "var(--card-border)", background: verifiedOnly ? "rgba(183,171,240,0.12)" : "transparent", color: "rgba(var(--text-rgb),0.85)" }}>
            Verified Purchase Only
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="muv-text-meta text-xs uppercase tracking-widest">Showing {Math.min(visible, sorted.length)} of {sorted.length}</p>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="muv-input" style={{ width: "auto" }} aria-label="Sort reviews">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="muv-text-meta text-sm py-8 text-center">No reviews match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sorted.slice(0, visible).map((r, i) => (
            <Reveal key={r.id} delay={i * 0.03}>
              <div className="muv-card">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: 5 }).map((_, si) => (
                      <span key={si} style={{ color: si < r.rating ? "var(--lavender)" : "rgba(var(--text-rgb),0.2)" }}>★</span>
                    ))}
                  </div>
                  {r.isVerified && (
                    <span className="muv-badge-pill" style={{ color: "var(--lavender)", borderColor: "rgba(183,171,240,0.4)", fontSize: 10 }}>
                      Verified Purchase
                    </span>
                  )}
                </div>
                <span className="sr-only">{r.rating} out of 5 stars{r.isVerified ? ", verified purchase" : ""}</span>
                {r.title && <p className="muv-text-solid text-sm font-medium mb-1">{r.title}</p>}
                {r.body && <p className="muv-text-body text-sm italic mb-3">&ldquo;{r.body}&rdquo;</p>}
                <p className="muv-text-faint text-xs uppercase tracking-wide">{r.customerName}</p>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      {visible < sorted.length && (
        <div className="text-center mt-8">
          <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest">
            Show more reviews
          </button>
        </div>
      )}
    </section>
  );
}
