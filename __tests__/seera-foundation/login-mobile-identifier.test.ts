import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeIndianMobile } from "@/lib/messaging/phone";

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

// P0 21-Aug Founder fix: Distributor/Super Stockist accounts are provisioned with a synthetic
// dist.<mobile>@seera.local / partner-<mobile>-<timestamp>@seera.local identifier nobody types
// from memory. Real production evidence (Kuldeep Jha, dist.9956736641@seera.local) showed 4
// consecutive INVALID_CREDENTIALS failures in a row on 2026-08-20. login() now also accepts the
// plain 10-digit mobile already stored on User.phone for these accounts.
describe("Login accepts a plain mobile number (P0 21-Aug)", () => {
  it("normalizeIndianMobile recognizes a real Distributor's raw 10-digit mobile", () => {
    expect(normalizeIndianMobile("9956736641")).toBe("919956736641");
  });

  it("normalizeIndianMobile ALONE is too permissive — it also 'recognizes' the digits embedded inside a synthetic email (this is exactly why login() must gate on '@' first, not call normalizeIndianMobile unguarded)", () => {
    expect(normalizeIndianMobile("dist.9956736641@seera.local")).toBe("919956736641");
  });

  it("login() gates the mobile-lookup path on '@' BEFORE calling normalizeIndianMobile, so a real email is never reinterpreted as a phone number", () => {
    const code = source("lib/foundation/auth-service.ts");
    expect(code).toContain('identifier.includes("@") ? null : normalizeIndianMobile(identifier)');
    expect(code).toContain("prisma.user.findUnique({ where: { phone: canonicalMobile.slice(2) } })");
    // The old `.email()`-only zod constraint must be gone — a raw mobile number would fail it.
    expect(code).not.toContain("z.string().trim().email().max(320)");
  });

  it("the login form no longer HTML5-blocks non-email input", () => {
    const code = source("app/login/login-form.tsx");
    expect(code).not.toContain('type="email"');
  });
});
