import { describe, it, expect, afterAll } from "vitest";
import { setTestIp, uniqueIp } from "./test-helpers";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/actions/experience";
import { submitMuvAiFeedback } from "@/actions/muv-ai-beta";

const createdSessionIds: string[] = [];

describe("Customer feedback", () => {
  afterAll(async () => {
    await prisma.experienceFeedback.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    await prisma.experienceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  });

  async function freshSessionId() {
    const created = await startSession({ channel: "WEBSITE" });
    if (!created.success) throw new Error("setup failed");
    createdSessionIds.push(created.data.session.id);
    return created.data.session.id;
  }

  it("feedback references the correct session and turn", async () => {
    setTestIp(uniqueIp("feedback-basic"));
    const sessionId = await freshSessionId();
    const turnReference = new Date().toISOString();

    const result = await submitMuvAiFeedback({ sessionId, turnReference, helpful: true });
    expect(result.success).toBe(true);

    const row = await prisma.experienceFeedback.findFirst({ where: { sessionId, turnReference } });
    expect(row).not.toBeNull();
    expect(row?.rating).toBe(5);
  });

  it("duplicate submission for the same turn corrects the existing row instead of creating a second one", async () => {
    setTestIp(uniqueIp("feedback-dup"));
    const sessionId = await freshSessionId();
    const turnReference = new Date().toISOString();

    await submitMuvAiFeedback({ sessionId, turnReference, helpful: true });
    await submitMuvAiFeedback({ sessionId, turnReference, helpful: false }); // changed their mind

    const rows = await prisma.experienceFeedback.findMany({ where: { sessionId, turnReference } });
    expect(rows.length).toBe(1);
    expect(rows[0]?.rating).toBe(1); // corrected to "not helpful"
  });

  it("feedback for a nonexistent session fails truthfully, not silently", async () => {
    setTestIp(uniqueIp("feedback-missing"));
    const result = await submitMuvAiFeedback({ sessionId: "nonexistent-session", turnReference: "x", helpful: true });
    expect(result.success).toBe(false);
  });

  it("feedback failure does not throw — always resolves to a structured result", async () => {
    setTestIp(uniqueIp("feedback-malformed"));
    const result = await submitMuvAiFeedback({ sessionId: 123, helpful: "yes" }); // deliberately malformed input
    expect(result.success).toBe(false);
  });
});
