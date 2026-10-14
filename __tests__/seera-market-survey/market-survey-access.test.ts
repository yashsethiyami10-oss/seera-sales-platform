import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "../../middleware";
import { surfaceItem, surfaceItems } from "../../lib/foundation/product-surface";
import { ROLE_PERMISSION_MATRIX, PHASE_1_PERMISSIONS } from "../../lib/foundation/rbac-catalog";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

describe("market survey access control", () => {
  it("API routes are behind the session middleware: unauthenticated calls get 401, cross-origin POST 403", () => {
    expect(config.matcher).toContain("/api/market-survey/:path*");
    expect(middleware(new NextRequest("https://www.seeradetergent.in/api/market-survey", { method: "POST" })).status).toBe(401);
    expect(middleware(new NextRequest("https://www.seeradetergent.in/api/market-survey/export")).status).toBe(401);
    const cross = middleware(new NextRequest("https://www.seeradetergent.in/api/market-survey", { method: "POST", headers: { origin: "https://evil.example", host: "www.seeradetergent.in", cookie: "seera_session=x" } }));
    expect(cross.status).toBe(403);
  });

  it("every route handler resolves the session identity itself (not trusting middleware)", () => {
    for (const f of ["app/api/market-survey/route.ts", "app/api/market-survey/[id]/route.ts", "app/api/market-survey/export/route.ts"]) expect(read(f)).toContain("resolveRequestIdentity()");
  });

  it("role grants: staff can create, only Founder/Company Admin can view all and manage", () => {
    for (const p of ["market_survey:create", "market_survey:view_all", "market_survey:manage"]) expect(PHASE_1_PERMISSIONS).toContain(p);
    expect(ROLE_PERMISSION_MATRIX.SALES_EXECUTIVE).toContain("market_survey:create");
    expect(ROLE_PERMISSION_MATRIX.SALES_MANAGER).toContain("market_survey:create");
    for (const role of ["SALES_EXECUTIVE", "SALES_MANAGER", "ACCOUNTS_MANAGER", "DISTRIBUTOR_OWNER", "RETAILER_USER"] as const) {
      const grants = (ROLE_PERMISSION_MATRIX as Record<string, readonly string[]>)[role] ?? [];
      expect(grants).not.toContain("market_survey:view_all");
      expect(grants).not.toContain("market_survey:manage");
    }
    expect(ROLE_PERMISSION_MATRIX.COMPANY_ADMIN).toEqual(expect.arrayContaining(["market_survey:view_all", "market_survey:manage"]));
  });

  it("the migration seeds exactly the same grants as the catalog", () => {
    const sql = read("prisma/migrations/20261012120000_seera_market_survey/migration.sql");
    for (const pair of ["('SALES_EXECUTIVE','market_survey:create')", "('SALES_MANAGER','market_survey:create')", "('COMPANY_ADMIN','market_survey:view_all')", "('COMPANY_ADMIN','market_survey:manage')", "('FOUNDER_SUPER_ADMIN','market_survey:manage')"]) expect(sql).toContain(pair);
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i);
    expect(sql).not.toMatch(/ALTER TABLE "(users|seera_retailers|outbox_events)"/);
  });

  it("navigation: field staff see the survey form; Founder and Company Admin also see Market recovery", () => {
    const staff = new Set(["market_survey:create"]);
    const admin = new Set(["market_survey:create", "market_survey:view_all", "market_survey:manage"]);
    expect(surfaceItem("sales-executive", "market-survey", staff)?.kind).toBe("market_survey");
    expect(surfaceItem("sales-manager", "market-survey", staff)?.kind).toBe("market_survey");
    expect(surfaceItem("sales-executive", "market-recovery", staff)).toBeUndefined();
    expect(surfaceItem("founder-admin", "market-recovery", admin)?.kind).toBe("market_survey");
    expect(surfaceItem("company-admin", "market-recovery", admin)?.kind).toBe("market_survey");
    expect(surfaceItems("company-admin", new Set()).some((i) => i.kind === "market_survey")).toBe(false);
  });

  it("Founder and Admin panels render the same component over the same records (no per-panel copy)", () => {
    const section = read("components/seera/market-survey/MarketSurveySection.tsx");
    expect(section).toContain("marketSurveyDashboard(db, userId, filters)");
    expect(read("prisma/schema.prisma").match(/^model SeeraMarketSurvey /gm)).toHaveLength(1);
  });
});
