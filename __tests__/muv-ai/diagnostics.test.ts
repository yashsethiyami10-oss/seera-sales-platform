import { describe, it, expect, vi, afterAll, beforeAll, beforeEach } from "vitest";
import { setTestIp, uniqueIp } from "./test-helpers";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/actions/experience";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { checkMuvAiDiagnosticsAccess, getMuvAiTurnDiagnostics } from "@/actions/muv-ai-beta";

const mockAuth = vi.mocked(auth);
const createdSessionIds: string[] = [];

// SalesAuditLog.userId is a real foreign key — the ADMIN case needs a real
// User row (STAFF/CUSTOMER never reach the audit write; requireAdmin()
// rejects them first, so a synthetic id is fine for those two).
let realAdminUserId = "";

function sessionFor(role: "ADMIN" | "STAFF" | "CUSTOMER") {
  const id = role === "ADMIN" ? realAdminUserId : `test-user-${role.toLowerCase()}`;
  return { user: { id, role } } as any;
}

const baseTurnInput = {
  executionStatus: "EXECUTED" as const,
  requiresHandoff: false,
  allowFollowUp: true,
  segmentKinds: ["MESSAGE", "REFERENCE_CARD"],
  durationMs: 123,
  generatedAt: new Date().toISOString(),
};

describe("Founder-only diagnostic mode — server-side authorization", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `muv-ai-wave2-test-admin-${Date.now()}@example.invalid`, role: "ADMIN" },
    });
    realAdminUserId = user.id;
  });

  afterAll(async () => {
    await prisma.experienceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    // SalesAuditLog rows are deliberately immutable at the database level
    // (a real Postgres rule rejects DELETE — confirmed by running this
    // suite: "sales audit logs are immutable") — this is genuine,
    // pre-existing audit infrastructure being reused exactly as intended,
    // not a test-cleanup gap. The one row this suite writes is left in
    // place permanently, by the audit table's own design; the test User
    // row it references is therefore also left in place (deleting it
    // would violate the audit row's own foreign key).
  });

  beforeEach(() => {
    mockAuth.mockReset();
  });

  async function freshSessionId() {
    const created = await startSession({ channel: "WEBSITE" });
    if (!created.success) throw new Error("setup failed");
    createdSessionIds.push(created.data.session.id);
    return created.data.session.id;
  }

  it("checkMuvAiDiagnosticsAccess reports authorized for ADMIN", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const result = await checkMuvAiDiagnosticsAccess();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAuthorized).toBe(true);
  });

  it("checkMuvAiDiagnosticsAccess reports NOT authorized for STAFF (founder/admin only, not general staff)", async () => {
    mockAuth.mockResolvedValue(sessionFor("STAFF"));
    const result = await checkMuvAiDiagnosticsAccess();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAuthorized).toBe(false);
  });

  it("checkMuvAiDiagnosticsAccess reports NOT authorized for an ordinary customer", async () => {
    mockAuth.mockResolvedValue(sessionFor("CUSTOMER"));
    const result = await checkMuvAiDiagnosticsAccess();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAuthorized).toBe(false);
  });

  it("checkMuvAiDiagnosticsAccess reports NOT authorized when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    const result = await checkMuvAiDiagnosticsAccess();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAuthorized).toBe(false);
  });

  it("an authorized ADMIN can fetch a turn's diagnostics", async () => {
    setTestIp(uniqueIp("diag-admin"));
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const sessionId = await freshSessionId();

    const result = await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });
    expect(result.success).toBe(true);
  });

  it("an ordinary customer is rejected server-side — real enforcement, not just UI hiding", async () => {
    setTestIp(uniqueIp("diag-customer"));
    mockAuth.mockResolvedValue(sessionFor("CUSTOMER"));
    const sessionId = await freshSessionId();

    const result = await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("general STAFF (not founder/admin) is also rejected — diagnostics are admin-only, stricter than the usual staff tier", async () => {
    setTestIp(uniqueIp("diag-staff"));
    mockAuth.mockResolvedValue(sessionFor("STAFF"));
    const sessionId = await freshSessionId();

    const result = await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("an unauthenticated caller is rejected — 'client-side manipulation cannot unlock diagnostics' has nothing to manipulate server-side", async () => {
    setTestIp(uniqueIp("diag-anon"));
    mockAuth.mockResolvedValue(null as any);
    const sessionId = await freshSessionId();

    const result = await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("the returned snapshot contains only the pre-approved fields — no confidence, no safety reasoning, no system prompt", async () => {
    setTestIp(uniqueIp("diag-fields"));
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const sessionId = await freshSessionId();

    const result = await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const snapshot = result.data.snapshot as Record<string, unknown>;
    const allowedKeys = new Set([
      "sessionId", "turnId", "executionStatus", "escalationStatus", "allowFollowUp",
      "retrievedSourceCountProxy", "responseSegmentTypes", "processingDurationMs",
      "architectureVersion", "aiVersion",
    ]);
    for (const key of Object.keys(snapshot)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    expect(snapshot).not.toHaveProperty("confidence");
    expect(snapshot).not.toHaveProperty("systemPrompt");
    expect(snapshot).not.toHaveProperty("reasoning");
    expect(snapshot).not.toHaveProperty("safetyReasons");
  });

  it("diagnostic access is audited via the existing SalesAuditLog", async () => {
    setTestIp(uniqueIp("diag-audit"));
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const sessionId = await freshSessionId();

    await getMuvAiTurnDiagnostics({ sessionId, ...baseTurnInput });

    const auditRow = await prisma.salesAuditLog.findFirst({
      where: { module: "muv-ai-wave2", action: "DIAGNOSTICS_VIEWED", recordId: sessionId },
    });
    expect(auditRow).not.toBeNull();
  });
});
