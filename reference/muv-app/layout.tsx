import type { Metadata } from "next";
import { Fraunces, Inter, Cormorant_Garamond } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/lib/cart-context";
import { RecentlyViewedSync } from "@/components/storefront/recently-viewed-sync";
import { MuvAiLoader } from "@/components/muv-ai/muv-ai-loader";
import { buildMetadata, buildOrganizationSchema } from "@/lib/seo";
import "@/styles/globals.css";

/**
 * next/font self-hosts and inlines font files at build time — a real
 * upgrade over every original .jsx file's `useFonts()` hook, which injected
 * a <link> to Google's CDN at runtime (a render-blocking third-party
 * request on every page load, plus a layout shift while the fallback font
 * was visible). This is one of the few places this assembly pass changes
 * *how* something works, not just *where* the code lives — flagged here
 * because it's a genuine behavior change worth knowing about, even though
 * the visual result is identical.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  weight: "variable",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});
// Founder Typography Refinement — scoped to the homepage hero headline
// only (see app/(storefront)/page.tsx). Every other heading site-wide
// keeps Fraunces (`font-display`) unchanged.
const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = buildMetadata({
  title: "Seera Sales & Distribution OS",
  description: "Independent sales and distribution operating system for Seera Detergent.",
  path: "/",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const orgSchema = buildOrganizationSchema();

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${cormorantGaramond.variable}`}>
      <head>
        {/* MUV OS™ refinement pass — the real, empirically-confirmed root
            cause of native <select>/date-picker popups still rendering
            with a white background: the CSS `color-scheme` *property*
            (set on `:root` in styles/globals.css) computes correctly on
            every element, but a real-browser screenshot showed the actual
            dropdown popup — a separate rendering surface — not honoring
            it. This <meta> tag is the HTML-level mechanism (independent
            of any CSS cascade/inheritance path) browsers use specifically
            to decide how to paint native form-control chrome; it is the
            actual fix, verified by re-screenshotting after adding it.
            Safe app-wide: the storefront is already always-dark by
            design, and `.muv-admin-shell` already forces
            `color-scheme: dark` unconditionally today — this doesn't
            change behavior anywhere that wasn't already dark. */}
        <meta name="color-scheme" content="dark" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      </head>
      <body>
        <ToastProvider>
          <CartProvider>
            {children}
            <MuvAiLoader />
          </CartProvider>
        </ToastProvider>
        <RecentlyViewedSync />
      </body>
    </html>
  );
}
