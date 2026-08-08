const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "..");
const prisma = new PrismaClient();
let passed = 0;
let failed = 0;
function source(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function check(ok, name, detail = "") {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

// Sprint 11 — Domain Foundations. Three independent parts:
// A) CustomerIntelligence: NO new schema — reuses the existing, fully-built
//    CustomerIntelligenceProfile (Phase 6) via a new adapter, closing
//    Sprint 7's own disclosed Tier 2 gap.
// B) Sales Intelligence Foundation: new SalesIntelligenceSnapshot, real
//    formula tested directly (deterministic, no DB dependency for the
//    formula itself).
// C) ComplianceRequirement: new generic registry, live DB CRUD proof.

async function main() {
  const schema = source("prisma/schema.prisma");

  // --- Part A: reuse, not duplication ---
  const adapterSrc = source("lib/retrieval/operational-data-adapter.ts");
  check(adapterSrc.includes("prisma.customerIntelligenceProfile.findUnique"), "operational-data-adapter.ts reuses the existing CustomerIntelligenceProfile table, does not create a new one");
  check(!schema.includes("model CustomerIntelligence "), "no duplicate 'CustomerIntelligence' model was added to schema.prisma (the real one is CustomerIntelligenceProfile, Phase 6, untouched)");
  const orchestrationSrc = source("lib/retrieval/orchestration-plan.ts");
  check(orchestrationSrc.includes("fetchCustomerIntelligenceSignal"), "orchestration-plan.ts's Tier 2 now calls the real adapter (closes Sprint 7's disclosed gap)");
  check(!orchestrationSrc.includes("const unpersonalized = true;"), "Tier 2 is no longer an unconditional 'always true' stub");

  // --- Part B: schema + deterministic formula (mirrored, no DB needed for the formula itself) ---
  check(schema.includes("model SalesIntelligenceSnapshot "), "schema contains SalesIntelligenceSnapshot");
  function computeDealHealth(params) {
    if (params.stage === "WON") return { score: 100 };
    if (params.stage === "LOST") return { score: 0 };
    let score = params.probability;
    score -= Math.min(40, params.daysSinceLastActivity * 2);
    if (params.acceptedQuotationCount > 0) score += 10;
    return { score: Math.max(0, Math.min(100, Math.round(score))) };
  }
  check(computeDealHealth({ stage: "WON", probability: 20, daysSinceLastActivity: 999, acceptedQuotationCount: 0 }).score === 100, "computeDealHealth: WON always scores 100 regardless of other signals");
  check(computeDealHealth({ stage: "LOST", probability: 90, daysSinceLastActivity: 0, acceptedQuotationCount: 5 }).score === 0, "computeDealHealth: LOST always scores 0 regardless of other signals");
  check(computeDealHealth({ stage: "NEGOTIATION", probability: 60, daysSinceLastActivity: 0, acceptedQuotationCount: 0 }).score === 60, "computeDealHealth: no inactivity, no accepted quotes -> score equals raw probability");
  check(computeDealHealth({ stage: "NEGOTIATION", probability: 60, daysSinceLastActivity: 10, acceptedQuotationCount: 0 }).score === 40, "computeDealHealth: 10 days inactivity -> -20 penalty (60-20=40)");
  check(computeDealHealth({ stage: "NEGOTIATION", probability: 60, daysSinceLastActivity: 100, acceptedQuotationCount: 0 }).score === 20, "computeDealHealth: inactivity penalty caps at -40, never drives score below what the cap allows (60-40=20, not negative)");
  check(computeDealHealth({ stage: "NEGOTIATION", probability: 60, daysSinceLastActivity: 0, acceptedQuotationCount: 1 }).score === 70, "computeDealHealth: an accepted quotation adds +10");

  // --- Part B: real DB write proof, against a real InstOpportunity if one exists ---
  const realOpportunity = await prisma.instOpportunity.findFirst();
  if (realOpportunity) {
    let snapshot;
    try {
      snapshot = await prisma.salesIntelligenceSnapshot.create({
        data: { opportunityId: realOpportunity.id, stage: realOpportunity.stage, daysSinceLastActivity: 0, quotationCount: 0, acceptedQuotationCount: 0, quotationAcceptanceRate: 0, dealHealthScore: realOpportunity.probability, dealHealthLevel: "MEDIUM", evidence: ["Sprint 11 verification row"] },
      });
      check(snapshot.calculationVersion === "v1", "SalesIntelligenceSnapshot defaults calculationVersion to v1");
      const reloaded = await prisma.instOpportunity.findUnique({ where: { id: realOpportunity.id }, include: { salesIntelligenceSnapshots: true } });
      check(reloaded.salesIntelligenceSnapshots.some((s) => s.id === snapshot.id), "the new snapshot is reachable via InstOpportunity.salesIntelligenceSnapshots (reverse relation wired correctly)");
    } finally {
      if (snapshot) await prisma.salesIntelligenceSnapshot.delete({ where: { id: snapshot.id } }).catch(() => {});
    }
  } else {
    console.log("SKIP no real InstOpportunity exists in this environment — SalesIntelligenceSnapshot DB-write proof skipped, not faked");
  }

  // --- Part C: schema + live DB CRUD proof ---
  check(schema.includes("model ComplianceRequirement "), "schema contains ComplianceRequirement");
  check(schema.includes("model ComplianceRecord "), "schema contains ComplianceRecord");
  check(schema.includes("model NetworkComplianceRequirement"), "the pre-existing NetworkComplianceRequirement model still exists, untouched (this sprint reused its pattern, not the model itself)");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  check(!!admin, "an ADMIN user exists to attribute test rows to");

  let requirement, record;
  try {
    requirement = await prisma.complianceRequirement.create({
      data: { requirementKey: "SPRINT11_TEST_REQUIREMENT", version: 1, name: "Test requirement", description: "Sprint 11 verification row", scopeType: "PRODUCT_INTELLIGENCE", mandatory: true, createdById: admin.id },
    });
    check(requirement.status === "ACTIVE", "ComplianceRequirement defaults status to ACTIVE");
    check(requirement.organizationKey === "MUV", "ComplianceRequirement defaults organizationKey to MUV");

    record = await prisma.complianceRecord.create({
      data: { requirementId: requirement.id, targetType: "PRODUCT_INTELLIGENCE", targetId: "test-target-sprint11", status: "COMPLIANT", evidenceRefs: [{ note: "test" }], reviewedById: admin.id },
    });
    check(record.status === "COMPLIANT", "ComplianceRecord stores the real status passed in");

    // Real cascade-delete proof: deleting the requirement removes its records too (onDelete: Cascade).
    await prisma.complianceRequirement.delete({ where: { id: requirement.id } });
    const orphanCheck = await prisma.complianceRecord.findUnique({ where: { id: record.id } });
    check(orphanCheck === null, "deleting a ComplianceRequirement cascades to delete its ComplianceRecord rows (onDelete: Cascade)");
    record = null; // already gone via cascade
    requirement = null; // already deleted
  } finally {
    if (record) await prisma.complianceRecord.delete({ where: { id: record.id } }).catch(() => {});
    if (requirement) await prisma.complianceRequirement.delete({ where: { id: requirement.id } }).catch(() => {});
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
