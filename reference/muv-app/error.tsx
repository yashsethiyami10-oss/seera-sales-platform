"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/lib/logger";

/**
 * Root error boundary (Phase 16) — catches any uncaught render error
 * anywhere outside a more specific boundary (app/account/error.tsx already
 * existed; nothing else did). The raw error is logged server-side only,
 * never rendered to the visitor, same discipline as the existing account
 * error boundary.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("root:error-boundary", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div style={{ background: "var(--ink, #0b0b0f)", color: "#fff", minHeight: "100vh" }} className="flex items-center justify-center px-6 text-center">
      <div style={{ maxWidth: "40ch" }}>
        <h1 className="font-display" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)", marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 32, lineHeight: 1.7 }}>We couldn&rsquo;t load this page. Try again, or head back home.</p>
        <div className="flex items-center gap-5 justify-center flex-wrap">
          <button onClick={reset} style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", color: "#b7abf0", background: "none", border: "none", cursor: "pointer" }}>Try Again</button>
          <Link href="/" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", color: "#b7abf0" }}>Back to Muv</Link>
        </div>
      </div>
    </div>
  );
}
