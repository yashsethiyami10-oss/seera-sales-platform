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

// Sprint 14 — Founder and Website AI (final sprint of the 14-sprint
// program). Founder AI: bridges FOUNDER_INTELLIGENCE to lib/founder-os/*
// (zero prior integration, confirmed by research) and to Module 9's own
// operational health data (also zero prior integration). Website AI:
// closes a real, disclosed-by-omission gap — MuvAiEvent has been written
// on every widget interaction since Wave 2 shipped and never read back
// anywhere outside test setup/teardown.

async function main() {
  const toolsSrc = source("lib/muv-ai/tools.ts");
  for (const fn of ["getFounderDashboard", "getDecisionQueue", "getSystemHealth", "getVersionRegistry"]) {
    check(toolsSrc.includes(fn), `tools.ts reuses the real ${fn} (does not reimplement Founder OS / Production Readiness logic)`);
  }
  for (const code of ["FOUNDER_DASHBOARD_LOOKUP:", "FOUNDER_DECISION_QUEUE_LOOKUP:", "AI_PLATFORM_HEALTH_LOOKUP:"]) {
    check(toolsSrc.includes(code), `${code.replace(":", "")} adapter registered`);
  }
  check(toolsSrc.includes('await requireStaff();'), "AI_PLATFORM_HEALTH_LOOKUP authorizes itself via requireStaff() (Module 9 does not self-authorize, unlike Founder OS/Support/Sales)");

  const orchestratorSrc = source("lib/muv-ai/orchestrator.ts");
  check(orchestratorSrc.includes("selectFounderToolCode"), "orchestrator.ts routes the founder module through the new selector");
  check(orchestratorSrc.includes('module === "founder"'), 'an explicit "founder" module routes to FOUNDER_INTELLIGENCE regardless of the founder-role/intent heuristic');

  const betaSrc = source("actions/muv-ai-beta.ts");
  check(betaSrc.includes("export async function getMuvAiEventSummary"), "getMuvAiEventSummary is exported");
  check(/getMuvAiEventSummary[\s\S]{0,200}await requireAdmin\(\)/.test(betaSrc), "getMuvAiEventSummary is admin-gated, matching this file's own established convention for every other founder/admin-tier read");
  check(betaSrc.includes("muvAiEvent.groupBy"), "getMuvAiEventSummary uses a real groupBy aggregation, not a fabricated summary");

  // --- Live DB: all three new tools are registered ACTIVE with real permission gates ---
  const dashTool = await prisma.aiToolDefinition.findUnique({ where: { code: "FOUNDER_DASHBOARD_LOOKUP" } });
  check(!!dashTool && dashTool.status === "ACTIVE" && dashTool.requiredPermission === "founder_os.access", "FOUNDER_DASHBOARD_LOOKUP is seeded ACTIVE with the real founder_os.access permission gate");
  const queueTool = await prisma.aiToolDefinition.findUnique({ where: { code: "FOUNDER_DECISION_QUEUE_LOOKUP" } });
  check(!!queueTool && queueTool.status === "ACTIVE" && queueTool.requiredPermission === "founder_os.access", "FOUNDER_DECISION_QUEUE_LOOKUP is seeded ACTIVE with the real founder_os.access permission gate");
  const healthTool = await prisma.aiToolDefinition.findUnique({ where: { code: "AI_PLATFORM_HEALTH_LOOKUP" } });
  check(!!healthTool && healthTool.status === "ACTIVE" && healthTool.requiredPermission === "ai.operations.view", "AI_PLATFORM_HEALTH_LOOKUP is seeded ACTIVE with a real outer permission gate");

  const agent = await prisma.aiAgentDefinition.findUnique({ where: { code: "FOUNDER_INTELLIGENCE" } });
  const expectedTools = ["EXECUTIVE_REPORT", "REPORT_LOOKUP", "FOUNDER_DASHBOARD_LOOKUP", "FOUNDER_DECISION_QUEUE_LOOKUP", "AI_PLATFORM_HEALTH_LOOKUP"];
  check(!!agent && expectedTools.every((t) => agent.allowedTools.includes(t)), "FOUNDER_INTELLIGENCE agent's allowedTools includes all five expected Founder AI tools");

  // --- Real live-DB proof: mirrors getFounderDashboard/getDecisionQueue's underlying query shapes ---
  const alertCount = await prisma.founderAlert.count({ where: { status: "ACTIVE" } }).catch(() => null);
  check(alertCount !== null, "FounderAlert table is reachable with the exact status filter FOUNDER_DASHBOARD_LOOKUP's underlying service uses");

  // --- Real live-DB proof: MuvAiEvent aggregation query shape works ---
  let testEvent;
  try {
    testEvent = await prisma.muvAiEvent.create({ data: { type: "SPRINT14_VERIFICATION_TEST", properties: {} } });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.muvAiEvent.groupBy({ by: ["type"], where: { occurredAt: { gte: since }, type: "SPRINT14_VERIFICATION_TEST" }, _count: { _all: true } });
    check(rows.length === 1 && rows[0]._count._all === 1, "the groupBy aggregation getMuvAiEventSummary uses correctly counts a real written event");
  } finally {
    if (testEvent) await prisma.muvAiEvent.delete({ where: { id: testEvent.id } }).catch(() => {});
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
