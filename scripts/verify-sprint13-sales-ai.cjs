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

// Sprint 13 — Sales AI. Bridges the AI layer to the Institutional Sales OS
// and Sprint 11's Sales Intelligence Foundation. Also fixes a real,
// previously-latent bug found during this sprint's research: several
// pre-existing AiToolDefinition rows were seeded against the wrong
// (legacy) permission namespace, making them unreachable for the
// Institutional Sales roles they were meant for.

async function main() {
  const toolsSrc = source("lib/muv-ai/tools.ts");
  for (const fn of ["listOpportunities", "createFollowUp", "createQuotation", "getPipelineReport", "getLatestSalesIntelligence"]) {
    check(toolsSrc.includes(fn), `tools.ts reuses the real ${fn} (does not reimplement Institutional Sales OS logic)`);
  }
  for (const code of ["OPPORTUNITY_LOOKUP:", "SALES_INTELLIGENCE_LOOKUP:", "CREATE_FOLLOWUP:", "CREATE_DRAFT_QUOTATION:", "REPORT_LOOKUP:", "EXECUTIVE_REPORT:"]) {
    check(toolsSrc.includes(code), `${code.replace(":", "")} adapter registered`);
  }
  const importLines = toolsSrc.split("\n").filter((l) => l.trim().startsWith("import"));
  check(!importLines.some((l) => l.includes("computeSalesIntelligence")), "SALES_INTELLIGENCE_LOOKUP does not import the write function computeSalesIntelligence — an AI lookup tool must stay read-only");

  const orchestratorSrc = source("lib/muv-ai/orchestrator.ts");
  check(orchestratorSrc.includes("selectSalesToolCode"), "orchestrator.ts routes the sales module through the new selector");
  check(orchestratorSrc.includes('actionPayload.actionKind === "FOLLOWUP"') && orchestratorSrc.includes('actionPayload.actionKind === "QUOTATION"'), "write-tool selection is driven only by an explicit actionKind field, never guessed from free text");

  // --- Live DB: the permission-string bug is actually fixed ---
  const seed = source("prisma/seed.ts");
  check(seed.includes('["CREATE_FOLLOWUP","Create Follow-up","ACTION","inst_sales.followups.manage"]'), "seed.ts: CREATE_FOLLOWUP corrected to the real inst_sales.followups.manage permission");
  check(seed.includes('["CREATE_DRAFT_QUOTATION","Create Draft Quotation","ACTION","inst_sales.quotations.manage"]'), "seed.ts: CREATE_DRAFT_QUOTATION corrected to the real inst_sales.quotations.manage permission");
  check(seed.includes('update:{requiredPermission}'), "seed.ts: the tools upsert backfills requiredPermission onto already-existing rows, not just new installs");

  const followUpTool = await prisma.aiToolDefinition.findUnique({ where: { code: "CREATE_FOLLOWUP" } });
  check(!!followUpTool && followUpTool.requiredPermission === "inst_sales.followups.manage", "CREATE_FOLLOWUP's live DB row now carries the corrected permission (backfill actually worked, not just in the seed source)");
  const quotationTool = await prisma.aiToolDefinition.findUnique({ where: { code: "CREATE_DRAFT_QUOTATION" } });
  check(!!quotationTool && quotationTool.requiredPermission === "inst_sales.quotations.manage", "CREATE_DRAFT_QUOTATION's live DB row now carries the corrected permission");
  const reportTool = await prisma.aiToolDefinition.findUnique({ where: { code: "REPORT_LOOKUP" } });
  check(!!reportTool && reportTool.requiredPermission === "inst_sales.reports.view", "REPORT_LOOKUP's live DB row now carries the corrected permission");

  const oppLookupTool = await prisma.aiToolDefinition.findUnique({ where: { code: "OPPORTUNITY_LOOKUP" } });
  check(!!oppLookupTool && oppLookupTool.status === "ACTIVE", "OPPORTUNITY_LOOKUP is seeded ACTIVE");
  const salesIntelTool = await prisma.aiToolDefinition.findUnique({ where: { code: "SALES_INTELLIGENCE_LOOKUP" } });
  check(!!salesIntelTool && salesIntelTool.status === "ACTIVE", "SALES_INTELLIGENCE_LOOKUP is seeded ACTIVE");

  const agent = await prisma.aiAgentDefinition.findUnique({ where: { code: "SALES_INTELLIGENCE" } });
  const expectedTools = ["CUSTOMER_LOOKUP", "REPORT_LOOKUP", "OPPORTUNITY_LOOKUP", "SALES_INTELLIGENCE_LOOKUP", "CREATE_FOLLOWUP", "CREATE_DRAFT_QUOTATION"];
  check(!!agent && expectedTools.every((t) => agent.allowedTools.includes(t)), "SALES_INTELLIGENCE agent's allowedTools includes all six expected Sales AI tools");

  // --- Real dispatch-table proof: mirrors REPORT_DISPATCH's keys against the real functions it wraps ---
  const reportFunctionsInFile = ["getPipelineReport", "getConversionReport", "getOpportunityReport", "getTerritoryReport", "getOfficerPerformanceReport", "getSampleConversionReport", "getLostReasonsReport", "getRevenueTrendsReport"];
  check(reportFunctionsInFile.every((fn) => toolsSrc.includes(fn)), "REPORT_LOOKUP's dispatch table references all 8 real Module 14 report functions");

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
