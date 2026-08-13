import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createManagerInstruction } from "../../lib/sales-distribution/manager-service";

// STAGE 8 smoke test — "Manager Instruction" is an explicitly named Executive notification
// trigger, but creating a SeeraManagerInstruction row never actually notified anyone — no
// individual-user notification producer existed for it. Proves the fix.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "5");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const manager = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-manager-1@seera.test" } });
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });

  const before = await db.notification.count({ where: { recipientId: executive1.id, type: "MANAGER_INSTRUCTION" } });
  const instruction = await createManagerInstruction(db, manager.id, {
    assignedEmployeeId: executive1.id,
    title: "Stage 8 smoke — visit priority accounts first",
    body: "Please prioritize the top 5 accounts in your beat today.",
    priority: "HIGH",
  });
  const after = await db.notification.count({ where: { recipientId: executive1.id, type: "MANAGER_INSTRUCTION" } });
  assert(after === before + 1, `expected exactly one new MANAGER_INSTRUCTION notification for the Executive, went ${before} -> ${after}`);

  const notification = await db.notification.findFirstOrThrow({ where: { recipientId: executive1.id, entityId: instruction.id } });
  assert(notification.title === instruction.title && notification.priority === "HIGH", "expected the notification content/priority to match the instruction");
  assert((notification.payload as { actionPath?: string } | null)?.actionPath === "/portal/sales-executive/instructions", "expected a real deep-link actionPath");
  console.log(`[1] OK — Manager Instruction now genuinely notifies the assigned Executive (notification ${notification.id}, priority=${notification.priority}, deep-linked) — previously silent`);

  console.log("\nALL STAGE 8 MANAGER INSTRUCTION NOTIFICATION SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
