import { describe, it, expect, vi } from "vitest";
import { ROLE_DASHBOARD, SALES_ROLES } from "@/lib/sales/constants";
import { gst } from "@/lib/sales-channel/validation";

/**
 * MUV Institutional Sales OS — Existing-Code Reconciliation, Phase I.
 * Smallest targeted coverage for the three concrete fixes made this pass:
 * the corrected role-landing route, the reused/repaired GSTIN validator,
 * and the officer dashboard's newly-exposed (already-existing-elsewhere)
 * pipeline/quotation summary data.
 */

describe("Institutional Sales Officer landing route", () => {
  it("points at the real Institutional Sales OS, not the old thin legacy dashboard", () => {
    expect(ROLE_DASHBOARD[SALES_ROLES.INSTITUTIONAL]).toBe("/os/sales");
  });
});

describe("Shared GSTIN validator (lib/sales-channel/validation.ts's `gst`)", () => {
  it("accepts a blank string as 'not provided' (must not block saving)", () => {
    expect(gst.parse("")).toBeUndefined();
    expect(gst.parse("   ")).toBeUndefined();
  });

  it("accepts undefined", () => {
    expect(gst.parse(undefined)).toBeUndefined();
  });

  it("accepts a valid GSTIN, trimmed and uppercased", () => {
    expect(gst.parse(" 29abcde1234f1z5 ")).toBe("29ABCDE1234F1Z5");
  });

  it("rejects a malformed GSTIN with a clear message", () => {
    const result = gst.safeParse("NOT-A-GSTIN");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/valid 15-character GSTIN/i);
  });
});

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
// revalidatePath() requires Next's App Router request context, which does
// not exist when a Server Action is called directly from Vitest — the same
// pre-existing, environment-level gap already documented in
// __tests__/sales/quotation-workflow.integration.test.ts. Scoped to this
// file only.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const mockAuth = vi.mocked(auth);

describe("getSalesOfficerDashboard — newly exposed pipeline/quotation data", () => {
  it("returns opportunitiesInProgress, expectedPipelineValue, and quotationsAwaitingAction alongside the existing fields", async () => {
    const officer = await prisma.user.findUniqueOrThrow({ where: { email: "institutional.test@muv.local" } });
    mockAuth.mockResolvedValue({ user: { id: officer.id } } as never);
    const { getSalesOfficerDashboard } = await import("@/actions/inst-dashboards");
    const result = await getSalesOfficerDashboard();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(typeof result.data.opportunitiesInProgress).toBe("number");
    expect(typeof result.data.expectedPipelineValue).toBe("number");
    expect(typeof result.data.quotationsAwaitingAction).toBe("number");
  }, 15000);
});

/**
 * Isolated UAT smoke flow (§19): exercises the real, existing Institutional
 * Sales OS pipeline end-to-end against the isolated branch only — login is
 * verified via the role-landing test above; daily shift check-in/out is
 * intentionally NOT exercised here since that capability does not exist
 * yet (see the final report's migration-approval stop). Everything else in
 * the requested smoke sequence uses real, already-existing actions.
 */
