import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { EnterprisePrincipal } from "@/lib/enterprise/context";

let actor: EnterprisePrincipal;
vi.mock("@/lib/enterprise-network/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/enterprise-network/context")>("@/lib/enterprise-network/context");
  return {
    ...actual,
    requireNetworkPrincipal: async () => actor,
    requirePortalAdminPrincipal: async () => actor,
    requirePortalPrincipal: async (userId: string) => {
      const mapping = await prisma.networkPartnerUser.findFirstOrThrow({
        where: { organizationKey: actor.organizationKey, userId, status: "ACTIVE" }, include: { partner: true },
      });
      return { principal: actor, mapping };
    },
  };
});

import { attributeOrderToPartner } from "@/lib/enterprise-network/attribution-service";
import { calculateCommercialRun, correctCommercialRun } from "@/lib/enterprise-network/commercial-service";
import { createPartner, assignPartnerParent, closePartnerParentAssignment, getPartnerHierarchy } from "@/lib/enterprise-network/partner-service";
import { assignPartnerTerritory, closeTerritoryAssignment, createClaim, transitionClaim } from "@/lib/enterprise-network/operations-service";
import { amendAgreement } from "@/lib/enterprise-network/governance-service";
import {
  createComplianceRequirementVersion, createTargetPlan, createTrainingProgramVersion, deriveTargetAchievement,
  openPartnerSupportCase, transitionSupportCase, assignPartnerTraining, completePartnerTraining, recordPartnerCompliance,
} from "@/lib/enterprise-network/enablement-service";
import { grantPartnerPortalAccess, portalPartnerSummary } from "@/lib/enterprise-network/integration-service";

const suffix = `p3br_${Date.now()}_${Math.random().toString(16).slice(2)}`;
let userIds: string[] = [];
let orderId = "";
let orderTotal = 0;
let originalPaymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" = "PENDING";
let partnerA = "";
let partnerB = "";
const extraPartnerIds: string[] = [];

