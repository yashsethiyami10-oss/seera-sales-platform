import {
  getMyOrdersList,
  getOrder,
  getOrderTracking,
  getPurchaseHistory,
  getProfile,
  getAddresses,
  getSavedPreferences,
  getReturnRequests,
  getRefundStatus,
  getMyConversations,
  getMyConversationMemory,
} from "../lib/gateway/customer";

/**
 * MUV AI Gateway — permanent verification for Phase 5.4, Customer
 * Intelligence. Same `scripts/verify-*.ts` convention as every other
 * permanent suite this Wave (see `verify-knowledge-publisher.ts`'s
 * header for why, not the newer Vitest suite).
 *
 * Run: `npx tsx scripts/verify-customer-intelligence.ts` (or
 * `npm run verify:customer-intelligence`).
 *
 * Every function here is `requireCustomer()`-gated (directly, or via the
 * Server Action it re-exports) and ownership-checked. Outside a real
 * Next.js request context, `auth()` itself cannot resolve a session
 * (the same documented limitation as every other `scripts/verify-*.ts`
 * script touching RBAC) — so every call here has NO session at all,
 * which is the strictest possible test of "guest users must never
 * receive authenticated information": if any function below ever
 * returned real customer data with zero session present, that would be
 * a severe RBAC bypass. Every check asserts the opposite: a structured,
 * non-crashing failure, never data.
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

async function assertNoDataLeaksWithoutSession(label: string, fn: () => Promise<{ success: boolean }>) {
  let result: { success: boolean } | undefined;
  let threwUncaught = false;
  try {
    result = await fn();
  } catch {
    // Even an uncaught throw here is acceptable for this specific proof
    // (it still means no data was returned) — but every one of these
    // functions is expected to catch internally and return a structured
    // result, so this branch existing at all would itself be worth
    // flagging.
    threwUncaught = true;
  }
  check(threwUncaught || result?.success === false, `${label}: no customer data returned without a session`, result);
}

async function main() {
  await assertNoDataLeaksWithoutSession("getMyOrdersList", () => getMyOrdersList());
  await assertNoDataLeaksWithoutSession("getOrder", () => getOrder("any-order-id"));
  await assertNoDataLeaksWithoutSession("getOrderTracking", () => getOrderTracking("any-order-id"));
  await assertNoDataLeaksWithoutSession("getPurchaseHistory", () => getPurchaseHistory());
  await assertNoDataLeaksWithoutSession("getProfile", () => getProfile());
  await assertNoDataLeaksWithoutSession("getAddresses", () => getAddresses());
  await assertNoDataLeaksWithoutSession("getSavedPreferences", () => getSavedPreferences());
  await assertNoDataLeaksWithoutSession("getReturnRequests", () => getReturnRequests());
  await assertNoDataLeaksWithoutSession("getRefundStatus", () => getRefundStatus("any-order-id"));
  await assertNoDataLeaksWithoutSession("getMyConversations", () => getMyConversations());
  await assertNoDataLeaksWithoutSession("getMyConversationMemory", () => getMyConversationMemory("any-session-id"));

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
