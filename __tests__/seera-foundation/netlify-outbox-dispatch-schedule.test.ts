import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { runOutboxDispatch, config, DISPATCH_URL, REQUEST_TIMEOUT_MS } from "../../netlify/functions/outbox-dispatch.mjs";

// Netlify Scheduled Function that triggers POST /api/outbox/dispatch. Pure unit test: fetch is mocked,
// nothing is sent and no database is touched.
const SECRET = "unit-test-secret-value";
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.restoreAllMocks());

function captureLogs() {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(JSON.stringify(a)));
  vi.spyOn(console, "error").mockImplementation((...a) => void lines.push(JSON.stringify(a)));
  return lines;
}

describe("Netlify outbox dispatch schedule", () => {
  it("is scheduled every 5 minutes and stays below Netlify's 30 s limit", () => {
    expect(config.schedule).toBe("*/5 * * * *");
    expect(REQUEST_TIMEOUT_MS).toBeLessThan(30_000);
    expect(DISPATCH_URL).toBe("https://www.seeradetergent.in/api/outbox/dispatch");
  });

  it("does nothing unless SEERA_OUTBOX_DISPATCH_ENABLED is exactly 'true' (default disabled)", async () => {
    const fetchImpl = vi.fn();
    captureLogs();
    for (const v of [undefined, "", "false", "TRUE", "1", "yes"]) {
      expect(await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: v, SEERA_OUTBOX_WORKER_SECRET: SECRET }, fetchImpl)).toEqual({ ran: false, reason: "disabled" });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does nothing when enabled but the worker secret is missing", async () => {
    const fetchImpl = vi.fn();
    captureLogs();
    expect(await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true" }, fetchImpl)).toEqual({ ran: false, reason: "secret_not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends exactly one POST with the secret header, JSON content type, {limit:20} and a timeout signal", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ processed: 2, retailer: 1, partner: 1, summary: { PUBLISHED: 2 }, ids: ["a", "b"] }));
    captureLogs();
    const result = await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true", SEERA_OUTBOX_WORKER_SECRET: SECRET }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(DISPATCH_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "x-outbox-worker-secret": SECRET });
    expect(JSON.parse(init.body)).toEqual({ limit: 20 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe("error"); // secret never follows a redirect; a host change fails loudly
    expect(result).toMatchObject({ ran: true, ok: true, status: 200, processed: 2, retailer: 1, partner: 1, summary: { PUBLISHED: 2 } });
  });

  it("handles non-2xx once (no retry) and logs only the status and governed error code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ error: { code: "ACCESS_DENIED", message: "Invalid or missing worker secret" } }, 403));
    const logs = captureLogs();
    expect(await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true", SEERA_OUTBOX_WORKER_SECRET: SECRET }, fetchImpl)).toEqual({ ran: true, ok: false, status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logs.join("\n")).toContain("ACCESS_DENIED");
    expect(logs.join("\n")).not.toContain("Invalid or missing worker secret");
  });

  it("handles a timeout or network error once without throwing or retrying", async () => {
    captureLogs();
    const timeout = vi.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    expect(await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true", SEERA_OUTBOX_WORKER_SECRET: SECRET }, timeout)).toEqual({ ran: true, ok: false, reason: "timeout" });
    const network = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true", SEERA_OUTBOX_WORKER_SECRET: SECRET }, network)).toEqual({ ran: true, ok: false, reason: "network_error" });
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("never logs the secret, phone numbers, message text or outbox ids", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ processed: 1, retailer: 1, partner: 0, summary: { PUBLISHED: 1 }, ids: ["outbox-id-123"], mobile: "919999999999", text: "secret message" }));
    const logs = captureLogs();
    await runOutboxDispatch({ SEERA_OUTBOX_DISPATCH_ENABLED: "true", SEERA_OUTBOX_WORKER_SECRET: SECRET }, fetchImpl);
    const out = logs.join("\n");
    for (const s of [SECRET, "919999999999", "secret message", "outbox-id-123"]) expect(out).not.toContain(s);
  });

  it("source never hardcodes a secret and reads it only from the environment", () => {
    const src = readFileSync(path.resolve(__dirname, "../../netlify/functions/outbox-dispatch.mts"), "utf8");
    expect(src).toContain("env.SEERA_OUTBOX_WORKER_SECRET");
    expect(src).not.toMatch(/x-outbox-worker-secret":\s*"[^"]+"/);
  });
});
