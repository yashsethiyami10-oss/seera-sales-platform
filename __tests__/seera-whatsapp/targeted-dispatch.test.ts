import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { dispatchOutboxEventById } from "../../lib/messaging/outbox-dispatch";

// Live proof for a real production incident: a just-queued OutboxEvent sat at position #4 of 4
// in the PENDING backlog, so the original fix (an oldest-first dispatchWhatsAppOutbox call with
// limit:1 from after()) kept re-attempting a four-day-old stuck row instead of the new message —
// the new checkout's WhatsApp notification was never even looked at. dispatchOutboxEventById
// replaces that for the immediate-dispatch nudge — this proves it sends exactly the given id and
// leaves every other PENDING row (including an older one that a limit:1 batch call would have
// picked instead) completely untouched, regardless of how large the backlog is. Deliberately
// does not re-assert dispatchWhatsAppOutbox's own oldest-first behavior here — TEST DB is shared
// across this whole suite/other scripts, so its exact backlog contents aren't this test's to
// control; that property is unit-testable in isolation and isn't what changed in this fix.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(__dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

const AGGREGATE = `test-targeted-dispatch-${randomUUID()}`;

function fakeProvider(id: string) {
  return () => ({ sendWhatsApp: async () => ({ id }) });
}

async function makeRow(createdAt: Date, providerMessageIdSeed: string) {
  return db.outboxEvent.create({
    data: {
      eventType: "TEST_EVENT",
      aggregateType: "SeeraRetailer",
      aggregateId: AGGREGATE,
      payload: { mobile: "919876543210", templateName: "seera_retailer_order_placed", templateParams: ["a", "b", "c", "d", "e"], templateKey: "RETAILER_ORDER_PLACED", languageCode: "hi" },
      status: "PENDING",
      channel: "WHATSAPP",
      templateKey: "RETAILER_ORDER_PLACED",
      createdAt,
      availableAt: createdAt,
    },
  });
}

describe("dispatchOutboxEventById targets the given event, not the oldest backlog item", () => {
  afterAll(async () => {
    await db.outboxEvent.deleteMany({ where: { aggregateType: "SeeraRetailer", aggregateId: AGGREGATE } });
    await db.$disconnect();
  });

  it("sends the specific new row and leaves an older PENDING row for the same aggregate completely untouched", async () => {
    console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
    const oldRow = await makeRow(new Date(Date.now() - 4 * 86_400_000), "old");
    const newRow = await makeRow(new Date(), "new");

    // The fix under test: target newRow directly by id — a limit:1 oldest-first batch call
    // (the architecture this replaced for the immediate-dispatch nudge) would have picked oldRow
    // instead, exactly the production incident this regression-tests.
    const targeted = await dispatchOutboxEventById(db, fakeProvider("targeted-wamid-123"), newRow.id);
    expect(targeted?.status).toBe("PUBLISHED");

    const newAfter = await db.outboxEvent.findUniqueOrThrow({ where: { id: newRow.id } });
    expect(newAfter.status).toBe("PUBLISHED");
    expect(newAfter.providerMessageId).toBe("targeted-wamid-123");

    // oldRow must be completely unaffected by a call that targeted a different id.
    const oldAfter = await db.outboxEvent.findUniqueOrThrow({ where: { id: oldRow.id } });
    expect(oldAfter.status).toBe("PENDING");
    expect(oldAfter.attempts).toBe(0);
    expect(oldAfter.providerMessageId).toBeNull();
  });

  it("returns null for an id that doesn't exist or isn't eligible, never throws", async () => {
    expect(await dispatchOutboxEventById(db, fakeProvider("x"), "nonexistent-id")).toBeNull();
  });
});
