import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, ROLE_DASHBOARD } from "@/lib/sales/constants";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { isSafeInternalPath, resolveAuthorizedDestination, resolveRoleLandingPath } from "@/lib/auth/redirect-policy";

/**
 * MUV Enterprise UI — Stage 1 (Authentication and Role-Aware Entry).
 * Covers the actual security boundary added this stage: the open-redirect
 * guard (`isSafeInternalPath`) and the single shared post-login resolution
 * function used by both the credentials and OAuth sign-in paths.
 */

function authAs(userId: string | null) {
  mockAuth.mockResolvedValue(userId ? ({ user: { id: userId } } as never) : (null as never));
}

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

describe("isSafeInternalPath — open-redirect guard", () => {
  it("accepts ordinary internal paths", () => {
    expect(isSafeInternalPath("/account")).toBe(true);
    expect(isSafeInternalPath("/sales/opportunities/123")).toBe(true);
    expect(isSafeInternalPath("/dashboard?tab=overview")).toBe(true);
  });

  it("rejects protocol-relative and external URLs", () => {
    expect(isSafeInternalPath("//evil.example.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.example.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.example.com/account")).toBe(false);
  });

  it("rejects backslash tricks browsers normalize into protocol-relative URLs", () => {
    expect(isSafeInternalPath("/\\evil.example.com")).toBe(false);
    expect(isSafeInternalPath("\\\\evil.example.com")).toBe(false);
  });

  it("rejects non-path-rooted, empty, control-character, and non-string input", () => {
    expect(isSafeInternalPath("account")).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
    expect(isSafeInternalPath("/account\n/../../evil")).toBe(false);
  });
});

describe("resolveRoleLandingPath — pure priority logic (preloaded context)", () => {
  it("sends an active Sales role to its named dashboard, even when the same user also holds ADMIN", () => {
    expect(
      resolveRoleLandingPath({
        userRole: "ADMIN",
        hasActiveSalesRole: true,
        salesRoleName: "Founder",
        isFounder: true,
        permissions: new Set(),
        enabledFlags: new Set(),
      })
    ).resolves.toBe(ROLE_DASHBOARD["Founder"]);
  });

  it("sends a Sales role with no named dashboard entry to Enterprise Operations when reachable", () => {
    expect(
      resolveRoleLandingPath({
        userRole: "CUSTOMER",
        hasActiveSalesRole: true,
        salesRoleName: "Some Future Role",
        isFounder: false,
        permissions: new Set([PERMISSIONS.ENTERPRISE_VENDOR_VIEW]),
        enabledFlags: new Set(["ENTERPRISE_OPERATIONS_ENABLED"]),
      })
    ).resolves.toBe("/enterprise");
  });

  it("falls back that same unnamed role to /sales when Enterprise Operations isn't reachable", () => {
    expect(
      resolveRoleLandingPath({
        userRole: "CUSTOMER",
        hasActiveSalesRole: true,
        salesRoleName: "Some Future Role",
        isFounder: false,
        permissions: new Set(),
        enabledFlags: new Set(),
      })
    ).resolves.toBe("/sales");
  });

  it("falls back ADMIN/STAFF with no Sales role to /admin, CUSTOMER to /account", async () => {
    const base = { hasActiveSalesRole: false, salesRoleName: null, isFounder: false, permissions: new Set<string>(), enabledFlags: new Set<string>() };
    await expect(resolveRoleLandingPath({ ...base, userRole: "ADMIN" })).resolves.toBe("/admin");
    await expect(resolveRoleLandingPath({ ...base, userRole: "STAFF" })).resolves.toBe("/admin");
    await expect(resolveRoleLandingPath({ ...base, userRole: "CUSTOMER" })).resolves.toBe("/account");
  });

  it("terminates at /access-denied for a null context, never loops or throws", async () => {
    await expect(resolveRoleLandingPath(null)).resolves.toBe("/access-denied");
  });
});

describe("resolveAuthorizedDestination — end to end with real seeded roles", () => {
  const suffix = `s1${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let founderUserId = "";
  let supportUserId = "";
  let createdSupportUser = false;

  beforeAll(async () => {
    await setFlag("ENTERPRISE_OPERATIONS_ENABLED", true);

    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const support = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (support) {
      supportUserId = support.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "Stage 1 Redirect Test User", email: `stage1-redirect-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      supportUserId = created.id;
      createdSupportUser = true;
    }
  });

  afterAll(async () => {
    await setFlag("ENTERPRISE_OPERATIONS_ENABLED", false);
    if (createdSupportUser) await prisma.user.delete({ where: { id: supportUserId } });
  });

  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("sends an unauthenticated visitor to /login regardless of the requested callback", async () => {
    authAs(null);
    await expect(resolveAuthorizedDestination("/admin")).resolves.toBe("/login");
  });

  it("honors a safe, authorized callback as-is", async () => {
    authAs(founderUserId);
    await expect(resolveAuthorizedDestination("/sales/opportunities")).resolves.toBe("/sales/opportunities");
  });

  it("ignores an unsafe callback and falls back to the role landing page", async () => {
    authAs(founderUserId);
    await expect(resolveAuthorizedDestination("//evil.example.com")).resolves.toBe(ROLE_DASHBOARD["Founder"]);
  });

  it("ignores a safe but unauthorized callback rather than bouncing the user into a rejection", async () => {
    authAs(supportUserId);
    // Customer Support has an active Sales role but no /admin access.
    await expect(resolveAuthorizedDestination("/admin")).resolves.not.toBe("/admin");
  });

  it("ignores a safe but unrecognized route prefix and falls back to the role landing page", async () => {
    authAs(founderUserId);
    await expect(resolveAuthorizedDestination("/some/future/route")).resolves.toBe(ROLE_DASHBOARD["Founder"]);
  });
});
