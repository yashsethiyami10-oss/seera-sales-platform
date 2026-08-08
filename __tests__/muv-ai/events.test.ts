import { describe, it, expect, afterAll } from "vitest";
import { setTestIp, uniqueIp } from "./test-helpers";
import { prisma } from "@/lib/prisma";
import { logMuvAiEvent } from "@/actions/muv-ai-beta";

describe("Operational analytics foundation", () => {
  afterAll(async () => {
    await prisma.muvAiEvent.deleteMany({ where: { sessionId: { startsWith: "test-events-" } } });
  });

  it("a valid event is persisted with its type and properties", async () => {
    setTestIp(uniqueIp("events-basic"));
    const sessionId = "test-events-basic";
    const result = await logMuvAiEvent({ type: "WIDGET_OPENED", sessionId, properties: { source: "launcher" } });
    expect(result.success).toBe(true);

    const row = await prisma.muvAiEvent.findFirst({ where: { sessionId, type: "WIDGET_OPENED" } });
    expect(row).not.toBeNull();
    expect(row?.eventVersion).toBe(1);
  });

  it("an invalid (non-whitelisted) event type never gets persisted, but the caller is never disrupted", async () => {
    setTestIp(uniqueIp("events-invalid"));
    const sessionId = "test-events-invalid";
    const result = await logMuvAiEvent({ type: "SOMETHING_MADE_UP", sessionId }); // deliberately invalid event type
    expect(result.success).toBe(true); // non-blocking — never surfaces the rejection to the caller

    const row = await prisma.muvAiEvent.findFirst({ where: { sessionId } });
    expect(row).toBeNull(); // ...but nothing was actually written for the invalid type
  });

  it("logging never throws even for malformed input", async () => {
    setTestIp(uniqueIp("events-malformed"));
    const result = await logMuvAiEvent(null); // deliberately malformed input
    expect(result.success).toBe(true);
  });

  it("does not store raw free-text message content in properties (structural values only)", async () => {
    setTestIp(uniqueIp("events-structural"));
    const sessionId = "test-events-structural";
    // properties only accept string/number/boolean/null values — an object
    // or array (a plausible way raw content could sneak in) is rejected.
    const result = await logMuvAiEvent({ type: "MESSAGE_SUBMITTED", sessionId, properties: { nested: { text: "raw customer message" } } });
    expect(result.success).toBe(true); // still non-blocking...
    const row = await prisma.muvAiEvent.findFirst({ where: { sessionId, type: "MESSAGE_SUBMITTED" } });
    expect(row).toBeNull(); // ...but the malformed (nested-object) properties payload was rejected, not stored
  });
});
