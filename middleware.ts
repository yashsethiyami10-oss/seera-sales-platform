import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Uses the edge-safe config directly (not lib/auth.ts) — that file pulls in
// bcryptjs and the Prisma adapter, both Node-only, which the Edge Runtime
// can't load. This instance never runs authorize(); it only decodes the
// existing session JWT to gate routes.
const { auth } = NextAuth(authConfig);

// Runs on the Edge before any matched request reaches a page or layout.
// This is a coarse first gate only — it stops an unauthenticated or
// obviously-wrong-role user from ever rendering the page shell, but every
// server action and API route still re-checks permissions itself (see
// lib/rbac.ts and lib/sales/authorization.ts). Never rely on middleware
// alone: it's a UX fast-path, not the security boundary — a request that
// reaches a Server Action directly (not through this middleware's matched
// routes) must still be safe on its own.
//
// Stage 1 (Authentication and Role-Aware Entry): `/dashboard` and `/sales`
// were not edge-gated at all before this — they relied entirely on their
// own layout's server-side `getSalesPrincipal()` check (a real, correct
// check, just not fast-pathed at the edge). Added here for consistency
// with `/admin`/`/enterprise`'s existing treatment. Middleware still can't
// determine *sales* authorization (that needs a DB lookup for the user's
// SalesRole/permissions, which the JWT alone doesn't carry) — only "is
// this request authenticated at all." Full authorization remains the
// layout/page's job, unchanged.
export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth?.user;
  const role = req.auth?.user?.role;

  const isAdminRoute = nextUrl.pathname.startsWith("/admin");
  // Phase 18 — /checkout is no longer account-gated here (guest checkout);
  // app/(storefront)/checkout/page.tsx and createOrder (actions/orders.ts)
  // both handle the guest/logged-in split themselves. /account stays fully
  // gated, unchanged.
  const isAccountRoute = nextUrl.pathname.startsWith("/account");
  const isEnterpriseRoute = nextUrl.pathname.startsWith("/enterprise") || nextUrl.pathname.startsWith("/api/enterprise")
    || nextUrl.pathname.startsWith("/network") || nextUrl.pathname.startsWith("/finance");
  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");
  const isSalesRoute = nextUrl.pathname.startsWith("/sales");
  const isProtectedRoute = isAdminRoute || isAccountRoute || isEnterpriseRoute || isDashboardRoute || isSalesRoute;

  if (isAdminRoute) {
    if (!isAuthed) {
      return NextResponse.redirect(new URL(`/login?callbackUrl=${nextUrl.pathname}`, nextUrl));
    }
    if (role !== "ADMIN" && role !== "STAFF") {
      return NextResponse.redirect(new URL("/access-denied", nextUrl));
    }
  }

  if ((isAccountRoute || isEnterpriseRoute || isDashboardRoute || isSalesRoute) && !isAuthed) {
    return NextResponse.redirect(new URL(`/login?callbackUrl=${nextUrl.pathname}`, nextUrl));
  }

  const response = NextResponse.next();
  // Stage 1: "Browser Back after logout must not reveal protected
  // content." Every matched protected route is rendered dynamically
  // per-request already (each reads the session server-side), but an
  // explicit no-store instruction removes any ambiguity about whether a
  // browser's back-forward cache is allowed to restore a previously
  // -rendered authenticated page after the session cookie is gone.
  if (isProtectedRoute) response.headers.set("Cache-Control", "no-store");
  return response;
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/enterprise/:path*", "/api/enterprise/:path*", "/dashboard/:path*", "/sales/:path*", "/network/:path*", "/finance/:path*"],
};
