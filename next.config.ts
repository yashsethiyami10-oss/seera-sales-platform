import type { NextConfig } from "next";

// Next.js dev mode (webpack HMR/fast-refresh) executes its bundle via eval() — without
// 'unsafe-eval' the CSP silently blocks the entire client bundle from running, so React never
// hydrates and every onClick/onSubmit handler is inert (P0 login blocker, 2026-08-10: the form
// fell back to a native, action-less HTML POST that reloads the page and clears the fields, with
// no error surfaced because no JS was running to show one). This never weakens the production
// policy — `next build`/`next start` always set NODE_ENV=production — so gating purely on that,
// with no extra manual flag to remember, is safe and removes the operational footgun that caused
// this to recur after already being diagnosed once (see SEERA_V1_INTEGRATED_DEFECT_REGISTER.md
// IV-006, previously "fixed" only by remembering to set SEERA_LOCAL_QA=true).
const scriptPolicy = process.env.NODE_ENV !== "production"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  // Prevents this site from being framed by another origin (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Stops the browser from MIME-sniffing a response away from its declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin (not the full URL/path) as a Referer header to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disables powerful browser features this app never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Force HTTPS for a year, including subdomains, once this is actually served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: `default-src 'self'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Quotation/invoice PDF rendering (lib/sales-distribution/document-pdf.ts) reads Noto Sans font
  // .woff files straight out of node_modules/@fontsource at request time via readFileSync(path.
  // join(process.cwd(), ...)) — a dynamically-built path Next's serverless output-file tracer
  // cannot statically resolve, so those font files were silently dropped from the deployed
  // function bundle. Locally (next dev/next start against a full checkout) the files are simply
  // on disk, so it always worked in dev — production hit ENOENT, caught and normalized into a
  // generic INTERNAL_ERROR by lib/errors.ts, exactly matching the Founder's "/api/documents/{id}
  // /download" P0 report. Forcing inclusion here is the officially documented fix for reading
  // non-code assets from node_modules in a Vercel Node.js function.
  outputFileTracingIncludes: {
    "/api/documents/**/*": [
      "./node_modules/@fontsource/noto-sans/files/*.woff",
      "./node_modules/@fontsource/noto-sans-devanagari/files/*.woff",
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
    // ProductImage (components/storefront/product-image.tsx) requests
    // quality={90} — explicit allowlist avoids the "unconfigured qualities"
    // deprecation warning and keeps working once Next.js 16 enforces it.
    qualities: [75, 90, 95],
  },

  async headers() {
    return [
      { source: "/portal/:path*", headers: [...securityHeaders, { key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/api/auth/:path*", headers: [...securityHeaders, { key: "Cache-Control", value: "no-store, max-age=0" }] },
      { source: "/api/foundation/:path*", headers: [...securityHeaders, { key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
