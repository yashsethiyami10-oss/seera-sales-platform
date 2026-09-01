import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Money Desk Founder finalization boundary", () => {
  it("keeps Founder finalization internal and permission-gated", () => {
    const quickEntry = readFileSync(path.join(process.cwd(), "lib/finance/quick-entry-service.ts"), "utf8");
    const moneyDesk = readFileSync(path.join(process.cwd(), "lib/finance/money-desk-service.ts"), "utf8");
    expect(quickEntry).toContain("finalizeForFounder?: boolean");
    expect(quickEntry).toContain('input.finalizeForFounder && permissions.has("system:super_admin")');
    expect(moneyDesk).toContain("finalizeForFounder: Boolean((await effectivePermissions(db, actorId)).has("system:super_admin"))");
    expect(moneyDesk).toContain('counterpartyType: def.counterpartyType === "NONE" ? input.counterpartyType : def.counterpartyType');
  });

  it("makes procurement party name sufficient to resolve a real Vendor master record", () => {
    const registry = readFileSync(path.join(process.cwd(), "lib/finance/money-desk-registry.ts"), "utf8");
    const service = readFileSync(path.join(process.cwd(), "lib/finance/money-desk-service.ts"), "utf8");
    expect(registry).toContain('requiredFields: ["counterpartyName", "materialId"');
    expect(registry).toContain('optionalFields: ["counterpartyId", "unitCost"');
    expect(service).toContain("db.seeraVendor.findFirst");
    expect(service).toContain("createVendor(db, actorId");
    expect(service).toContain('action: "money_desk.counterparty.resolved"');
  });
});
