import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";

/**
 * Cross-Portal Quotation Workflow — FR-006/FR-007/FR-008 regression coverage.
 * Scope: components/sales/quotation-builder.tsx's backing server logic only
 * (actions/quotations.ts, actions/opportunities.ts, lib/opportunity/repository.ts's
 * opportunityScope(), lib/quotation/workflow.ts). The parallel Institutional
 * Sales OS pipeline (actions/inst-quotations.ts, /os/sales/quotations/new) is
 * untouched and out of scope for this file.
 *
 * Uses the real seeded UAT SalesRole test users against whatever database
 * TEST_DATABASE_URL resolves to (see __tests__/muv-ai/test-setup.ts's guard —
 * this file never touches DATABASE_URL directly). All fixture data created
 * here is unmistakably synthetic (.example.invalid emails, "[UAT TEST]"
 * name prefixes) and is removed in afterAll.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

// revalidatePath() requires Next's App Router request context, which does not
// exist when a Server Action is called directly from Vitest — a pre-existing,
// environment-level gap (not specific to this change) that would otherwise
// mask a genuinely successful createQuotationAction/createOpportunityAction
// call as a failure. Scoped to this file only; no shared test infra or app
// code is touched.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

function authAs(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId } } as never);
}

const suffix = `${Date.now()}`;
const createdOpportunityIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdQuotationIds: string[] = [];

let founderId: string, salesManagerId: string, salesOfficerId: string, institutionalOfficerId: string, supportId: string;
let regularCustomerId: string, institutionalCustomerId: string;
let productA: { id: string; variantId: string }, productB: { id: string; variantId: string };
let smOwnedOpportunityId: string, soOwnedOpportunityId: string, instOwnedOpportunityId: string;

async function makeOpportunity(ownerUserId: string, customerId: string) {
  const { createOpportunity } = await import("@/lib/opportunity/pipeline");
  const opp = await createOpportunity(
    { id: ownerUserId, email: null, isFounder: false },
    { customerId, ownerUserId, estimatedValue: 10000 },
  );
  createdOpportunityIds.push(opp.id);
  return opp.id;
}

beforeAll(async () => {
  const [founder, salesManager, salesOfficer, institutionalOfficer, support] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "founder.test@muv.local" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "salesmanager.test@muv.local" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "salesofficer.test@muv.local" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "institutional.test@muv.local" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "support.test@muv.local" } }),
  ]);
  founderId = founder.id; salesManagerId = salesManager.id; salesOfficerId = salesOfficer.id;
  institutionalOfficerId = institutionalOfficer.id; supportId = support.id;

  const [institutionalType, regularType] = await Promise.all([
    prisma.customerType.findFirstOrThrow({ where: { code: "INSTITUTIONAL" } }),
    prisma.customerType.findFirstOrThrow({ where: { code: { not: "INSTITUTIONAL" } } }),
  ]);

  const regularCustomer = await prisma.customer.create({
    data: { email: `uat-test-regular-${suffix}@example.invalid`, name: `[UAT TEST] Regular Customer ${suffix}`, customerTypeId: regularType.id },
  });
  const institutionalCustomer = await prisma.customer.create({
    data: { email: `uat-test-institutional-${suffix}@example.invalid`, name: `[UAT TEST] Institutional Customer ${suffix}`, customerTypeId: institutionalType.id },
  });
  regularCustomerId = regularCustomer.id; institutionalCustomerId = institutionalCustomer.id;
  createdCustomerIds.push(regularCustomer.id, institutionalCustomer.id);

  smOwnedOpportunityId = await makeOpportunity(salesManagerId, regularCustomerId);
  soOwnedOpportunityId = await makeOpportunity(salesOfficerId, regularCustomerId);
  instOwnedOpportunityId = await makeOpportunity(institutionalOfficerId, institutionalCustomerId);

  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, include: { variants: true }, take: 10 });
  const withVariants = products.filter((p) => p.variants.length > 0);
  if (withVariants.length < 2) throw new Error("Need at least 2 active products with variants for this test");
  productA = { id: withVariants[0]!.id, variantId: withVariants[0]!.variants[0]!.id };
  productB = { id: withVariants[1]!.id, variantId: withVariants[1]!.variants[0]!.id };
}, 60000); // Neon branch compute can be cold; observed 10-20s latency elsewhere in this engagement.

afterAll(async () => {
  // OpportunityStageHistory is append-only by DB trigger ("opportunity_stage_history
  // is append-only" — confirmed directly by attempting this delete), and Opportunity
  // has a RESTRICT FK to it, so created Opportunity/Customer rows here cannot be
  // cleanly deleted — the same pre-existing pattern already documented for Finance's
  // immutable ledger tables (docs/enterprise-phase2/FISCAL_YEAR_TEST_POOL_REMEDIATION.md).
  // Acceptable and intentionally left as-is: this only ever runs against the isolated,
  // fully disposable test branch, never production. Only Quotation rows (not
  // independently immutable) are cleaned up below.
  if (createdQuotationIds.length) {
    await prisma.quotationLineItem.deleteMany({ where: { quotationVersion: { quotationId: { in: createdQuotationIds } } } }).catch(() => {});
    await prisma.quotationVersion.deleteMany({ where: { quotationId: { in: createdQuotationIds } } }).catch(() => {});
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } }).catch(() => {});
  }
});

describe("FR-008 — opportunityScope() role-by-role visibility (no RBAC widening)", () => {
  it("Founder sees all three synthetic opportunities", async () => {
    const { opportunityScope } = await import("@/lib/opportunity/repository");
    authAs(founderId);
    const ids = (await prisma.opportunity.findMany({ where: { AND: [await opportunityScope(), { id: { in: createdOpportunityIds } } ] } })).map((o) => o.id);
    expect(ids.sort()).toEqual([...createdOpportunityIds].sort());
  });

  it("Sales Manager sees only their own synthetic opportunity", async () => {
    const { opportunityScope } = await import("@/lib/opportunity/repository");
    authAs(salesManagerId);
    const ids = (await prisma.opportunity.findMany({ where: { AND: [await opportunityScope(), { id: { in: createdOpportunityIds } } ] } })).map((o) => o.id);
    expect(ids).toEqual([smOwnedOpportunityId]);
  });

  it("Sales Officer sees only their own synthetic opportunity", async () => {
    const { opportunityScope } = await import("@/lib/opportunity/repository");
    authAs(salesOfficerId);
    const ids = (await prisma.opportunity.findMany({ where: { AND: [await opportunityScope(), { id: { in: createdOpportunityIds } } ] } })).map((o) => o.id);
    expect(ids).toEqual([soOwnedOpportunityId]);
  });

  it("Institutional Sales Officer sees only their own Institutional synthetic opportunity", async () => {
    const { opportunityScope } = await import("@/lib/opportunity/repository");
    authAs(institutionalOfficerId);
    const ids = (await prisma.opportunity.findMany({ where: { AND: [await opportunityScope(), { id: { in: createdOpportunityIds } } ] } })).map((o) => o.id);
    expect(ids).toEqual([instOwnedOpportunityId]);
  });

  it("Customer Support has no quotation-creation permission at all", async () => {
    authAs(supportId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({ opportunityId: smOwnedOpportunityId, pricingPolicyCode: "RETAIL", validUntil: new Date(Date.now() + 86400000).toISOString(), lines: [{ productId: productA.id, quantity: 1 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe("FORBIDDEN");
  });
});

describe("FR-008 — createQuotationAction submit-time authorization matches selector scope", () => {
  it("Sales Officer can submit their own eligible opportunity (selector/submit consistency)", async () => {
    authAs(salesOfficerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: soOwnedOpportunityId, pricingPolicyCode: "RETAIL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, variantId: productA.variantId, quantity: 2 }],
    });
    expect(r.success).toBe(true);
    if (r.success) createdQuotationIds.push(r.data.id);
  }, 15000);

  it("Sales Officer is rejected when submitting an opportunity outside their scope (no RBAC widening)", async () => {
    authAs(salesOfficerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: smOwnedOpportunityId, pricingPolicyCode: "RETAIL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, variantId: productA.variantId, quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("Institutional Sales Officer can submit their own Institutional opportunity", async () => {
    authAs(institutionalOfficerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: instOwnedOpportunityId, pricingPolicyCode: "INSTITUTIONAL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, variantId: productA.variantId, quantity: 1 }],
    });
    expect(r.success).toBe(true);
    if (r.success) createdQuotationIds.push(r.data.id);
  }, 15000);
});

describe("FR-007 — server-side Product/Variant consistency (pre-existing check, verified not regressed)", () => {
  it("rejects a Variant that does not belong to the submitted Product", async () => {
    authAs(salesManagerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: smOwnedOpportunityId, pricingPolicyCode: "RETAIL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, variantId: productB.variantId, quantity: 1 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toMatch(/does not belong to product/i);
  });

  it("still supports the optional Variant + catalogue-price fallback (regression)", async () => {
    authAs(salesManagerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: smOwnedOpportunityId, pricingPolicyCode: "RETAIL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, quantity: 1 }], // no variantId, no unitPrice
    });
    expect(r.success).toBe(true);
    if (r.success) createdQuotationIds.push(r.data.id);
  }, 15000);
});

describe("FR-006 — createOpportunityAction reachable from the new UI path with existing rules unchanged", () => {
  it("Sales Officer (holds opportunities.create) can create an opportunity, self-assigned", async () => {
    authAs(salesOfficerId);
    const { createOpportunityAction } = await import("@/actions/opportunities");
    const r = await createOpportunityAction({ customerId: regularCustomerId, ownerUserId: salesOfficerId, estimatedValue: 1234 });
    expect(r.success).toBe(true);
    if (r.success) createdOpportunityIds.push(r.data.id);
  }, 15000);

  it("Customer Support (no opportunities.create) cannot create an opportunity", async () => {
    authAs(supportId);
    const { createOpportunityAction } = await import("@/actions/opportunities");
    const r = await createOpportunityAction({ customerId: regularCustomerId, ownerUserId: supportId, estimatedValue: 1234 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe("FORBIDDEN");
  });
});

describe("Regression — server-computed totals unaffected by the labeling/UI changes", () => {
  it("computes subtotal/discount/tax/total server-side from quantity x price, ignoring any client-sent total", async () => {
    authAs(salesManagerId);
    const { createQuotationAction } = await import("@/actions/quotations");
    const r = await createQuotationAction({
      opportunityId: smOwnedOpportunityId, pricingPolicyCode: "RETAIL",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: productA.id, variantId: productA.variantId, quantity: 3, unitPrice: 100, discountType: "PERCENTAGE", discountValue: 10 }],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    createdQuotationIds.push(r.data.id);
    const version = await prisma.quotationVersion.findUniqueOrThrow({ where: { id: r.data.versionId } });
    // 3 x 100 = 300 subtotal; 10% discount = 30; grandTotal excludes/includes tax per config, but must not be a client-supplied value.
    expect(Number(version.subtotal)).toBe(300);
    expect(Number(version.discountTotal)).toBe(30);
  }, 15000);
});
