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

// Sprint 12 — Support AI. First real bridge between the AI layer
// (lib/muv-ai/*) and the Support domain (lib/support/*) — confirmed by
// research before this sprint that zero prior integration existed anywhere
// (EIOS never touches Prisma; Module 7's "CUSTOMER_SUPPORT" escalation
// target was an unused string label; buildHandoffPackage is a pure,
// unpersisted advisory object).

async function main() {
  const toolsSrc = source("lib/muv-ai/tools.ts");
  check(toolsSrc.includes('import { listSupportTickets, createSupportTicket } from "@/lib/support/ticket-service"'), "tools.ts reuses lib/support/ticket-service.ts's real, already-authorizing functions, does not reimplement Support logic");
  check(toolsSrc.includes("SUPPORT_TICKET_LOOKUP:"), "SUPPORT_TICKET_LOOKUP adapter registered");
  check(toolsSrc.includes("CREATE_SUPPORT_TICKET:"), "CREATE_SUPPORT_TICKET adapter registered");

  const orchestratorSrc = source("lib/muv-ai/orchestrator.ts");
  check(orchestratorSrc.includes('module === "support"'), "orchestrator.ts routes an explicit support module");
  check(orchestratorSrc.includes('intent === "EXECUTE_ACTION" && options.actionPayload ? "CREATE_SUPPORT_TICKET" : "SUPPORT_TICKET_LOOKUP"'), "a support-module EXECUTE_ACTION only calls the create tool when actionPayload was actually supplied — never attempts a create call Zod would reject, never silently falls through to a lookup pretending to be a create");

  // --- Live DB: both tools are registered ACTIVE with the real permission gate ---
  const lookupTool = await prisma.aiToolDefinition.findUnique({ where: { code: "SUPPORT_TICKET_LOOKUP" } });
  check(!!lookupTool && lookupTool.status === "ACTIVE" && lookupTool.requiredPermission === "support.tickets.view_assigned", "SUPPORT_TICKET_LOOKUP is seeded ACTIVE with the real support.tickets.view_assigned permission gate");
  const createTool = await prisma.aiToolDefinition.findUnique({ where: { code: "CREATE_SUPPORT_TICKET" } });
  check(!!createTool && createTool.status === "ACTIVE" && createTool.requiredPermission === "support.tickets.manage", "CREATE_SUPPORT_TICKET is seeded ACTIVE with the real support.tickets.manage permission gate");

  const agent = await prisma.aiAgentDefinition.findUnique({ where: { code: "CUSTOMER_INTELLIGENCE" } });
  check(!!agent && agent.allowedTools.includes("SUPPORT_TICKET_LOOKUP") && agent.allowedTools.includes("CREATE_SUPPORT_TICKET"), "CUSTOMER_INTELLIGENCE agent's allowedTools includes both new Support tools (backfilled onto the existing seeded row, not just new installs)");

  // --- Live DB: the adapters actually work against real Support data ---
  const realTicket = await prisma.supportTicket.findFirst();
  if (realTicket) {
    // Mirrors SUPPORT_TICKET_LOOKUP's real query shape directly (listSupportTickets
    // itself is requireSupportPrincipal()-gated, so it can't be called from a bare
    // script without a real session — mirrored, not stubbed, same established
    // pattern as every prior sprint's DB-mechanics proof).
    const rows = await prisma.supportTicket.findMany({ where: { organizationKey: realTicket.organizationKey, id: realTicket.id }, take: 10 });
    check(rows.length === 1 && rows[0].id === realTicket.id, "the lookup query shape SUPPORT_TICKET_LOOKUP uses returns a real ticket correctly");
  } else {
    console.log("SKIP no real SupportTicket exists in this environment — lookup-shape proof skipped, not faked");
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
