import {describe,it,expect} from "vitest";import {readFileSync} from "node:fs";import path from "node:path";const root=path.resolve(__dirname,"..","..");const read=(f:string)=>readFileSync(path.join(root,f),"utf8");
describe("Phase 11 static production gates",()=>{
 it("ships an installable manifest and service worker",()=>{expect(read("app/manifest.ts")).toContain("standalone");expect(read("public/sw.js")).toContain("seera-shell-v1")});
 it("never caches authenticated API responses",()=>expect(read("public/sw.js")).toContain('url.pathname.startsWith("/api/")'));
 it("uses IndexedDB rather than financial localStorage",()=>{expect(read("lib/phase-11/offline-client.ts")).toContain("indexedDB.open");expect(read("lib/phase-11/offline-client.ts")).not.toContain("localStorage")});
 it("requires server session context on sync",()=>expect(read("app/api/offline/sync/route.ts")).toContain("STALE_DEVICE_SESSION"));
 it("enforces server idempotency persistence",()=>expect(read("prisma/schema.prisma")).toContain("@@unique([userId, clientOperationId])"));
 it("does not cache API or financial truth",()=>expect(read("public/sw.js")).not.toMatch(/cache\.put\([^)]*\/api/));
 it("sets hardened cookie attributes",()=>{const route=read("app/api/auth/login/route.ts");expect(route).toContain('sameSite: "strict"');expect(route).toContain("httpOnly: true")});
 it("keeps pre-hydration credentials out of the URL",()=>expect(read("app/login/login-form.tsx")).toContain('<form method="post"'));
 it("labels guarded TEST runtime identity accurately",()=>expect(read("instrumentation.ts")).toContain('SEERA_DATABASE_ROLE === "test"'));
 it("keeps dashboard DB reads sequential on the pooled path",()=>expect(read("lib/phase-10/dashboard-service.ts")).not.toContain("Promise.all"));
 it("sets correlation and security headers without weakening production CSP",()=>{const mw=read("middleware.ts"),config=read("next.config.ts");expect(mw).toContain("X-Request-Id");expect(mw).toContain("Content-Security-Policy");expect(mw).toContain("CROSS_ORIGIN_REQUEST_DENIED");expect(mw).toContain('process.env.SEERA_LOCAL_QA==="true"&&process.env.NODE_ENV!=="production"');expect(mw).toContain('?"script-src \'self\' \'unsafe-inline\' \'unsafe-eval\'"');expect(mw).toContain(':"script-src \'self\'"');expect(config).toContain('process.env.SEERA_LOCAL_QA === "true" && process.env.NODE_ENV !== "production"');expect(config).toContain(': "script-src \'self\' \'unsafe-inline\'"')});
 it("validates upload magic bytes and filenames",()=>{const service=read("lib/sales-distribution/document-service.ts");expect(service).toContain("DOCUMENT_SIGNATURE_MISMATCH");expect(service).toContain("MALICIOUS_DOCUMENT_EXTENSION")});
 it("has liveness and DB readiness",()=>{expect(read("app/api/health/live/route.ts")).toContain('status:"alive"');expect(read("app/api/health/ready/route.ts")).toContain("SELECT 1")});
});
