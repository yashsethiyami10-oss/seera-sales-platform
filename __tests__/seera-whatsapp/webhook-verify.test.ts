import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "../../app/api/webhooks/whatsapp/route";

// GET-only verification handshake tests — no database involved (Meta's subscribe verification
// is a pure request/response exchange), so these run in the default `npm test` suite safely.

const ORIGINAL_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

describe("WhatsApp webhook GET verification", () => {
  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token-123";
  });
  afterEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = ORIGINAL_TOKEN;
  });

  it("echoes hub.challenge verbatim when mode=subscribe and the token matches", async () => {
    const url = "https://www.seeradetergent.in/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token-123&hub.challenge=echo-me-12345";
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("echo-me-12345");
  });

  it("rejects with 403 when the verify token does not match", async () => {
    const url = "https://www.seeradetergent.in/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=echo-me-12345";
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("rejects with 403 when hub.mode is not 'subscribe'", async () => {
    const url = "https://www.seeradetergent.in/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=test-verify-token-123&hub.challenge=echo-me-12345";
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("returns 503 (not a silent pass-through) when WHATSAPP_WEBHOOK_VERIFY_TOKEN isn't configured at all", async () => {
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    const url = "https://www.seeradetergent.in/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=echo-me-12345";
    const res = await GET(new Request(url));
    expect(res.status).toBe(503);
  });
});
