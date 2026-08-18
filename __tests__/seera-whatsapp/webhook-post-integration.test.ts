import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../../lib/database/client";
import { POST } from "../../app/api/webhooks/whatsapp/route";

// Integration tests against the real TEST database (see __tests__/muv-ai/test-setup.ts, which
// this suite inherits via vitest.config.ts's global setupFiles — process.env.DATABASE_URL is
// already repointed at TEST_DATABASE_URL before this file's imports resolve). Covers test
// matrix items H (duplicate webhook -> no duplicate state corruption), I (delivered webhook ->
// DELIVERED), J (failed webhook -> FAILED), and N (isolation: mismatched phone_number_id is
// dropped, never processed).

const TEST_PHONE_NUMBER_ID = "test-seera-phone-number-id";
const WEBHOOK_URL = "https://www.seeradetergent.in/api/webhooks/whatsapp";

let originalPhoneNumberId: string | undefined;
let originalAppSecret: string | undefined;

function metaStatusPayload(phoneNumberId: string, messageId: string, status: string, timestamp: string, extra: Record<string, unknown> = {}) {
  return {
    entry: [
      {
        id: "test-waba-id",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "910000000000", phone_number_id: phoneNumberId },
              statuses: [{ id: messageId, status, timestamp, recipient_id: "919876543210", ...extra }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

async function postWebhook(body: unknown) {
  return POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

describe("WhatsApp webhook POST — status transitions, idempotency, isolation", () => {
  beforeAll(() => {
    originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    originalAppSecret = process.env.WHATSAPP_APP_SECRET;
    process.env.WHATSAPP_PHONE_NUMBER_ID = TEST_PHONE_NUMBER_ID;
    // Deliberately exercised WITHOUT an app secret here — the metadata phone_number_id match is
    // this suite's isolation guard; a separate concern (signature verification itself) would
    // need a real HMAC computed with a configured secret, not exercised by these tests.
    delete process.env.WHATSAPP_APP_SECRET;
  });
  afterAll(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
    process.env.WHATSAPP_APP_SECRET = originalAppSecret;
  });

  async function seedOutboxEvent(providerMessageId: string, status: "PUBLISHED" | "READ" = "PUBLISHED") {
    return prisma.outboxEvent.create({
      data: {
        eventType: "ORDER_RECORDED",
        aggregateType: "SeeraRetailer",
        aggregateId: `whatsapp-webhook-test-${Date.now()}`,
        payload: { mobile: "919876543210", templateName: "seera_retailer_order_placed", templateParams: ["Test Outlet", "SO-1", "Rs 100"], templateKey: "RETAILER_ORDER_PLACED" },
        status,
        channel: "WHATSAPP",
        providerMessageId,
        ...(status === "READ" ? { readAt: new Date() } : {}),
      },
    });
  }

  it("updates OutboxEvent to DELIVERED on a delivered status webhook", async () => {
    const messageId = `wamid.test-${Date.now()}-delivered`;
    const event = await seedOutboxEvent(messageId);

    const res = await postWebhook(metaStatusPayload(TEST_PHONE_NUMBER_ID, messageId, "delivered", String(Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(200);

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe("DELIVERED");
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("is idempotent: an exact-duplicate redelivery of the same status event does not error and does not double-process", async () => {
    const messageId = `wamid.test-${Date.now()}-dup`;
    const event = await seedOutboxEvent(messageId);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = metaStatusPayload(TEST_PHONE_NUMBER_ID, messageId, "delivered", timestamp);

    const first = await postWebhook(payload);
    expect(first.status).toBe(200);
    const afterFirst = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(afterFirst.status).toBe("DELIVERED");
    const deliveredAtFirst = afterFirst.deliveredAt?.getTime();

    // Exact same payload again — Meta's own documented redelivery behavior.
    const second = await postWebhook(payload);
    expect(second.status).toBe(200);
    const afterSecond = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(afterSecond.status).toBe("DELIVERED");
    expect(afterSecond.deliveredAt?.getTime()).toBe(deliveredAtFirst); // untouched by the duplicate, not reprocessed

    const receipts = await prisma.whatsAppWebhookReceipt.count({ where: { dedupeKey: `${messageId}:delivered:${timestamp}` } });
    expect(receipts).toBe(1); // the second insert attempt was rejected by the unique constraint, not duplicated
  });

  it("marks FAILED with the Meta error code on a failed status webhook", async () => {
    const messageId = `wamid.test-${Date.now()}-failed`;
    const event = await seedOutboxEvent(messageId);

    const res = await postWebhook(
      metaStatusPayload(TEST_PHONE_NUMBER_ID, messageId, "failed", String(Math.floor(Date.now() / 1000)), { errors: [{ code: 131026, title: "Message undeliverable" }] }),
    );
    expect(res.status).toBe(200);

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.lastErrorCode).toBe("131026");
  });

  it("never regresses a READ message back to DELIVERED on a late/out-of-order status webhook", async () => {
    const messageId = `wamid.test-${Date.now()}-outoforder`;
    const event = await seedOutboxEvent(messageId, "READ");

    const res = await postWebhook(metaStatusPayload(TEST_PHONE_NUMBER_ID, messageId, "delivered", String(Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(200);

    const after = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe("READ"); // not regressed to DELIVERED
  });

  it("MUV/cross-tenant isolation: a status webhook for a different phone_number_id is dropped, never applied", async () => {
    const messageId = `wamid.test-${Date.now()}-otherphone`;
    const event = await seedOutboxEvent(messageId);

    const res = await postWebhook(metaStatusPayload("some-other-unrelated-phone-number-id", messageId, "delivered", String(Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(200); // still 200 (never invites a Meta retry-storm)

    const untouched = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(untouched.status).toBe("PUBLISHED"); // unchanged — the mismatched entry was never processed
  });

  it("a status event for an unrecognized providerMessageId is a safe no-op (not an error)", async () => {
    const res = await postWebhook(metaStatusPayload(TEST_PHONE_NUMBER_ID, `wamid.unknown-${Date.now()}`, "delivered", String(Math.floor(Date.now() / 1000))));
    expect(res.status).toBe(200);
  });
});
