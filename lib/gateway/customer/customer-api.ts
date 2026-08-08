import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/rbac";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { getMyOrders, getOrderById, getOrderTimeline } from "@/actions/orders";
import { getMyProfile, getMyAddresses } from "@/actions/customers";
import { getMyReturnRequests, getReturnShipmentStatus } from "@/actions/returns";
import { getCustomerPreferences } from "@/lib/preferences";
import { listCustomerConversations, getCustomerConversationMemory } from "./conversations-source";
import { instrumentToolCall } from "@/lib/gateway/observability";
import type { CustomerToolResult } from "./types";

/**
 * MUV AI Gateway — Phase 5.4, Customer Intelligence.
 *
 * "Authenticated capabilities must respect RBAC. Guest users must never
 * receive authenticated information." — every function here either
 * re-exports a Server Action that already calls `requireCustomer()`
 * internally (`actions/orders.ts`, `actions/customers.ts`, `actions/
 * returns.ts`), or (for the two conversation functions, which read a
 * different model with no existing wrapper) resolves the caller's real
 * Customer row itself via the exact same `requireCustomer()` → `prisma.
 * customer.findUnique({where:{userId}})` two-step every other
 * customer-only action in this codebase uses — never accepting a
 * customerId parameter from the caller. A guest (no session, or a
 * session with no linked Customer row) gets a structured
 * UNAUTHORIZED/NOT_FOUND response from every single function here, the
 * same as any other customer-only action already does — no new
 * exemption is introduced.
 *
 * NOT wired into the live turn path — same status as every other
 * Gateway module so far.
 *
 * Phase 5.6 (Observability) — every function is now a real (if thin)
 * wrapper through `run()`/`instrumentToolCall`, not a bare re-export —
 * "customer tool usage" needs a per-tool event even for the functions
 * that are otherwise a 1:1 passthrough to an existing Server Action.
 * The underlying Server Action's own behavior/return shape is completely
 * unchanged; this only adds the same side-effect instrumentation every
 * other Gateway module already has.
 */

/** For an underlying call that already returns
 * `{success,data}|{success,error}` (a Server Action). */
async function run<T>(toolName: string, fn: () => Promise<CustomerToolResult<T>>): Promise<CustomerToolResult<T>> {
  return instrumentToolCall({ source: "customer", toolName, eventType: "CUSTOMER_TOOL_USAGE" }, fn);
}

/** For an underlying call that returns raw data and still needs
 * wrapping into the standardized shape (the two new conversation reads,
 * and `lib/preferences.ts`, none of which are Server Actions). */
async function runRaw<T>(toolName: string, fn: () => Promise<T>): Promise<CustomerToolResult<T>> {
  return instrumentToolCall({ source: "customer", toolName, eventType: "CUSTOMER_TOOL_USAGE" }, async () => {
    try {
      return { success: true as const, data: await fn() };
    } catch (err) {
      return toErrorResponse(err);
    }
  });
}

async function resolveOwnCustomerId(): Promise<string> {
  const user = await requireCustomer();
  const customer = await prisma.customer.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!customer) throw new NotFoundError("Customer profile");
  return customer.id;
}

// ---------------------------------------------------------------------------
// Orders — thin instrumented wrappers around Server Actions that are
// already requireCustomer()-gated + ownership-checked in actions/orders.ts.
// ---------------------------------------------------------------------------

export function getMyOrdersList() {
  return run("getMyOrdersList", () => getMyOrders());
}

export function getOrder(orderId: string) {
  return run("getOrder", () => getOrderById(orderId));
}

export function getOrderTracking(orderId: string) {
  return run("getOrderTracking", () => getOrderTimeline(orderId));
}

/** "Purchase History" is the same underlying data as "Order Lookup" —
 * a named alias, not a second query. */
export function getPurchaseHistory() {
  return run("getPurchaseHistory", () => getMyOrders());
}

// ---------------------------------------------------------------------------
// Profile / Addresses / Preferences
// ---------------------------------------------------------------------------

export function getProfile() {
  return run("getProfile", () => getMyProfile());
}

export function getAddresses() {
  return run("getAddresses", () => getMyAddresses());
}

export function getSavedPreferences() {
  return runRaw("getSavedPreferences", async () => {
    const customerId = await resolveOwnCustomerId();
    return getCustomerPreferences(customerId);
  });
}

// ---------------------------------------------------------------------------
// Returns / Refunds
// ---------------------------------------------------------------------------

export function getReturnRequests() {
  return run("getReturnRequests", () => getMyReturnRequests());
}

export function getRefundStatus(orderId: string) {
  return run("getRefundStatus", () => getReturnShipmentStatus(orderId));
}

// ---------------------------------------------------------------------------
// Customer Conversations / Customer AI Memory
// ---------------------------------------------------------------------------

export function getMyConversations(limit?: number) {
  return runRaw("getMyConversations", async () => {
    const customerId = await resolveOwnCustomerId();
    return listCustomerConversations(customerId, limit);
  });
}

export function getMyConversationMemory(sessionId: string) {
  return runRaw("getMyConversationMemory", async () => {
    const customerId = await resolveOwnCustomerId();
    const memory = await getCustomerConversationMemory(customerId, sessionId);
    // Same session-doesn't-exist-vs-not-yours non-disclosure discipline
    // as order/return lookups above.
    if (!memory) throw new NotFoundError("Conversation");
    return memory;
  });
}
