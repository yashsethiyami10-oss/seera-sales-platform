import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Phase 1 Block 1 fail-closed boundary.
 *
 * Portal shells exist only to establish route ownership and permission codes.
 * They are unavailable until Block 2 supplies independent Seera authentication
 * and server-side permission enforcement. There is deliberately no environment
 * switch that can bypass this boundary accidentally.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.json(
    { error: { code: "SEERA_PORTAL_NOT_ACTIVE", message: "Seera portal access is not active." } },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/portal/:path*"],
};

