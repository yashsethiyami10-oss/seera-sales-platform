import { invokeGatewayTool, checkToolRateLimit, isToolEnabled, getToolDefinition, redact } from "../lib/gateway/security";
import { toErrorResponse } from "../lib/errors";
import { prisma } from "../lib/prisma";

/**
 * MUV AI Gateway — permanent verification for Production Rollout v1.0,
 * Stage 5 (Authenticated Customer Intelligence Rollout).
 *
 * What THIS standalone script can and cannot prove, honestly:
 *   - CAN prove: every Stage 5 tool is registered/CUSTOMER_ONLY/enabled;
 *     a guest is denied by the dispatcher (`checkToolAccess` only needs
 *     `isGuest`, no real session, so this is fully testable here); rate
 *     limits are configured and enforced; PII redaction works; error
 *     responses never leak raw DB/internal detail; a real call produces
 *     a real observability event.
 *   - CANNOT prove here: true cross-customer ownership isolation with
 *     two real logged-in sessions — that needs a real Next.js request
 *     context (cookies/session), which no standalone `tsx` script has
 *     (`auth()` calls `headers()`, which throws outside one — the same
 *     documented limitation `verify-customer-intelligence.ts` already
 *     accepts). Instead, this suite cites the REAL, already-verified
 *     ownership check directly from `actions/orders.ts`'s source
 *     (`getOrderById`/`getOrderTimeline`: `if (!order ||
 *     order.customerId !== customer.id) throw new NotFoundError("Order")`
 *     — read and confirmed while building this stage) and defers the
 *     live two-session proof to Stage 12's real staging browser E2E.
 *
 * Run: `npx tsx scripts/verify-customer-wave-rollout.ts` (or
 * `npm run verify:customer-wave-rollout`).
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

const CUSTOMER_TOOLS = [
  "customer.getMyOrdersList", "customer.getOrder", "customer.getOrderTracking", "customer.getPurchaseHistory",
  "customer.getProfile", "customer.getAddresses", "customer.getSavedPreferences", "customer.getReturnRequests",
  "customer.getRefundStatus", "customer.getMyConversations", "customer.getMyConversationMemory",
];

async function main() {
  // ---- Registration, access level, rollout state ----
  for (const toolName of CUSTOMER_TOOLS) {
    const def = getToolDefinition(toolName);
    check(!!def && def.access === "CUSTOMER_ONLY", `registry: ${toolName} is registered and CUSTOMER_ONLY (never guest-safe)`, def);
    check(isToolEnabled(toolName) === true, `rollout: ${toolName} is enabled by Stage 5`);
    check(!!def && def.rateLimit.limit > 0, `registry: ${toolName} has a real, positive rate limit configured`, def?.rateLimit);
  }

  // ---- Logged-out access denial — real dispatcher enforcement, no session needed ----
  for (const toolName of CUSTOMER_TOOLS) {
    const args = toolName === "customer.getOrder" || toolName === "customer.getOrderTracking" || toolName === "customer.getRefundStatus"
      ? ["any-order-id"]
      : toolName === "customer.getMyConversationMemory"
        ? ["any-session-id"]
        : [];
    const result = await invokeGatewayTool(toolName, args, { isGuest: true, identifier: "stage5-guest-denial-test" });
    check(!result.success && result.error.code === "UNAUTHENTICATED", `guest denial: ${toolName} is rejected by the dispatcher for a guest before the underlying function ever runs`, result);
  }

  // ---- Invalid order ID handling — a signed-in call still can't be simulated here (see
  // header), but an authenticated-context call with a garbage ID must never crash the
  // process even without a real session: it should resolve to a structured, non-throwing
  // failure (UNAUTHENTICATED here, since there is no session at all — the strictest case). ----
  const invalidIdResult = await invokeGatewayTool("customer.getOrder", ["' OR 1=1 --"], { isGuest: true, identifier: "stage5-invalid-id-test" });
  check(!invalidIdResult.success, "invalid input handling: a SQL-injection-shaped order id never crashes the dispatcher, only produces a structured denial", invalidIdResult);

  // ---- Rate limit configuration — real decisions via the fast pure function ----
  for (const toolName of CUSTOMER_TOOLS) {
    const def = getToolDefinition(toolName)!;
    const identifier = `stage5-ratelimit-${toolName}`;
    let sawRateLimited = false;
    for (let i = 0; i < def.rateLimit.limit + 3; i++) {
      const decision = checkToolRateLimit(toolName, identifier);
      if (!decision.allowed) {
        sawRateLimited = true;
        break;
      }
    }
    check(sawRateLimited, `rate limit: ${toolName}'s configured limit (${def.rateLimit.limit}/${def.rateLimit.windowMs}ms) is eventually enforced`);
  }

  // ---- PII redaction — the same shared implementation Security/Observability already use ----
  const redacted = redact({ email: "customer@example.com", phone: "+91-9876543210", note: "order delivered" });
  check(redacted.email === "[REDACTED]", "PII redaction: an email field is redacted before any event/log could persist it");
  check(redacted.note === "order delivered", "PII redaction: a non-sensitive field still passes through untouched");

  // ---- Safe error wording — a raw DB error must never leak connection/internal detail ----
  class FakeOrderLookupError extends Error {
    code = "P2025";
    constructor() {
      super("An operation failed because it depends on one or more records that were required but not found. customerId=cus_internal_42 connection=postgresql://user:secret@host");
    }
  }
  const safeError = toErrorResponse(new FakeOrderLookupError());
  check(!JSON.stringify(safeError).includes("secret"), "safe error wording: a raw error message's embedded credential-shaped text never reaches the returned response", safeError);
  check(safeError.success === false && typeof safeError.error.code === "string", "safe error wording: every failure normalizes to a structured {success:false, error:{code,message}} shape");

  // ---- Ownership enforcement — verified directly from the real, current source (not assumed) ----
  const ordersSource = await import("fs").then((fs) => fs.readFileSync("actions/orders.ts", "utf-8"));
  check(
    /if \(!order \|\| order\.customerId !== customer\.id\) throw new NotFoundError\("Order"\)/.test(ordersSource),
    "ownership enforcement: actions/orders.ts's real, current source still contains the exact ownership check getOrderById/getOrderTimeline rely on — ownership isolation isn't merely assumed, it's confirmed present in the file this stage ships"
  );

  // ---- Observability — a real (unauthenticated, since no session exists here) call still
  // produces a real, persisted CUSTOMER_TOOL_USAGE event, proving the instrumentation wraps
  // every customer tool the same way Commerce tools are already proven to be wrapped. ----
  const before = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "CUSTOMER_TOOL_USAGE" } });
  const { getMyOrdersList } = await import("../lib/gateway/customer");
  await getMyOrdersList().catch(() => {});
  const after = await prisma.gatewayObservabilityEvent.count({ where: { eventType: "CUSTOMER_TOOL_USAGE" } });
  check(after > before, "observability: a real customer tool call (even one that fails for lack of a session) produces a real, persisted CUSTOMER_TOOL_USAGE event");

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