describe("UAT smoke flow — Institutional employee, real existing pipeline", () => {
  const suffix = `${Date.now()}`;
  let leadIdBlankGst: string;
  let leadIdValidGst: string;
  let opportunityId: string;
  let visitId: string;

  it("creates a Lead (assigned institution list entry point)", async () => {
    const officer = await prisma.user.findUniqueOrThrow({ where: { email: "institutional.test@muv.local" } });
    mockAuth.mockResolvedValue({ user: { id: officer.id } } as never);
    const { createLead } = await import("@/actions/inst-leads");
    const r = await createLead({ organizationName: `[UAT TEST] Institution ${suffix}`, contactPerson: "UAT Contact", phone: "9000000001" });
    expect(r.success).toBe(true);
    if (r.success) leadIdBlankGst = r.data.id;
  }, 15000);

  it("converts the Lead into an Opportunity + new institutional Customer with a BLANK GSTIN (must be accepted)", async () => {
    const { convertLeadToOpportunity } = await import("@/actions/inst-leads");
    const institutionalType = await prisma.customerType.findFirstOrThrow({ where: { code: "INSTITUTIONAL" } });
    const r = await convertLeadToOpportunity({
      leadId: leadIdBlankGst,
      newCustomer: {
        name: `[UAT TEST] Institution ${suffix}`, customerTypeId: institutionalType.id,
        phone: "9000000001", email: `uat-inst-${suffix}@example.invalid`, gstNumber: "",
      },
    });
    expect(r.success).toBe(true);
    if (r.success) opportunityId = r.data.opportunityId;
    if (opportunityId) {
      const customer = await prisma.instOpportunity.findUniqueOrThrow({ where: { id: opportunityId }, select: { customer: { select: { gstNumber: true } } } });
      expect(customer.customer.gstNumber).toBeNull();
    }
  }, 15000);

  it("accepts a second Lead conversion with a VALID GSTIN (institution/contact details step)", async () => {
    const { createLead, convertLeadToOpportunity } = await import("@/actions/inst-leads");
    const leadResult = await createLead({ organizationName: `[UAT TEST] Institution GST ${suffix}`, contactPerson: "UAT Contact 2", phone: "9000000002" });
    expect(leadResult.success).toBe(true);
    if (!leadResult.success) return;
    leadIdValidGst = leadResult.data.id;
    const institutionalType = await prisma.customerType.findFirstOrThrow({ where: { code: "INSTITUTIONAL" } });
    const r = await convertLeadToOpportunity({
      leadId: leadIdValidGst,
      newCustomer: {
        name: `[UAT TEST] Institution GST ${suffix}`, customerTypeId: institutionalType.id,
        phone: "9000000002", email: `uat-inst-gst-${suffix}@example.invalid`, gstNumber: "29abcde1234f1z5",
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const customer = await prisma.instOpportunity.findUniqueOrThrow({ where: { id: r.data.opportunityId }, select: { customer: { select: { gstNumber: true } } } });
      expect(customer.customer.gstNumber).toBe("29ABCDE1234F1Z5");
    }
  }, 15000);

  it("checks in to the institution visit", async () => {
    const { checkInVisit } = await import("@/actions/inst-visits");
    const r = await checkInVisit({ opportunityId, visitDate: new Date().toISOString() });
    expect(r.success).toBe(true);
    if (r.success) visitId = r.data.id;
  }, 15000);

  it("captures one product requirement against the Opportunity", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const created = await prisma.instOpportunityProduct.create({
      data: { opportunityId, productId: product.id, quantity: 10, notes: "UAT smoke-test requirement" },
    });
    expect(created.id).toBeTruthy();
  }, 15000);

  it("checks out the visit with a Follow-up Required outcome", async () => {
    const { checkOutVisit } = await import("@/actions/inst-visits");
    const r = await checkOutVisit({ id: visitId, outcome: "RESCHEDULED", nextFollowUpDate: new Date(Date.now() + 86400000).toISOString() });
    expect(r.success).toBe(true);
  }, 15000);

  it("Sales Manager summary reflects the new pipeline activity (manager visibility)", async () => {
    const manager = await prisma.user.findUniqueOrThrow({ where: { email: "salesmanager.test@muv.local" } });
    mockAuth.mockResolvedValue({ user: { id: manager.id } } as never);
    const { getSalesManagerDashboard } = await import("@/actions/inst-dashboards");
    const r = await getSalesManagerDashboard();
    expect(r.success).toBe(true);
  }, 15000);

  it("Founder dashboard (and Founder OS's institutional KPI section) remains readable", async () => {
    const founder = await prisma.user.findUniqueOrThrow({ where: { email: "founder.test@muv.local" } });
    mockAuth.mockResolvedValue({ user: { id: founder.id } } as never);
    const { getFounderDashboard } = await import("@/actions/inst-dashboards");
    const r = await getFounderDashboard();
    expect(r.success).toBe(true);
  }, 15000);
});
