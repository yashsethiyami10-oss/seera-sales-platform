import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

// Regression (P0, 2026-10-12): every /portal/* page stuck on "Loading Seera workspace…" in production. The
// middleware sent a nonce-only script CSP on the response but never passed that CSP on the request, so Next.js
// could not stamp its scripts with the nonce and the browser blocked all of them (no hydration, streamed
// Suspense content never swapped in). Next reads the nonce from the Content-Security-Policy REQUEST header,
// which NextResponse.next({ request: { headers } }) forwards as x-middleware-request-content-security-policy.
afterEach(() => vi.unstubAllEnvs());

function portalRequest() {
  return new NextRequest("https://www.seeradetergent.in/portal/sales-executive", { headers: { cookie: "seera_session=unit-test-session" } });
}

describe("portal CSP nonce", () => {
  it("forwards the exact response CSP to Next.js on the request, in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = middleware(portalRequest());
    const responsePolicy = response.headers.get("Content-Security-Policy");
    const requestPolicy = response.headers.get("x-middleware-request-content-security-policy");
    expect(responsePolicy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(requestPolicy).toBe(responsePolicy);
    const nonce = responsePolicy!.match(/'nonce-([^']+)'/)![1];
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("keeps the policy strict: no unsafe-inline or unsafe-eval scripts in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const policy = middleware(portalRequest()).headers.get("Content-Security-Policy")!;
    const scriptSrc = policy.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("uses a fresh nonce per request", () => {
    vi.stubEnv("NODE_ENV", "production");
    const a = middleware(portalRequest()).headers.get("Content-Security-Policy");
    const b = middleware(portalRequest()).headers.get("Content-Security-Policy");
    expect(a).not.toBe(b);
  });

  it("still redirects unauthenticated portal requests to login and rejects unauthenticated API calls", () => {
    const redirect = middleware(new NextRequest("https://www.seeradetergent.in/portal/sales-executive"));
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("https://www.seeradetergent.in/login?next=%2Fportal%2Fsales-executive");
    const api = middleware(new NextRequest("https://www.seeradetergent.in/api/field/visits"));
    expect(api.status).toBe(401);
  });
});
