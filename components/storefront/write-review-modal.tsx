"use client";

import { useState } from "react";
import { Star, ImagePlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createReview } from "@/actions/reviews";

/**
 * Sprint 2 Part 5 — review submission happens inside this modal, on the
 * same product page the shopper was already reading — no navigation to a
 * separate page or route. Star rating, title, and body are real, wired to
 * the existing `createReview` Server Action (verified-purchase gate
 * enforced server-side, not trusted from here). Image upload is
 * deliberately non-functional — `Review` has no image field in the schema
 * — shown disabled and clearly labeled, per the Founder's own explicit
 * instruction to add placeholder UI only for this one piece, not to fake a
 * working upload.
 */
export function WriteReviewModal({ productId, productName, onClose }: { productId: string; productName: string; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Pick at least one star");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createReview({ productId, rating, title: title.trim() || undefined, body: body.trim() || undefined });
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setSubmitted(true);
    showToast("Review submitted — thank you");
  }

  if (submitted) {
    return (
      <Modal title="Review submitted" onClose={onClose}>
        <p className="muv-text-body text-sm mb-6" style={{ lineHeight: 1.7 }}>
          Thanks for reviewing {productName}. It'll appear here once it's been checked, usually within a day or two.
        </p>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </Modal>
    );
  }

  return (
    <Modal title={`Review ${productName}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="muv-text-body text-xs uppercase tracking-wide mb-2">Your Rating</p>
        <div className="flex gap-1 mb-6" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              aria-pressed={rating === star}
              className="muv-tap-target"
            >
              <Star size={26} strokeWidth={1.3} fill={(hoverRating || rating) >= star ? "var(--lavender)" : "none"} color="var(--lavender)" />
            </button>
          ))}
        </div>

        <label htmlFor="review-title" className="muv-text-body text-xs uppercase tracking-wide mb-2 block">Title (optional)</label>
        <input
          id="review-title"
          className="muv-input mb-5"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sum it up in a few words"
        />

        <label htmlFor="review-body" className="muv-text-body text-xs uppercase tracking-wide mb-2 block">Your Review (optional)</label>
        <textarea
          id="review-body"
          className="muv-input muv-textarea mb-2"
          rows={4}
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you use it for, and how did it work out? (optional)"
        />
        <p className="muv-text-faint text-[11px] mb-5">{body.length}/1000</p>

        <p className="muv-text-body text-xs uppercase tracking-wide mb-2">Photos</p>
        <button
          type="button"
          disabled
          aria-disabled
          className="muv-card flex items-center gap-2 mb-6"
          style={{ padding: "12px 16px", opacity: 0.5, cursor: "not-allowed", width: "fit-content" }}
        >
          <ImagePlus size={16} strokeWidth={1.4} />
          <span className="muv-text-meta text-xs">Add photos — Muving Soon™</span>
        </button>

        {error && <p className="text-xs mb-4" style={{ color: "#f87171" }}>{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Review"}
          </Button>
          <button type="button" onClick={onClose} className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
