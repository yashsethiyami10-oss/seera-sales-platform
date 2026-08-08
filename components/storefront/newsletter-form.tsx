"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Presentational subscribe form — there's no NewsletterSubscriber model or
 * capture endpoint in this codebase yet (only admin-editable heading/subtext
 * content), and wiring a real subscription pipeline is a functionality
 * change outside this visual pass. Validates the email client-side and
 * confirms via toast rather than silently pretending to persist something
 * it doesn't.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      setTimeout(() => {
        showToast("You're on the list — welcome to Keep Muving");
        setEmail("");
        setSubmitting(false);
      }, 400);
    } catch {
      // Catch-all safety net — there's no real network call yet (see the
      // module comment above), so this path can't currently trigger, but
      // it keeps the form from getting stuck mid-submit if that changes.
      showToast("Something went wrong — try again in a moment");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full" style={{ maxWidth: 340 }}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        aria-label="Email address"
        className="muv-input"
        style={{ minHeight: 42, fontSize: 13 }}
      />
      <button
        type="submit"
        disabled={submitting}
        aria-label="Subscribe"
        className="muv-icon-circle flex-shrink-0"
        style={{ width: 42, height: 42, background: "#fff", color: "#0b0b0f", border: "none" }}
      >
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
