import { describe, expect, it, vi } from "vitest";

// Production incident 2026-10-14: seera_retailer_order_placed was edited in Meta to 4 body variables while
// the code still sent 5, so every order message failed with HTTP 400 (Meta 132000). The queued payload
// must carry exactly the registry's variable count, in the live body order.
vi.mock("next/server", () => ({ after: () => {} }));
const { queueRetailerCommunication } = await import("@/lib/sales-distribution/retailer-communication-service");
const { templateFor } = await import("@/lib/messaging/whatsapp-templates");

function fakeDb() {
  const created: any[] = [];
  return {
    created,
    seeraRetailer: { findUnique: async () => ({ id: "r1", businessName: "Sharma Store", ownerName: "Ramesh", mobile: "9876543210", whatsapp: null }) },
    seeraSalesOrder: { findFirst: async () => ({ orderNumber: "RO-TEST123" }), findUnique: async () => ({ orderNumber: "RO-TEST123" }) },
    seeraVisit: { findUnique: async () => null },
    user: { findUnique: async () => ({ name: "Rep Name" }) },
    outboxEvent: { create: async ({ data }: any) => { created.push(data); return { id: "ob1", ...data }; }, findFirst: async () => null },
  } as any;
}

describe("order-placed WhatsApp matches the live 4-variable template", () => {
  it("registry records 4 variables for seera_retailer_order_placed", () => {
    const t = templateFor("RETAILER_ORDER_PLACED");
    expect(t.metaTemplateName).toBe("seera_retailer_order_placed");
    expect(t.paramLabels).toEqual(["Retailer/contact name", "Outlet name", "Visit date", "Order number/status"]);
  });

  it("queued payload has exactly 4 params: contact, outlet, visit date, order number", async () => {
    const db = fakeDb();
    const r = await queueRetailerCommunication(db, { eventType: "ORDER_RECORDED", retailerId: "r1", actorId: "a1" });
    expect(r.queued).toBe(true);
    const params = db.created[0].payload.templateParams;
    expect(params).toHaveLength(templateFor("RETAILER_ORDER_PLACED").paramLabels.length);
    expect(params[0]).toBe("Ramesh");
    expect(params[1]).toBe("Sharma Store");
    expect(params[2]).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(params[3]).toBe("RO-TEST123");
    expect(params).not.toContain("Rep Name");
  });
});
