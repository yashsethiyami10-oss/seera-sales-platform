import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

// Netlify build-time database identity gate (scripts/seera/production-build-preflight.cjs). Pure unit
// test with synthetic URLs; no database connection is made and no real credentials are used.
const require = createRequire(import.meta.url);
const { netlifyDatabaseGate, endpointOf } = require("../../scripts/seera/production-build-preflight.cjs") as {
  netlifyDatabaseGate: (env: Record<string, string | undefined>) => { ok: boolean; skipped?: boolean; message?: string };
  endpointOf: (url?: string) => { endpoint: string; database: string } | null;
};

const PROD = "postgresql://neondb_owner:not-a-real-password@ep-spring-butterfly-azr53vdl-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const TEST = "postgresql://neondb_owner:not-a-real-password@ep-fancy-mud-azejeoyi-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const OTHER = "postgresql://neondb_owner:not-a-real-password@ep-jolly-bar-azdop7ld-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("Netlify database preflight gate", () => {
  it("does nothing off Netlify (Vercel/local builds keep their previous behaviour)", () => {
    expect(netlifyDatabaseGate({ DATABASE_URL: OTHER })).toEqual({ ok: true, skipped: true });
  });

  it("allows a production build only on the confirmed production endpoint and database", () => {
    expect(netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: "production", DATABASE_URL: PROD })).toMatchObject({ ok: true });
    expect(netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: "production", DATABASE_URL: PROD.replace("/neondb?", "/otherdb?") }).ok).toBe(false);
    for (const url of [TEST, OTHER, "", "not a url", "mysql://x@ep-spring-butterfly-azr53vdl/neondb"])
      expect(netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: "production", DATABASE_URL: url }).ok).toBe(false);
  });

  it("refuses previews and branch deploys that point at production", () => {
    for (const context of ["deploy-preview", "branch-deploy"]) {
      expect(netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: context, DATABASE_URL: PROD }).ok).toBe(false);
      expect(netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: context, DATABASE_URL: TEST }).ok).toBe(true);
    }
  });

  it("never prints the password or the full connection string", () => {
    for (const [context, url] of [["production", PROD], ["production", OTHER], ["deploy-preview", PROD], ["deploy-preview", TEST]] as const) {
      const message = netlifyDatabaseGate({ NETLIFY: "true", CONTEXT: context, DATABASE_URL: url }).message ?? "";
      expect(message).not.toContain("not-a-real-password");
      expect(message).not.toContain("neondb_owner");
      expect(message).not.toContain(url);
    }
  });

  it("extracts the endpoint id from pooled and direct hostnames", () => {
    expect(endpointOf(PROD)).toEqual({ endpoint: "ep-spring-butterfly-azr53vdl", database: "neondb" });
    expect(endpointOf(PROD.replace("-pooler", ""))).toEqual({ endpoint: "ep-spring-butterfly-azr53vdl", database: "neondb" });
    expect(endpointOf(undefined)).toBeNull();
  });
});
