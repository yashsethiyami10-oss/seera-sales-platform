import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, roleUsers, setup } from "@/__tests__/seera-block3/test-context";
import { createBeatPlan, publishBeatPlan, assignExecutiveTerritory } from "@/lib/sales-distribution/operational-service";
import { executiveBeat } from "@/lib/sales-distribution/field-portal-service";

// Final closure (23-Aug), Part 1: a PUBLISHED plan must freeze its retailer membership at publish
// time — editing a retailer's Beat mapping afterward must not silently change what the Executive
// already saw for that plan. Regression coverage for the mandated test: "publish with 3 retailers
// -> change one retailer's Beat later -> existing published plan still shows original 3 stops."
const suffix = randomBytes(5).toString("hex");
let founder = "", manager = "", executive = "", territoryId = "", beatId = "", otherBeatId = "";
const retailerIds: string[] = [];

describe("guarded Phase 6-9 Beat Plan stop snapshot immutability", () => {
  beforeAll(async () => {
    await setup();
    founder = (await prisma.user.findFirstOrThrow({ where: { roleAssignments: { some: { role: { code: "FOUNDER_SUPER_ADMIN" } } } } })).id;
    manager = roleUsers.get("SALES_MANAGER")!.id;
    executive = roleUsers.get("SALES_EXECUTIVE")!.id;
    await prisma.seeraAssignment.create({ data: { assignmentType: "MANAGER_TEAM", subjectType: "USER", subjectId: executive, targetType: "USER", targetId: manager, effectiveFrom: new Date("2026-01-01"), reason: "stop snapshot test", createdById: founder } });
    const territory = await prisma.seeraGeographyNode.create({ data: { code: `STOP-TERR-${suffix}`, name: `Stop Territory ${suffix}`, level: "TERRITORY", status: "ACTIVE" } });
    territoryId = territory.id;
    await assignExecutiveTerritory(prisma, founder, { userId: manager, territoryId, reason: "stop snapshot test" });
    const beat = await prisma.seeraGeographyNode.create({ data: { code: `STOP-BEAT-${suffix}`, name: `Stop Beat ${suffix}`, level: "BEAT", parentId: territoryId, status: "ACTIVE" } });
    beatId = beat.id;
    const otherBeat = await prisma.seeraGeographyNode.create({ data: { code: `STOP-BEAT-OTHER-${suffix}`, name: `Other Beat ${suffix}`, level: "BEAT", parentId: territoryId, status: "ACTIVE" } });
    otherBeatId = otherBeat.id;
    for (let i = 0; i < 3; i++) {
      const r = await prisma.seeraRetailer.create({
        data: { code: `STOP-RT-${suffix}-${i}`, businessName: `Stop Snapshot Retailer ${i} ${suffix}`, normalizedMobile: "", address: { city: "Test" }, salespersonId: executive, territoryId, beatId, lifecycle: "ACTIVE", createdById: founder },
      });
      retailerIds.push(r.id);
    }
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  }, 120000);

  it("freezes exactly the 3 active retailers as stops at publish time, atomically with the status change", async () => {
    const plan = await createBeatPlan(prisma, manager, {
      employeeId: executive,
      territoryName: `Stop Territory ${suffix}`,
      beatName: `Stop Beat ${suffix}`,
      geographyType: "TOWN",
      geographyName: "Stop Town",
      dayOfWeek: new Date().getDay(),
      effectiveFrom: new Date(),
      publish: true,
    });
    expect(plan.retailerCount).toBe(3);
    const stops = await prisma.seeraJourneyPlanStop.findMany({ where: { planId: plan.id } });
    expect(stops).toHaveLength(3);
    expect(new Set(stops.map((s) => s.retailerId))).toEqual(new Set(retailerIds));
  });

  it("MUTATION TEST: moving one retailer to a different Beat after publish does not change the already-published plan's stops", async () => {
    const plan = await createBeatPlan(prisma, manager, {
      employeeId: executive,
      territoryName: `Stop Territory ${suffix}`,
      beatName: `Stop Beat ${suffix}`,
      geographyType: "TOWN",
      geographyName: "Stop Town 2",
      dayOfWeek: (new Date().getDay() + 1) % 7,
      effectiveFrom: new Date(),
      publish: true,
    });
    expect(plan.retailerCount).toBe(3);

    // Move one retailer OUT of the Beat this plan was published for.
    await prisma.seeraRetailer.update({ where: { id: retailerIds[0]! }, data: { beatId: otherBeatId } });

    const stopsAfterMutation = await prisma.seeraJourneyPlanStop.findMany({ where: { planId: plan.id } });
    expect(stopsAfterMutation).toHaveLength(3);
    expect(new Set(stopsAfterMutation.map((s) => s.retailerId))).toEqual(new Set(retailerIds));

    // Restore for subsequent tests / cleanliness.
    await prisma.seeraRetailer.update({ where: { id: retailerIds[0]! }, data: { beatId } });
  });

  it("Executive read model (executiveBeat) reflects the frozen stop list, not the current mutable mapping", async () => {
    const dayOfWeek = (new Date().getDay() + 2) % 7;
    const plan = await createBeatPlan(prisma, manager, {
      employeeId: executive,
      territoryName: `Stop Territory ${suffix}`,
      beatName: `Stop Beat ${suffix}`,
      geographyType: "TOWN",
      geographyName: "Stop Town 3",
      dayOfWeek,
      effectiveFrom: new Date(),
      publish: true,
    });
    // Move all 3 retailers out of the Beat AFTER publish.
    await prisma.seeraRetailer.updateMany({ where: { id: { in: retailerIds } }, data: { beatId: otherBeatId } });
    const range = dayOfWeek === new Date().getDay() ? "today" : "week";
    const result = await executiveBeat(prisma, executive, range as "today" | "week", new Date());
    const planIds = result.plans.map((p) => p.id);
    expect(planIds).toContain(plan.id);
    const resultRetailerIds = result.retailers.map((r) => r.id);
    for (const id of retailerIds) expect(resultRetailerIds).toContain(id);
    // Restore.
    await prisma.seeraRetailer.updateMany({ where: { id: { in: retailerIds } }, data: { beatId } });
  });

  it("blocks publish atomically — a rejected publish creates no stops at all", async () => {
    await prisma.seeraRetailer.updateMany({ where: { id: { in: retailerIds } }, data: { lifecycle: "INACTIVE" } });
    await expect(
      createBeatPlan(prisma, manager, {
        employeeId: executive,
        territoryName: `Stop Territory ${suffix}`,
        beatName: `Stop Beat ${suffix}`,
        geographyType: "TOWN",
        geographyName: "Stop Town 4",
        dayOfWeek: (new Date().getDay() + 3) % 7,
        effectiveFrom: new Date(),
        publish: true,
      }),
    ).rejects.toMatchObject({ code: "BEAT_HAS_NO_RETAILERS" });
    const orphanStops = await prisma.seeraJourneyPlanStop.count({ where: { plan: { geographyId: { in: (await prisma.seeraGeographyNode.findMany({ where: { name: "Stop Town 4" }, select: { id: true } })).map((g) => g.id) } } } });
    expect(orphanStops).toBe(0);
    await prisma.seeraRetailer.updateMany({ where: { id: { in: retailerIds } }, data: { lifecycle: "ACTIVE" } });
  });
});
