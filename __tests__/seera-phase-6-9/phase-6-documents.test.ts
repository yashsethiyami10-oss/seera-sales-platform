import { describe, expect, it } from "vitest";
import { assertDocumentMutable, assertLegalIssuer, assertOptionalBilling, assertShareAccess, calculateGst, documentNumber } from "@/lib/sales-distribution/phase6-9-rules";

describe("Phase 6 governed documents", () => {
  it("splits intrastate GST", () => expect(calculateGst({ taxableValue: 1000, gstRate: 18, issuerStateCode: "09", supplyStateCode: "09" })).toEqual({ cgst: 90, sgst: 90, igst: 0, totalTax: 180, grandTotal: 1180 }));
  it("uses IGST for interstate supply", () => expect(calculateGst({ taxableValue: 1000, gstRate: 18, issuerStateCode: "09", supplyStateCode: "27" }).igst).toBe(180));
  it("keeps creator distinct from legal issuer", () => expect(assertLegalIssuer({ sellerType: "DISTRIBUTOR", sellerId: "d1", issuerType: "DISTRIBUTOR", issuerId: "d1", actorId: "manager1" })).toEqual({ legalIssuerId: "d1", createdById: "manager1" }));
  it("rejects issuer substitution", () => expect(() => assertLegalIssuer({ sellerType: "DISTRIBUTOR", sellerId: "d1", issuerType: "COMPANY", issuerId: "c1", actorId: "manager1" })).toThrow("LEGAL_ISSUER_MISMATCH"));
  it("makes issued documents immutable", () => expect(() => assertDocumentMutable("ISSUED")).toThrow("ISSUED_DOCUMENT_IMMUTABLE"));
  it("supports optional and external billing modes", () => expect(["SYSTEM", "UPLOAD", "PENDING", "SUPPORTING"].map((mode) => assertOptionalBilling(mode as never))).toHaveLength(4));
  it("creates deterministic scoped numbers", () => expect(documentNumber({ prefix: "INV", financialYear: "2026-27", nextNumber: 42n, type: "TAX_INVOICE" })).toBe("INV/INV/2026-27/000042"));
  it("encodes different document types with different codes, avoiding a printed-number collision across types", () => {
    expect(documentNumber({ prefix: "INV", financialYear: "2026-27", nextNumber: 1n, type: "TAX_INVOICE" })).toBe("INV/INV/2026-27/000001");
    expect(documentNumber({ prefix: "INV", financialYear: "2026-27", nextNumber: 1n, type: "PAYMENT_RECEIPT" })).toBe("INV/PRC/2026-27/000001");
  });
  it.each(["expired", "revoked", "wrong recipient"])("denies %s document sharing", (scenario) => {
    const base = { now: new Date("2026-08-08"), expiresAt: new Date("2026-08-09"), recipientType: "PARTNER", recipientId: "p1", actorType: "PARTNER", actorId: "p1" };
    const value = scenario === "expired" ? { ...base, expiresAt: new Date("2026-08-07") } : scenario === "revoked" ? { ...base, revokedAt: new Date() } : { ...base, actorId: "p2" };
    expect(() => assertShareAccess(value)).toThrow();
  });
});
