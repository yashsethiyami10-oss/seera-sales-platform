import type { NextConfig } from "next";

const scriptPolicy = process.env.SEERA_LOCAL_QA === "true" && process.env.NODE_ENV !== "production"
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
