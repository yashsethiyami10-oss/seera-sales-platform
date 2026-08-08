import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const correlationId=request.headers.get("x-request-id")?.match(/^[A-Za-z0-9._-]{8,80}$/)?.[0]??crypto.randomUUID();
  const requestHeaders=new Headers(request.headers);requestHeaders.set("x-request-id",correlationId);
  if(["POST","PUT","PATCH","DELETE"].includes(request.method)&&request.nextUrl.pathname.startsWith("/api/")){const origin=request.headers.get("origin"),host=request.headers.get("host");if(origin&&new URL(origin).host!==host)return NextResponse.json({error:{code:"CROSS_ORIGIN_REQUEST_DENIED"}},{status:403,headers:{"X-Request-Id":correlationId}});}
  if (!request.cookies.get("seera_session")?.value) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" } }, { status: 401 });
    const login = new URL("/login", request.url); login.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(login);
  }
  const response=NextResponse.next({request:{headers:requestHeaders}});response.headers.set("X-Request-Id",correlationId);response.headers.set("X-Content-Type-Options","nosniff");response.headers.set("Referrer-Policy","strict-origin-when-cross-origin");response.headers.set("Permissions-Policy","camera=(self), geolocation=(self), microphone=()");response.headers.set("Content-Security-Policy","default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return response;
}
export const config = { matcher: ["/portal/:path*", "/api/foundation/:path*", "/api/offline/:path*", "/api/phase-10/:path*", "/api/documents/:path*", "/api/finance/:path*", "/api/manager/:path*", "/api/partners/:path*"] };
