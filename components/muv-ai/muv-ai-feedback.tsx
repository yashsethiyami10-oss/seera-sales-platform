import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import type { FeedbackState } from "./use-muv-ai-chat";

/**
 * "Helpful / Not helpful" — the minimal interaction Wave 2 asks for.
 * Purely a UI affordance over `submitFeedback()`; never alters the
 * assistant response it's attached to.
 */
export function MuvAiFeedback({ state, onSubmit }: { state: FeedbackState; onSubmit: (helpful: boolean) => void }) {
  if (state === "helpful" || state === "not-helpful") {
    return (
      <div className="muv-ai-feedback muv-ai-feedback-done" role="status">
        <Check size={12} aria-hidden />
        <span>Thanks for the feedback</span>
      </div>
    );
  }

  const submitting = state === "submitting";

  return (
    <div className="muv-ai-feedback" role="group" aria-label="Was this response helpful?">
      <button
        type="button"
        className="muv-ai-feedback-btn"
        onClick={() => onSubmit(true)}
        disabled={submitting}
        aria-label="Mark this response as helpful"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        className="muv-ai-feedback-btn"
        onClick={() => onSubmit(false)}
        disabled={submitting}
        aria-label="Mark this response as not helpful"
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}