describe("Part 3B-R actual Business Services and database controls", () => {
  beforeAll(async () => {
    const users = await prisma.user.findMany({ where: { active: true }, take: 2, orderBy: { createdAt: "asc" } });
    if (users.length < 2) throw new Error("Two active users are required");
    userIds = users.map((user) => user.id);
    actor = { id: userIds[0]!, email: users[0]!.email, roleName: "Founder", isFounder: true, permissions: new Set(), organizationKey: "MUV" };
    // Deterministic, test-owned Order fixture (Enterprise UI Integration
    // carried-forward requirement #6). Previously this had to fall back
    // to `findFirst` against accumulated dev data because creating a real
    // Order here hit a genuine, separate pre-existing bug in the shared
    // `assign_commerce_numbers()` trigger (see
    // prisma/migrations/20260801100000_commerce_number_trigger_remediation
    // for the full root-cause writeup and fix — it replaced that shared
    // function with five single-table functions). With that fixed, this
    // fixture is now fully self-contained: a real Customer/Address/Order
    // created here, tagged with `suffix`, and torn down in `afterAll`.
    const fixtureCustomer = await prisma.customer.create({
      data: { email: `${suffix}-customer@example.test`, name: `${suffix} Test Customer` },
    });
    const fixtureAddress = await prisma.address.create({
      data: { customerId: fixtureCustomer.id, label: "Test", line1: "1 Test Street", city: "Mumbai", state: "Maharashtra", pincode: "400001", phone: "9999999999" },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `${suffix}-ORDER`, customerId: fixtureCustomer.id, addressId: fixtureAddress.id,
        paymentMethod: "UPI", paymentStatus: "PAID", subtotal: 5000, total: 5000,
      },
    });
    orderId = order.id; orderTotal = order.total;
    originalPaymentStatus = "PENDING";
    const partners = await Promise.all(["A", "B"].map((label) => prisma.networkPartner.create({ data: {
      organizationKey: "MUV", partnerNumber: `${suffix}-${label}`, legalName: `${suffix} Partner ${label}`,
      partnerType: "DISTRIBUTOR", lifecycleStatus: "ACTIVE", activationStatus: "ACTIVE",
      complianceStatus: "COMPLIANT", approvalStatus: "APPROVED", createdById: actor.id,
    } })));
    partnerA = partners[0]!.id; partnerB = partners[1]!.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe("SET session_replication_role = replica");
    try {
      await prisma.phase2Operation.deleteMany({ where: { operationType: { contains: suffix } } });
      await prisma.phase2SourceReference.deleteMany({ where: { OR: [{ sourceEntityId: { contains: suffix } }, { targetEntityId: { in: [partnerA, partnerB, ...extraPartnerIds] } }] } });
      await prisma.salesTimelineEvent.deleteMany({ where: { description: { contains: suffix } } });
      await prisma.salesAuditLog.deleteMany({ where: { module: "enterprise_network", OR: [{ recordId: { in: [partnerA, partnerB] } }, { newValue: { path: ["state", "testKey"], equals: suffix } }] } });
      await prisma.networkPartnerOrderSource.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkRoyaltyLine.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkCommissionLine.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkRoyaltyRun.deleteMany({ where: { organizationKey: "MUV", correctionReason: { contains: suffix } } });
      await prisma.networkCommissionRun.deleteMany({ where: { organizationKey: "MUV", correctionReason: { contains: suffix } } });
      await prisma.networkTargetLine.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkTargetPlan.deleteMany({ where: { organizationKey: "MUV", planKey: { contains: suffix } } });
      await prisma.networkPartnerHierarchy.deleteMany({ where: { organizationKey: "MUV", OR: [{ parentPartnerId: { in: [partnerA, partnerB] } }, { childPartnerId: { in: [partnerA, partnerB] } }] } });
      await prisma.networkTerritoryAssignment.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkTerritory.deleteMany({ where: { organizationKey: "MUV", territoryKey: { contains: suffix } } });
      await prisma.networkClaim.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkSupportCase.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkComplianceRecord.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkComplianceRequirement.deleteMany({ where: { organizationKey: "MUV", requirementKey: { contains: suffix } } });
      await prisma.networkTrainingAssignment.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.networkTrainingProgram.deleteMany({ where: { organizationKey: "MUV", programKey: { contains: suffix } } });
      await prisma.networkAgreement.deleteMany({ where: { organizationKey: "MUV", agreementKey: { contains: suffix } } });
      await prisma.networkPartnerUser.deleteMany({ where: { organizationKey: "MUV", partnerId: { in: [partnerA, partnerB] } } });
      await prisma.phase2PolicyVersion.deleteMany({ where: { organizationKey: "MUV", policyKey: `${suffix}-DISTRIBUTOR` } });
      await prisma.networkPartner.deleteMany({ where: { id: { in: [partnerA, partnerB] } } });
      await prisma.networkPartnerProfile.deleteMany({ where: { partnerId: { in: extraPartnerIds } } });
      await prisma.networkPartner.deleteMany({ where: { id: { in: extraPartnerIds } } });
      await prisma.order.updateMany({ where: { id: orderId }, data: { paymentStatus: originalPaymentStatus } });
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, addressId: true } });
      await prisma.order.deleteMany({ where: { id: orderId } });
      if (order) {
        await prisma.address.deleteMany({ where: { id: order.addressId } });
        await prisma.customer.deleteMany({ where: { id: order.customerId } });
      }
    } finally {
      await prisma.$executeRawUnsafe("SET session_replication_role = origin");
    }
  });

  it("creates partner provenance and rejects database cross-organization children", async () => {
    const created = await createPartner({ legalName: `${suffix} Provenance`, partnerType: "OUTLET" });
    extraPartnerIds.push(created.id);
    expect(await prisma.phase2SourceReference.count({ where: { targetEntityType: "NetworkPartner", targetEntityId: created.id } })).toBe(1);
    await expect(prisma.networkPartnerContact.create({ data: {
      organizationKey: "OTHER", partnerId: created.id, contactType: "PRIMARY", name: "Cross Org",
    } })).rejects.toThrow(/Cross-organization/);
  });

  it("attributes royalty, commission, and targets only to partner-owned source rows", async () => {
    const amountA = Math.floor(orderTotal / 4), amountB = Math.floor(orderTotal / 2);
    const sourceA = await attributeOrderToPartner({ partnerId: partnerA, orderId, metricKey: "REVENUE", territoryKey: `${suffix}-T`, attributedAmount: amountA, effectiveAt: new Date() });
    await attributeOrderToPartner({ partnerId: partnerB, orderId, metricKey: "REVENUE", territoryKey: `${suffix}-T`, attributedAmount: amountB, effectiveAt: new Date() });
    await expect(prisma.networkPartnerOrderSource.update({ where: { id: sourceA.id }, data: { attributedAmount: amountA + 1 } })).rejects.toThrow(/immutable/);
    for (const policyType of ["ROYALTY", "COMMISSION"]) await prisma.phase2PolicyVersion.create({ data: {
      organizationKey: "MUV", policyType, policyKey: `${suffix}-DISTRIBUTOR`, version: 1, status: "FINALIZED",
      effectiveFrom: new Date(0), configuration: { mode: "PERCENTAGE", ratePercent: 10 }, createdById: actor.id,
    } });
    await prisma.networkPartner.updateMany({ where: { id: { in: [partnerA, partnerB] } }, data: { partnerType: `${suffix}-DISTRIBUTOR` } });
    const periodStart = new Date(Date.now() - 86_400_000), periodEnd = new Date(Date.now() + 86_400_000);
    const royalty = await calculateCommercialRun("ROYALTY", { periodStart, periodEnd, partnerIds: [partnerA, partnerB], idempotencyKey: `${suffix}:royalty` });
    const commission = await calculateCommercialRun("COMMISSION", { periodStart, periodEnd, partnerIds: [partnerA, partnerB], idempotencyKey: `${suffix}:commission` });
    expect(royalty.lines.map((line) => Number(line.basisAmount)).sort((a, b) => a - b)).toEqual([amountA, amountB]);
    expect(commission.lines.map((line) => Number(line.basisAmount)).sort((a, b) => a - b)).toEqual([amountA, amountB]);
    const replay = await calculateCommercialRun("ROYALTY", { periodStart, periodEnd, partnerIds: [partnerA, partnerB], idempotencyKey: `${suffix}:royalty` });
    expect(replay.id).toBe(royalty.id);
    const concurrent = await Promise.all([
      calculateCommercialRun("COMMISSION", { periodStart, periodEnd, partnerIds: [partnerA], idempotencyKey: `${suffix}:commission-concurrent` }),
      calculateCommercialRun("COMMISSION", { periodStart, periodEnd, partnerIds: [partnerA], idempotencyKey: `${suffix}:commission-concurrent` }),
    ]);
    expect(new Set(concurrent.map((run) => run.id)).size).toBe(1);
    const plan = await createTargetPlan({ planKey: suffix, name: suffix, periodStart, periodEnd, lines: [
      { partnerId: partnerA, metricKey: "REVENUE", targetValue: amountA * 2, sourceRule: { territoryKey: `${suffix}-T` } },
      { partnerId: partnerB, metricKey: "REVENUE", targetValue: amountB * 2, sourceRule: { territoryKey: `${suffix}-T` } },
    ] });
    const achievement = await deriveTargetAchievement(plan.id);
    expect(achievement.map((row) => row.achieved).sort((a, b) => a - b)).toEqual([amountA, amountB]);
  });

  it("preserves hierarchy and territory history while rejecting overlap", async () => {
    const hierarchy = await assignPartnerParent({ hierarchyType: suffix, parentPartnerId: partnerA, childPartnerId: partnerB, effectiveFrom: new Date(Date.now() - 1000) });
    expect((await getPartnerHierarchy(partnerB, "ANCESTORS")).map((row) => row.partnerId)).toContain(partnerA);
    const closed = await closePartnerParentAssignment(hierarchy.id, new Date(), "test reassignment");
    expect(closed.status).toBe("ENDED");
    const territory = await prisma.networkTerritory.create({ data: { organizationKey: "MUV", territoryKey: suffix, version: 1, name: suffix, territoryType: "TEST", status: "ACTIVE", effectiveFrom: new Date(0), createdById: actor.id } });
    const assignment = await assignPartnerTerritory({ territoryId: territory.id, partnerId: partnerA, assignmentType: suffix, effectiveFrom: new Date(Date.now() - 1000) });
    await expect(assignPartnerTerritory({ territoryId: territory.id, partnerId: partnerA, assignmentType: suffix, effectiveFrom: new Date() })).rejects.toThrow(/overlapping/);
    expect((await closeTerritoryAssignment(assignment.id, new Date())).status).toBe("ENDED");
  });

  it("creates agreement successor without changing finalized terms", async () => {
    const current = await prisma.networkAgreement.create({ data: {
      organizationKey: "MUV", agreementKey: suffix, agreementNumber: `${suffix}-AGR-1`, partnerId: partnerA,
      agreementType: "DISTRIBUTION", version: 1, status: "ACTIVE", effectiveFrom: new Date(0),
      terms: { rate: 1 }, preparedById: actor.id,
    } });
    const successor = await amendAgreement(current.id, { effectiveFrom: new Date(), terms: { rate: 2 }, documentRefs: [] }, `${suffix} correction`);
    expect(successor.previousVersionId).toBe(current.id);
    expect((await prisma.networkAgreement.findUniqueOrThrow({ where: { id: current.id } })).status).toBe("SUPERSEDED");
    await expect(prisma.networkAgreement.update({ where: { id: current.id }, data: { terms: { rate: 9 } } })).rejects.toThrow(/immutable/);
  });

  it("supports partial claim approval, support lifecycle, training, compliance, and portal isolation", async () => {
    const claim = await createClaim({ partnerId: partnerA, claimType: "TEST", amount: 100, description: suffix });
    await transitionClaim(claim.id, "SUBMITTED"); await transitionClaim(claim.id, "UNDER_REVIEW");
    actor = { ...actor, id: userIds[1]! };
    const partial = await transitionClaim(claim.id, "PARTIALLY_APPROVED", undefined, 40);
    expect(Number(partial.approvedAmount)).toBe(40); expect(Number(partial.remainingAmount)).toBe(60);
    actor = { ...actor, id: userIds[0]! };
    const support = await openPartnerSupportCase({ partnerId: partnerA, category: "TEST", subject: suffix, description: suffix });
    await transitionSupportCase(support.id, "ASSIGNED", { assignedToId: actor.id });
    await transitionSupportCase(support.id, "IN_PROGRESS");
    await transitionSupportCase(support.id, "RESOLVED", { resolution: "verified" });
    expect((await transitionSupportCase(support.id, "CLOSED")).status).toBe("CLOSED");
    const program = await createTrainingProgramVersion({ programKey: suffix, title: suffix, validForDays: 30 });
    await prisma.networkTrainingProgram.update({ where: { id: program.id }, data: { status: "ACTIVE" } });
    const training = await assignPartnerTraining(program.id, partnerA);
    await completePartnerTraining(training.id, ["evidence:test"], `${suffix}-CERT`);
    const requirement = await createComplianceRequirementVersion({ requirementKey: suffix, name: suffix, trainingProgramId: program.id, effectiveFrom: new Date(0) });
    const compliance = await recordPartnerCompliance({ requirementId: requirement.id, partnerId: partnerA, status: "COMPLIANT", evidenceRefs: ["evidence:test"] });
    expect(compliance.status).toBe("COMPLIANT");
    const mapping = await grantPartnerPortalAccess({ partnerId: partnerA, userId: userIds[1]!, role: "PARTNER_USER", permissions: ["SUMMARY_VIEW"] });
    expect((await portalPartnerSummary(userIds[1]!, partnerA)).partnerId).toBe(partnerA);
    await expect(portalPartnerSummary(userIds[1]!, partnerB)).rejects.toThrow(/Cross-partner/);
    expect(mapping.status).toBe("ACTIVE");
  });

  it("creates immutable correction successors and blocks finalized direct mutation", async () => {
    const policy = await prisma.phase2PolicyVersion.findFirstOrThrow({ where: { organizationKey: "MUV", policyType: "ROYALTY", policyKey: `${suffix}-DISTRIBUTOR` } });
    const original = await prisma.networkRoyaltyRun.create({ data: {
      organizationKey: "MUV", runNumber: `${suffix}-FINAL`, periodStart: new Date(0), periodEnd: new Date(),
      status: "FINALIZED", sourceSnapshotHash: suffix, policySnapshot: [{ id: policy.id }], totalAmount: 10,
      preparedById: actor.id, finalizedAt: new Date(), correctionReason: suffix,
      lines: { create: { organizationKey: "MUV", partnerId: partnerA, sourceType: "TEST", sourceId: suffix, policyVersionId: policy.id, basisAmount: 100, calculatedAmount: 10, calculation: { testKey: suffix } } },
    } });
    await expect(prisma.networkRoyaltyRun.update({ where: { id: original.id }, data: { totalAmount: 99 } })).rejects.toThrow(/immutable/);
    const reversal = await correctCommercialRun("ROYALTY", original.id, `${suffix}:correction`, `${suffix} correction`);
    expect(reversal.reversalOfId).toBe(original.id);
    expect(Number(reversal.totalAmount)).toBe(-10);
    const commissionPolicy = await prisma.phase2PolicyVersion.findFirstOrThrow({ where: { organizationKey: "MUV", policyType: "COMMISSION", policyKey: `${suffix}-DISTRIBUTOR` } });
    const commission = await prisma.networkCommissionRun.create({ data: {
      organizationKey: "MUV", runNumber: `${suffix}-COM-FINAL`, periodStart: new Date(0), periodEnd: new Date(),
      status: "FINALIZED", sourceSnapshotHash: suffix, policySnapshot: [{ id: commissionPolicy.id }], totalAmount: 12,
      preparedById: actor.id, finalizedAt: new Date(), correctionReason: suffix,
      lines: { create: { organizationKey: "MUV", partnerId: partnerA, sourceType: "TEST", sourceId: `${suffix}-COM`, policyVersionId: commissionPolicy.id, basisAmount: 120, calculatedAmount: 12, calculation: { testKey: suffix } } },
    } });
    const commissionReversal = await correctCommercialRun("COMMISSION", commission.id, `${suffix}:commission-correction`, `${suffix} correction`);
    expect(commissionReversal.reversalOfId).toBe(commission.id);
    expect(Number(commissionReversal.totalAmount)).toBe(-12);
  });
});
