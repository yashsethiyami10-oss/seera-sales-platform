import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.muv.co.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Phase 16 — /login and /signup are now noIndex'd at the page level
      // too (app/(auth)/login/layout.tsx, .../signup/layout.tsx); listed
      // here as well for consistency with /reset-password, which was
      // already disallowed.
      disallow: ["/admin", "/account", "/api", "/login", "/signup", "/reset-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
