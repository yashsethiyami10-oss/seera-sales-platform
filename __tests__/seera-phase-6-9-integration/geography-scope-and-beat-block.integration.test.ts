import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { resolveExecutiveOperationalScope, resolveManagerOperationalScope } from "@/lib/sales-distribution/scope";
import { assignExecutiveTerritory, createBeatPlan, publishBeatPlan } from "@/lib/sales-distribution/operational-service";

// Final Production Closure (23-Aug): root-cause regression coverage for the Manoj/Bhilwara <->
// Neeraj/Jhansi geography leakage (EXECUTIVE_TERRITORY assignments existed but nothing ever read
// them) and the "publish an empty Beat" gap. MANOJ_BHILWARA_SCOPE / NEERAJ_JHANSI_SCOPE /
// AWDHESH_JHANSI_MANAGER_SCOPE / EMPTY_BEAT_BLOCK from the mandated regression matrix.
const suffix = randomBytes(5).toString("hex");
let founder = "",
  manager = "",
  executiveA = "",
  executiveB = "",
  territoryA = "",
  territoryB = "",
  beatA = "",
  beatB = "",
  distributorA = "",
  distributorB = "";

describe("guarded Phase 6-9 authoritative geography scope + empty-Beat publish block", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    manager = roleUsers.get("SALES_MANAGER")!.id;
    executiveA = roleUsers.get("SALES_EXECUTIVE")!.id;
    // A second executive-role user, reusing an existing seeded role user rather than a parallel
    // fixture-creation path — Sales Head also carries field-force geography scope in production.
    executiveB = roleUsers.get("SALES_HEAD")!.id;
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "seera_retailers", "seera_assignments", "seera_partners", "seera_geography_nodes" CASCADE',
    );
    territoryA = (await prisma.seeraGeographyNode.create({ data: { code: `TERR-A-${suffix}`, name: `Territory A ${suffix}`, level: "TERRITORY", status: "ACTIVE" } })).id;
    territoryB = (await prisma.seeraGeographyNode.create({ data: { code: `TERR-B-${suffix}`, name: `Territory B ${suffix}`, level: "TERRITORY", status: "ACTIVE" } })).id;
    beatA = (await prisma.seeraGeographyNode.create({ data: { code: `BEAT-A-${suffix}`, name: `Beat A ${suffix}`, level: "BEAT", parentId: territoryA, status: "ACTIVE" } })).id;
    beatB = (await prisma.seeraGeographyNode.create({ data: { code: `BEAT-B-${suffix}`, name: `Beat B ${suffix}`, level: "BEAT", parentId: territoryB, status: "ACTIVE" } })).id;
    const partnerA = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `DA-${suffix}`, legalName: `Distributor A ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000010" }, addresses: {}, territoryIds: [territoryA], createdById: founder } });
    const partnerB = await prisma.seeraPartner.create({ data: { type: "DISTRIBUTOR", code: `DB-${suffix}`, legalName: `Distributor B ${suffix}`, lifecycle: "ACTIVE", primaryContact: { mobile: "9000000011" }, addresses: {}, territoryIds: [territoryB], createdById: founder } });
    distributorA = partnerA.id;
    distributorB = partnerB.id;
    await prisma.seeraAssignment.create({ data: { assignmentType: "MANAGER_TEAM", subjectType: "USER", subjectId: executiveA, targetType: "USER", targetId: manager, effectiveFrom: new Date("2026-01-01"), reason: "scope test", createdById: founder } });
    // Executive A -> Territory A only (mirrors "Manoj -> Bhilwara"). Executive B and the Manager
    // themselves get no direct assignment yet — used below to prove the explicit-empty-scope rule.
    await assignExecutiveTerritory(prisma, founder, { userId: executiveA, territoryId: territoryA, reason: "scope test" });
  }, 240000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 240000);

  it("MANOJ_BHILWARA_SCOPE / NEERAJ_JHANSI_SCOPE: an Executive assigned to one Territory sees only that Territory's Beats/Distributors, never the other's", async () => {
    const scope = await resolveExecutiveOperationalScope(prisma, executiveA);
    expect(scope.unrestricted).toBe(false);
    expect(scope.territoryIds).toEqual([territoryA]);
    expect(scope.beatIds).toEqual([beatA]);
    expect(scope.distributorIds).toEqual([distributorA]);
    expect(scope.beatIds).not.toContain(beatB);
    expect(scope.distributorIds).not.toContain(distributorB);
  });

  it("no global fallback: an Executive with zero Territory assignments gets an explicitly EMPTY scope, never every Territory", async () => {
    const scope = await resolveExecutiveOperationalScope(prisma, executiveB);
    expect(scope.unrestricted).toBe(false);
    expect(scope.territoryIds).toEqual([]);
    expect(scope.beatIds).toEqual([]);
    expect(scope.distributorIds).toEqual([]);
  });

  it("AWDHESH_JHANSI_MANAGER_SCOPE: a Manager's scope is the union of their team's Territory assignments, not every Territory globally", async () => {
    const scope = await resolveManagerOperationalScope(prisma, manager);
    expect(scope.unrestricted).toBe(false);
    expect(scope.territoryIds).toEqual([territoryA]);
    expect(scope.distributorIds).toEqual([distributorA]);
    expect(scope.distributorIds).not.toContain(distributorB);
  });

  it("BEAT_PUBLISH_HANDOFF / territory scope enforced server-side: createBeatPlan rejects a Territory outside the Manager's authorized scope even by exact name", async () => {
    await expect(
      createBeatPlan(prisma, manager, {
        employeeId: executiveA,
        territoryName: `Territory B ${suffix}`,
        beatName: `Beat B ${suffix}`,
        geographyType: "TOWN",
        geographyName: "Some Town",
        dayOfWeek: 1,
        effectiveFrom: new Date("2026-09-01"),
        publish: false,
      }),
    ).rejects.toMatchObject({ code: "TERRITORY_OUT_OF_SCOPE" });
  });

  it("EMPTY_BEAT_BLOCK: publishing a Beat with zero active retailers mapped is blocked, not a silent warning", async () => {
    const draft = await createBeatPlan(prisma, manager, {
      employeeId: executiveA,
      territoryName: `Territory A ${suffix}`,
      beatName: `Beat A ${suffix}`,
      geographyType: "TOWN",
      geographyName: "Some Town",
      dayOfWeek: 2,
      effectiveFrom: new Date("2026-09-02"),
      publish: false,
    });
    expect(draft.status).toBe("DRAFT");
    expect(draft.retailerCount).toBe(0);
    await expect(publishBeatPlan(prisma, manager, draft.id)).rejects.toMatchObject({ code: "BEAT_HAS_NO_RETAILERS" });
    await expect(
      createBeatPlan(prisma, manager, {
        employeeId: executiveA,
        territoryName: `Territory A ${suffix}`,
        beatName: `Beat A ${suffix}`,
        geographyType: "TOWN",
        geographyName: "Another Town",
        dayOfWeek: 3,
        effectiveFrom: new Date("2026-09-03"),
        publish: true,
      }),
    ).rejects.toMatchObject({ code: "BEAT_HAS_NO_RETAILERS" });
  });

  it("publish succeeds once at least one active retailer is actually mapped to the Beat", async () => {
    await prisma.seeraRetailer.create({
      data: {
        code: `RT-${suffix}`,
        businessName: "Scope Test Retailer",
        normalizedMobile: "",
        address: { city: "Test" },
        salespersonId: executiveA,
        distributorId: distributorA,
        territoryId: territoryA,
        beatId: beatA,
        lifecycle: "ACTIVE",
        createdById: founder,
      },
    });
    const draft = await createBeatPlan(prisma, manager, {
      employeeId: executiveA,
      territoryName: `Territory A ${suffix}`,
      beatName: `Beat A ${suffix}`,
      geographyType: "TOWN",
      geographyName: "Some Town",
      dayOfWeek: 4,
      effectiveFrom: new Date("2026-09-04"),
      publish: false,
    });
    expect(draft.retailerCount).toBe(1);
    const published = await publishBeatPlan(prisma, manager, draft.id);
    expect(published.status).toBe("PUBLISHED");
  });
});
