import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { startSession, closeSession } from "@/actions/experience";
import { validateMuvAiSession } from "@/actions/muv-ai-beta";

const createdSessionIds: string[] = [];

describe("Conversation continuity — session validation", () => {
  afterAll(async () => {
    await prisma.experienceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
  });

  it("opening creates a session, and it validates as restorable", async () => {
    const created = await startSession({ channel: "WEBSITE" });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdSessionIds.push(created.data.session.id);

    const validation = await validateMuvAiSession(created.data.session.id);
    expect(validation.success).toBe(true);
    if (validation.success) expect(validation.data.valid).toBe(true);
  });

  it("an unknown session id fails closed rather than throwing", async () => {
    const validation = await validateMuvAiSession("nonexistent-session-id");
    expect(validation.success).toBe(true);
    if (validation.success) expect(validation.data.valid).toBe(false);
  });

  it("a closed session fails closed (does not validate as restorable)", async () => {
    const created = await startSession({ channel: "WEBSITE" });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdSessionIds.push(created.data.session.id);

    await closeSession({ sessionId: created.data.session.id });

    const validation = await validateMuvAiSession(created.data.session.id);
    expect(validation.success).toBe(true);
    if (validation.success) expect(validation.data.valid).toBe(false);
  });

  it("empty/malformed input fails closed without throwing", async () => {
    // @ts-expect-error — deliberately malformed input
    const validation = await validateMuvAiSession(undefined);
    expect(validation.success).toBe(true);
    if (validation.success) expect(validation.data.valid).toBe(false);
  });

  it("two independently-created sessions never validate as each other (no cross-session restoration)", async () => {
    const a = await startSession({ channel: "WEBSITE" });
    const b = await startSession({ channel: "WEBSITE" });
    expect(a.success && b.success).toBe(true);
    if (!a.success || !b.success) return;
    createdSessionIds.push(a.data.session.id, b.data.session.id);

    expect(a.data.session.id).not.toBe(b.data.session.id);
    const validationA = await validateMuvAiSession(a.data.session.id);
    const validationB = await validateMuvAiSession(b.data.session.id);
    expect(validationA.success && validationA.data.valid).toBe(true);
    expect(validationB.success && validationB.data.valid).toBe(true);
  });
});
