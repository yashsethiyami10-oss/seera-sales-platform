import { describe, it, expect, afterAll } from "vitest";
import { setTestIp, uniqueIp } from "./test-helpers";
import { prisma } from "@/lib/prisma";
import { logMuvAiEvent, submitMuvAiFeedback } from "@/actions/muv-ai-beta";
import { requestMuvAiHandoffSchema, logMuvAiEventSchema, submitMuvAiFeedbackSchema } from "@/lib/validations/muv-ai-beta";
import { startSession } from "@/actions/experience";

const createdSessionIds: string[] = [];

describe("Request resilience", () => {
  afterAll(async () => {
    await prisma.experienceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.muvAiEvent.deleteMany({ where: { sessionId: { startsWith: "test-resilience-" } } });
  });

  it("rate limiting caps repeated event logging from the same IP within the window", async () => {
    const ip = uniqueIp("resilience-rl-events");
    setTestIp(ip);
    const sessionId = "test-resilience-rate-limit";

    // The configured limit for logMuvAiEvent is 60/min — send well beyond
    // that from a single IP and confirm the row count stops growing at the
    // ceiling, not the attempted count.
    for (let i = 0; i < 65; i++) {
      await logMuvAiEvent({ type: "WIDGET_OPENED", sessionId });
    }

    const count = await prisma.muvAiEvent.count({ where: { sessionId } });
    expect(count).toBeLessThanOrEqual(60);
    expect(count).toBeGreaterThan(0);
  }, 30000);

  it("feedback submission is rate-limited per IP (20/min) and surfaces a truthful RATE_LIMITED failure once exceeded", async () => {
    const ip = uniqueIp("resilience-rl-feedback");
    setTestIp(ip);
    const created = await startSession({ channel: "WEBSITE" });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdSessionIds.push(created.data.session.id);

    let sawRateLimited = false;
    for (let i = 0; i < 25; i++) {
      const result = await submitMuvAiFeedback({ sessionId: created.data.session.id, turnReference: `turn-${i}`, helpful: true });
      if (!result.success && result.error.code === "RATE_LIMITED") sawRateLimited = true;
    }
    expect(sawRateLimited).toBe(true);
  }, 30000);

  it("composer input length is capped in the Wave-2 schemas consistent with Module 8's own 2000-char message limit", () => {
    const tooLong = "a".repeat(1001);
    const withinLimit = requestMuvAiHandoffSchema.safeParse({ sessionId: "s1", contactEmail: "a@b.com", message: tooLong });
    expect(withinLimit.success).toBe(false); // handoff message capped at 1000, deliberately shorter than the composer
  });

  it("event properties reject deeply-nested/object values (structural-only enforcement)", () => {
    const result = logMuvAiEventSchema.safeParse({ type: "WIDGET_OPENED", properties: { a: { nested: true } } });
    expect(result.success).toBe(false);
  });

  it("feedback schema rejects a missing turn reference", () => {
    const result = submitMuvAiFeedbackSchema.safeParse({ sessionId: "s1", helpful: true });
    expect(result.success).toBe(false);
  });

  it("feedback schema rejects a non-boolean 'helpful' value", () => {
    const result = submitMuvAiFeedbackSchema.safeParse({ sessionId: "s1", turnReference: "t1", helpful: "yes" });
    expect(result.success).toBe(false);
  });
});
