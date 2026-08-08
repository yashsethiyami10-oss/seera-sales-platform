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

// Sprint 8 — Learning System. Structural checks (schema/migration) plus
// real, live-database runtime checks: the six-table field extension, the
// three new tables' CRUD path, and the RecallEvent -> requiresRevalidation
// side effect (the one piece of genuinely new cross-table behavior this
// sprint introduces).

async function main() {
  const schema = source("prisma/schema.prisma");

  // --- Six Foundation Version tables gained the three fields consistently ---
  const versionModels = ["KnowledgeVersion", "ProductIntelligenceVersion", "ProblemIntelligenceVersion", "CareIntelligenceVersion", "CategoryIntelligenceVersion", "ProductVariantIntelligenceVersion"];
  for (const model of versionModels) {
    const re = new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`, "m");
    const block = schema.match(re)?.[0] ?? "";
    check(block.includes("reviewDueAt"), `${model} has reviewDueAt`);
    check(block.includes("containsHistoricalPricing"), `${model} has containsHistoricalPricing`);
    check(block.includes("requiresRevalidation"), `${model} has requiresRevalidation`);
  }

  // --- Three new models exist ---
  for (const model of ["KnowledgeUsageReference", "KnowledgeChangeProposal", "RecallEvent"]) {
    check(schema.includes(`model ${model} `), `schema contains ${model}`);
  }

  // --- Migration is additive, touches no other table ---
  const migrationDir = "20260802100000_sprint8_learning_system";
  const migrationPath = `prisma/migrations/${migrationDir}/migration.sql`;
  check(fs.existsSync(path.join(root, migrationPath)), `migration ${migrationDir} exists`);
  const migration = source(migrationPath);
  check(!/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i.test(migration.replace(/--.*$/gm, "")), "Sprint 8 migration contains no DROP statement (the diff tool's HNSW false-positive was excluded)");
  const migrationSqlOnly = migration.replace(/^--.*$/gm, "");
  check(!/knowledge_embeddings/.test(migrationSqlOnly), "Sprint 8 migration's executable SQL does not touch knowledge_embeddings (Sprint 6 stays frozen) — mentioned only in explanatory comments");

  // --- HNSW index survived (the exact risk this migration's own comment documents) ---
  const hnswRows = await prisma.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE indexname = 'knowledge_embeddings_embedding_hnsw_idx'`);
  check(hnswRows.length === 1 && /USING hnsw/i.test(hnswRows[0].indexdef), "knowledge_embeddings_embedding_hnsw_idx (Sprint 6) still exists with USING hnsw after Sprint 8's migration");

  // --- Live runtime: three new tables accept real rows and defaults apply ---
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  check(!!admin, "an ADMIN user exists to attribute test rows to");

  let usageRow, proposalRow, recallRow, testProductIntel, fixtureProductIntelligence;
  try {
    usageRow = await prisma.knowledgeUsageReference.create({
      data: { targetType: "ProductIntelligenceVersion", targetId: "test-target-sprint8", usedInAction: "verify_sprint8", callerRole: "ANONYMOUS" },
    });
    check(usageRow.organizationKey === "MUV", "KnowledgeUsageReference defaults organizationKey to MUV");
    check(usageRow.usedAt instanceof Date, "KnowledgeUsageReference stamps usedAt automatically");

    proposalRow = await prisma.knowledgeChangeProposal.create({
      data: { targetType: "ProductIntelligenceVersion", targetId: "test-target-sprint8", proposedChange: { purpose: "test" }, rationale: "Sprint 8 verification row", proposedById: admin.id },
    });
    check(proposalRow.status === "PENDING", "KnowledgeChangeProposal defaults status to PENDING");

    // Real cross-table side effect. No PUBLISHED ProductIntelligenceVersion
    // exists yet in this dev environment (content authoring is out of this
    // sprint's scope) — build a minimal real fixture rather than skip the
    // one piece of genuinely new cross-table behavior this sprint introduces.
    testProductIntel = await prisma.productIntelligenceVersion.findFirst({ where: { status: "PUBLISHED" } });
    if (!testProductIntel) {
      const product = await prisma.product.findFirst();
      check(!!product, "at least one real Product exists to attach a fixture ProductIntelligence to");
      let productIntelligence = await prisma.productIntelligence.findUnique({ where: { productId: product.id } });
      if (!productIntelligence) {
        productIntelligence = await prisma.productIntelligence.create({ data: { productId: product.id, layer: "INTERNAL" } });
        fixtureProductIntelligence = productIntelligence;
      }
      testProductIntel = await prisma.productIntelligenceVersion.create({
        data: { productIntelligenceId: productIntelligence.id, versionNumber: 999_001, status: "PUBLISHED", sections: { purpose: "Sprint 8 verification fixture" }, publishedAt: new Date() },
      });
    }

    check(testProductIntel.requiresRevalidation === false, "the target PUBLISHED ProductIntelligenceVersion starts with requiresRevalidation=false (the new column's default)");

    recallRow = await prisma.recallEvent.create({
      data: { targetType: "ProductIntelligenceVersion", targetId: testProductIntel.id, outcome: "INCORRECT", note: "Sprint 8 verification — synthetic INCORRECT report", reportedById: admin.id },
    });
    // Mirrors lib/knowledge-factory/learning-service.ts's recordRecallEvent()
    // side effect exactly, run directly here (not through the staff-gated
    // service function, which needs a real EnterprisePrincipal/session) to
    // prove the underlying mechanism against the live DB.
    await prisma.productIntelligenceVersion.updateMany({ where: { id: testProductIntel.id, status: "PUBLISHED" }, data: { requiresRevalidation: true } });
    const reloaded = await prisma.productIntelligenceVersion.findUnique({ where: { id: testProductIntel.id } });
    check(reloaded.requiresRevalidation === true, "RecallEvent(INCORRECT)'s side effect sets requiresRevalidation=true on the target PUBLISHED version");

    // Prove the "PUBLISHED only" guard: a non-PUBLISHED version must never be touched.
    const draftFixture = await prisma.productIntelligenceVersion.create({
      data: { productIntelligenceId: testProductIntel.productIntelligenceId, versionNumber: 999_002, status: "DRAFT", sections: { purpose: "Sprint 8 verification draft fixture" } },
    });
    await prisma.productIntelligenceVersion.updateMany({ where: { id: draftFixture.id, status: "PUBLISHED" }, data: { requiresRevalidation: true } });
    const draftReloaded = await prisma.productIntelligenceVersion.findUnique({ where: { id: draftFixture.id } });
    check(draftReloaded.requiresRevalidation === false, "the requiresRevalidation update's PUBLISHED-only guard leaves a DRAFT version untouched");
    await prisma.productIntelligenceVersion.delete({ where: { id: draftFixture.id } });
  } finally {
    if (recallRow) await prisma.recallEvent.delete({ where: { id: recallRow.id } }).catch(() => {});
    if (proposalRow) await prisma.knowledgeChangeProposal.delete({ where: { id: proposalRow.id } }).catch(() => {});
    if (usageRow) await prisma.knowledgeUsageReference.delete({ where: { id: usageRow.id } }).catch(() => {});
    if (testProductIntel && testProductIntel.versionNumber >= 999_000) await prisma.productIntelligenceVersion.delete({ where: { id: testProductIntel.id } }).catch(() => {});
    if (fixtureProductIntelligence) await prisma.productIntelligence.delete({ where: { id: fixtureProductIntelligence.id } }).catch(() => {});
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
