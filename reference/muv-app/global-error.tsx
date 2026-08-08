"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * Catches an error thrown by the root layout itself (app/layout.tsx) — the
 * one case app/error.tsx can't handle, since that boundary lives inside the
 * layout it would need to replace. Must render its own <html>/<body> and
 * stay deliberately minimal/dependency-free (no providers, no next/font) —
 * if the root layout is what broke, this page can't assume anything else
 * still works.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("global:error-boundary", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0b0b0f", color: "#fff", minHeight: "100vh", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: "40ch", textAlign: "center", padding: 24 }}>
          <h1 style={{ fontWeight: 400, fontSize: "1.8rem", marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 32, lineHeight: 1.7 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", color: "#b7abf0", background: "none", border: "1px solid rgba(183,171,240,0.4)", borderRadius: 999, padding: "10px 24px", cursor: "pointer" }}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
