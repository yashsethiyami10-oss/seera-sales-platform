import Link from "next/link";

/**
 * Root-level fallback (Phase 16) — catches a stray URL that doesn't match
 * any route at all, outside every route group's own layout (so no Nav/
 * Footer chrome is available here; app/(storefront)/not-found.tsx handles
 * the far more common case of a bad in-storefront slug with full branded
 * chrome). Kept deliberately minimal since this path is rarely hit in
 * practice — anything under (storefront)/, /admin, /account, or /checkout
 * has its own more specific not-found/layout.
 */
export default function RootNotFound() {
  return (
    <div style={{ background: "var(--ink, #0b0b0f)", color: "#fff", minHeight: "100vh" }} className="flex items-center justify-center px-6 text-center">
      <div style={{ maxWidth: "40ch" }}>
        <p style={{ fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.6, marginBottom: 16 }}>404</p>
        <h1 className="font-display" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3vw,2.2rem)", marginBottom: 12 }}>Page not found</h1>
        <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 32, lineHeight: 1.7 }}>This page doesn&rsquo;t exist, or may have moved.</p>
        <Link href="/" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.15em", color: "#b7abf0" }}>Back to Muv</Link>
      </div>
    </div>
  );
}
