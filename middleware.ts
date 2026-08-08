import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.cookies.get("seera_session")?.value) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" } }, { status: 401 });
    const login = new URL("/login", request.url); login.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(login);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/portal/:path*", "/api/foundation/:path*"] };
