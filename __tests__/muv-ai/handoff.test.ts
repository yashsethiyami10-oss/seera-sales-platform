import { describe, it, expect, afterAll } from "vitest";
import { setTestIp, uniqueIp } from "./test-helpers";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/actions/experience";
import { requestMuvAiHandoff } from "@/actions/muv-ai-beta";

const createdSessionIds: string[] = [];

describe("Human support handoff", () => {
  afterAll(async () => {
    await prisma.experienceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  });

  async function freshSessionId() {
    const created = await startSession({ channel: "WEBSITE" });
    if (!created.success) throw new Error("setup failed");
    createdSessionIds.push(created.data.session.id);
    return created.data.session.id;
  }

  it("a successful handoff request is truthfully persisted on the session", async () => {
    setTestIp(uniqueIp("handoff-success"));
    const sessionId = await freshSessionId();

    const result = await requestMuvAiHandoff({ sessionId, contactEmail: "beta-tester@example.com", message: "Need help with an order" });
    expect(result.success).toBe(true);

    const row = await prisma.experienceSession.findUnique({ where: { id: sessionId } });
    expect(row?.handoffRequestedAt).not.toBeNull();
    expect(row?.handoffContactEmail).toBe("beta-tester@example.com");
    expect(row?.handoffMessage).toBe("Need help with an order");
  });

  it("a request for a nonexistent session truthfully fails — never a false success", async () => {
    setTestIp(uniqueIp("handoff-missing"));
    const result = await requestMuvAiHandoff({ sessionId: "nonexistent-session", contactEmail: "x@example.com" });
    expect(result.success).toBe(false);
  });

  it("requires at least an email or a phone number", async () => {
    setTestIp(uniqueIp("handoff-no-contact"));
    const sessionId = await freshSessionId();
    const result = await requestMuvAiHandoff({ sessionId, message: "please call me" });
    expect(result.success).toBe(false);
  });

  it("accepts a phone-only contact (email is not mandatory)", async () => {
    setTestIp(uniqueIp("handoff-phone-only"));
    const sessionId = await freshSessionId();
    const result = await requestMuvAiHandoff({ sessionId, contactPhone: "9876543210" });
    expect(result.success).toBe(true);
  });
});
