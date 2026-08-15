import { z } from "zod";
import { FoundationError, safeError } from "../../lib/foundation/errors";

// Pure unit-level proof of the governed error contract — no DB/server needed,
// since safeError()/classifyError() are deterministic functions of
// (error, requestId). Covers the 12-point regression checklist from the
// "SEERA PLATFORM-WIDE GOVERNED ERROR EXPERIENCE" task.

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string) {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}

function main() {
  const rid = "test-request-id-abc123";

  console.log("\n=== 1. Zod validation failure -> actionable message ===");
  const zodResult = z.object({ sessionId: z.string() }).safeParse({});
  const { status: s1, body: b1 } = safeError(zodResult.error, rid) as any;
  assert(s1 === 400, "Status 400 for validation error");
  assert(b1.error.code === "VALIDATION_ERROR", "Code is VALIDATION_ERROR");
  assert(b1.error.category === "VALIDATION", "Category is VALIDATION");
  assert(typeof b1.error.nextAction === "string" && b1.error.nextAction.length > 0, `nextAction present: "${b1.error.nextAction}"`);
  assert(b1.error.message.includes("sessionId"), "Field-level detail (sessionId) surfaced in message");
  assert(b1.error.requestId === rid, "requestId echoed");

  console.log("\n=== 2. Authentication error -> actionable message ===");
  const { status: s2, body: b2 } = safeError(new FoundationError("AUTHENTICATION_REQUIRED", "Authentication required", 401), rid) as any;
  assert(s2 === 401, "Status 401");
  assert(b2.error.category === "AUTHENTICATION", "Category AUTHENTICATION");
  assert(b2.error.userMessage === "You need to be logged in to do this.", "Governed userMessage override applied");
  assert(b2.error.nextAction.toLowerCase().includes("log in"), `nextAction tells user to log in: "${b2.error.nextAction}"`);

  console.log("\n=== 3. Authorization error -> actionable message ===");
  const { status: s3, body: b3 } = safeError(new FoundationError("ACCESS_DENIED", "Required permission denied", 403), rid) as any;
  assert(s3 === 403, "Status 403");
  assert(b3.error.category === "AUTHORIZATION", "Category AUTHORIZATION");
  assert(b3.error.supportRequired === true, "supportRequired=true for a permission denial");
  assert(b3.error.retryable === false, "retryable=false (blind retry won't help)");

  console.log("\n=== 4. Missing record -> actionable message ===");
  const { status: s4, body: b4 } = safeError({ code: "P2025", name: "PrismaClientKnownRequestError", message: "An operation failed because it depends on one or more records that were required but not found. Record to update not found." }, rid) as any;
  assert(s4 === 404, "Status 404");
  assert(b4.error.category === "NOT_FOUND", "Category NOT_FOUND");
  assert(!b4.error.message.includes("PrismaClientKnownRequestError"), "Raw Prisma error class name not leaked");
  assert(!b4.error.userMessage.includes("Record to update"), "Raw Prisma phrasing not leaked");

  console.log("\n=== 5. Duplicate/unique conflict -> actionable message ===");
  const { status: s5, body: b5 } = safeError({ code: "P2002", name: "PrismaClientKnownRequestError", message: "Unique constraint failed on the fields: (`normalizedEmail`)", meta: { target: ["normalizedEmail"] } }, rid) as any;
  assert(s5 === 409, "Status 409");
  assert(b5.error.category === "CONFLICT", "Category CONFLICT");
  assert(!b5.error.message.includes("normalizedEmail"), "Raw column name not leaked into user-facing message");
  assert(!b5.error.message.toLowerCase().includes("unique constraint"), "Raw Prisma constraint phrasing not leaked");

  console.log("\n=== 6. Invalid workflow state -> actionable message ===");
  const { body: b6 } = safeError(new FoundationError("QUOTATION_ALREADY_CONVERTED", "Quotation already converted", 409), rid) as any;
  assert(b6.error.category === "CONFLICT", "Category CONFLICT for an already-actioned workflow state");
  assert(b6.error.nextAction.length > 0, `nextAction present: "${b6.error.nextAction}"`);

  console.log("\n=== 7. Daily Working: no active session ===");
  const { status: s7, body: b7 } = safeError(new FoundationError("WORKDAY_NOT_ACTIVE", "Active workday not found", 409), rid) as any;
  assert(s7 === 409, "Status 409");
  assert(b7.error.userMessage === "No active work day was found.", "Governed WORKDAY_NOT_ACTIVE userMessage");
  assert(b7.error.nextAction === "Start your work day first, then try again.", "Governed WORKDAY_NOT_ACTIVE nextAction");
  assert(b7.error.retryable === false, "retryable=false (needs a different action, not a blind retry)");

  console.log("\n=== 8. Daily Working: active session already exists ===");
  const { status: s8, body: b8 } = safeError(new FoundationError("ACTIVE_WORKDAY_EXISTS", "Only one active workday is allowed", 409), rid) as any;
  assert(s8 === 409, "Status 409");
  assert(b8.error.userMessage === "You already have an active work day.", "Governed ACTIVE_WORKDAY_EXISTS userMessage");
  assert(b8.error.nextAction === "End your current work day before starting a new one.", "Governed ACTIVE_WORKDAY_EXISTS nextAction");
  assert(b8.error.category === "CONFLICT", "Category CONFLICT");

  console.log("\n=== 9. Cross-user denial without leaking resource existence ===");
  // endFieldDay's ownership-scoped lookup throws the SAME WORKDAY_NOT_ACTIVE for "doesn't exist"
  // and "exists but isn't yours" — verified in the Daily Working investigation. The governed
  // message must not distinguish the two either (no "this belongs to someone else" wording).
  const { body: b9 } = safeError(new FoundationError("WORKDAY_NOT_ACTIVE", "Active workday not found", 409), rid) as any;
  assert(!b9.error.userMessage.toLowerCase().includes("belongs to"), "No resource-existence/ownership leak in message");
  assert(!b9.error.userMessage.toLowerCase().includes("someone else"), "No resource-existence/ownership leak in message");

  console.log("\n=== 10. Simulated unexpected server error -> safe generic message + requestId ===");
  const { status: s10, body: b10 } = safeError(new TypeError("Cannot read properties of undefined (reading 'foo')"), rid) as any;
  assert(s10 === 500, "Status 500");
  assert(b10.error.code === "INTERNAL_ERROR", "Code is the generic INTERNAL_ERROR, not the raw exception type");
  assert(b10.error.requestId === rid, "requestId present and matches the value passed to safeError (== what the server logs alongside it)");
  assert(b10.error.message.includes(rid), `Error ID visible in the user-facing message for support: "${b10.error.message}"`);
  assert(b10.error.retryable === true, "retryable=true for a transient/unexpected failure");
  assert(b10.error.supportRequired === true, "supportRequired=true for a transient/unexpected failure");

  console.log("\n=== 11. Raw Prisma/stack trace never reaches client ===");
  const nastyError = new TypeError("Cannot read properties of undefined (reading 'foo')");
  const serialized = JSON.stringify(b10);
  assert(!serialized.includes(nastyError.message), "Raw exception message text absent from serialized response body");
  assert(!serialized.includes("TypeError"), "Raw exception constructor name absent from serialized response body");
  assert(!("stack" in b10.error), "No `stack` field anywhere in the error body");
  const dbUrlLeakCheck = safeError({ code: "P1001", name: "PrismaClientInitializationError", message: "Can't reach database server at `ep-example-host.neon.tech:5432`" }, rid) as any;
  assert(!JSON.stringify(dbUrlLeakCheck.body).includes("neon.tech"), "Database hostname not leaked for a DB-unreachable error");
  assert(dbUrlLeakCheck.body.error.category === "INFRASTRUCTURE", "DB-unreachable classified as INFRASTRUCTURE");

  console.log("\n=== 12. Response shape stays backward-compatible (existing successful-path consumers unaffected) ===");
  const { body: b12 } = safeError(new FoundationError("SOME_UNCATALOGED_CODE_XYZ", "A specific domain message from the throw site", 400), rid) as any;
  assert(typeof b12.error.code === "string", "`code` field present (unchanged contract)");
  assert(typeof b12.error.message === "string", "`message` field present (unchanged contract)");
  assert(typeof b12.error.requestId === "string", "`requestId` field present (unchanged contract)");
  assert(b12.error.userMessage === "A specific domain message from the throw site", "Uncataloged code falls back to its own hand-written message, not a blank/generic one");
  assert(b12.error.category === "VALIDATION", "Uncataloged 400-status code defaults to VALIDATION category via status fallback");

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main();
