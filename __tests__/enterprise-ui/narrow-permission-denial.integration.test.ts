import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { requireAiAdminPermission } from "@/lib/muv-ai/security";
import { listVendors } from "@/lib/enterprise/vendor-service";
import { listJournals } from "@/lib/enterprise-finance/journal-service";
import { listExpenseClaims } from "@/lib/enterprise-finance/expense-service";
import { searchPartners, getPartner } from "@/lib/enterprise-network/partner-service";
import { listAgreements } from "@/lib/enterprise-network/governance-service";
import { listClaims } from "@/lib/enterprise-network/operations-service";
import { listSupportCases } from "@/lib/enterprise-network/enablement-service";
import { getFounderDashboard } from "@/lib/founder-os/dashboard-service";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listInstitutionalInquiries } from "@/lib/sales-channel/repository";

/**
 * Enterprise UI Integration — carried-forward requirement #5: automated
 * narrow-permission role fixtures so direct-URL denial is tested for
 * non-Founder users, across every module this session added or hardened
 * (AI Admin, Enterprise overview/modules, Finance, Business Network,
 * Founder OS, RBAC administration). "Sidebar visibility is not a security
 * boundary" is only actually true if the underlying function denies
 * access on its own — this suite proves that directly, independent of
 * any page or nav link, using a real seeded role (Customer Support) that
 * holds none of the six permission groups under test (confirmed against
 * prisma/seed.ts's role definitions).
 */

async function setFlag(key: string, enabled: boolean) {
  await prisma.aiConfiguration.upsert({
    where: { organizationKey_key: { organizationKey: "MUV", key } },
    update: { value: { enabled } },
    create: { organizationKey: "MUV", key, category: "FEATURE_FLAG", value: { enabled } },
  });
}

describe("Narrow-permission direct-access denial", () => {
  const suffix = `npd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let narrowUserId = "";
  let founderUserId = "";
  let createdNarrowUser = false;

  beforeAll(async () => {
    const founder = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Founder", active: true } } });
    if (!founder) throw new Error("A seeded, active Founder user is required for this test");
    founderUserId = founder.id;

    const narrow = await prisma.user.findFirst({ where: { active: true, salesRole: { name: "Customer Support", active: true } } });
    if (narrow) {
      narrowUserId = narrow.id;
    } else {
      const supportRole = await prisma.salesRole.findUniqueOrThrow({ where: { name: "Customer Support" } });
      const created = await prisma.user.create({
        data: { name: "Narrow Permission Test User", email: `narrow-permission-${suffix}@example.test`, passwordHash: "not-a-real-hash", role: "CUSTOMER", salesRoleId: supportRole.id, active: true },
      });
      narrowUserId = created.id;
      createdNarrowUser = true;
    }

    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) await setFlag(key, true);
  });

  afterAll(async () => {
    for (const key of ["ENTERPRISE_OPERATIONS_ENABLED", "ENTERPRISE_FOUNDER_OS_ENABLED"]) await setFlag(key, false);
    if (createdNarrowUser) await prisma.user.delete({ where: { id: narrowUserId } });
  });

  beforeEach(() => {
    mockAuth.mockReset();
  });

  function authAs(userId: string) {
    mockAuth.mockResolvedValue({ user: { id: userId } } as never);
  }

  it("denies AI Administration to a view-only-scoped narrow user", async () => {
    authAs(narrowUserId);
    const principal = await getAiPrincipal();
    expect(() => requireAiAdminPermission(principal)).toThrow();
  });

  it("allows AI Administration for the Founder principal", async () => {
    authAs(founderUserId);
    const principal = await getAiPrincipal();
    expect(() => requireAiAdminPermission(principal)).not.toThrow();
  });

  it("denies Enterprise Operations (vendors) to a narrow user with no enterprise.* permission", async () => {
    authAs(narrowUserId);
    await expect(listVendors({})).rejects.toThrow();
  });

  it("denies Enterprise Finance (journals) to a narrow user with no finance.* permission", async () => {
    authAs(narrowUserId);
    await expect(listJournals({})).rejects.toThrow();
  });

  it("denies Business Network (partners) to a narrow user with no network.* permission", async () => {
    authAs(narrowUserId);
    await expect(searchPartners({})).rejects.toThrow();
  });

  it("denies Founder OS to a narrow user with no founder_os.* permission", async () => {
    authAs(narrowUserId);
    await expect(getFounderDashboard()).rejects.toThrow();
  });

  it("allows Founder OS for the Founder principal (positive control, proves the denial above is permission-driven, not a broken fixture)", async () => {
    authAs(founderUserId);
    await expect(getFounderDashboard()).resolves.toBeDefined();
  });

  it("denies RBAC Roles & Permissions administration to a narrow user with no users.view permission", async () => {
    authAs(narrowUserId);
    await expect(requirePermission(PERMISSIONS.USERS_VIEW)).rejects.toThrow();
  });

  it("allows RBAC Roles & Permissions administration for the Founder principal", async () => {
    authAs(founderUserId);
    await expect(requirePermission(PERMISSIONS.USERS_VIEW)).resolves.toBeDefined();
  });

  // Independent audit finding: the original suite above proved the
  // permission-check pattern using sibling functions that already
  // existed; these cover the five pure-read functions this session
  // actually added, directly. Each of these checks permission before any
  // database lookup, so a placeholder id is enough to prove denial.
  it("denies Business Network partner detail (getPartner) to a narrow user", async () => {
    authAs(narrowUserId);
    await expect(getPartner("nonexistent-id")).rejects.toThrow();
  });

  it("denies Business Network agreements (listAgreements) to a narrow user", async () => {
    authAs(narrowUserId);
    await expect(listAgreements({})).rejects.toThrow();
  });

  it("denies Business Network claims (listClaims) to a narrow user", async () => {
    authAs(narrowUserId);
    await expect(listClaims({})).rejects.toThrow();
  });

  it("denies Business Network support cases (listSupportCases) to a narrow user", async () => {
    authAs(narrowUserId);
    await expect(listSupportCases({})).rejects.toThrow();
  });

  it("denies Enterprise Finance expense claims (listExpenseClaims) to a narrow user", async () => {
    authAs(narrowUserId);
    await expect(listExpenseClaims({})).rejects.toThrow();
  });

  it("denies institutional inquiries (listInstitutionalInquiries) to a narrow user with neither institutional.manage nor dashboard.institutional", async () => {
    authAs(narrowUserId);
    await expect(listInstitutionalInquiries({})).rejects.toThrow();
  });

  it("allows institutional inquiries for the Founder principal", async () => {
    authAs(founderUserId);
    await expect(listInstitutionalInquiries({})).resolves.toBeDefined();
  });
});
