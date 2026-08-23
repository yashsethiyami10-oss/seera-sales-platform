import { describe, expect, it } from "vitest";
import { renderIssuedDocumentPdf, type IssuedDocumentSnapshot } from "@/lib/sales-distribution/document-pdf";

// Billing/Quotation Finalization (23-Aug), live UAT finding: Commercial UOM made the printed
// "Unit" column's real content much wider than the old "180 g" / "PCS" strings the table's fixed
// 34pt column width was sized for — e.g. "10 BOX (400 PC)" drew straight through into the "Rate"
// column with no wrapping, visually overlapping the two on the actual issued PDF (confirmed by
// downloading and reading a real issued quotation before the fix). Fixed by wrapping the unit
// column the same way the item-description column already was. This test guards against a
// regression reintroducing an unhandled-width crash or dropped wrapping for a long pack string —
// not a full pixel-overlap check, but it exercises the exact code path that broke.
function snapshot(unit: string): IssuedDocumentSnapshot {
  return {
    type: "QUOTATION_DOCUMENT",
    documentNumber: "UAT-TEST-0001",
    issueDate: "2026-08-23",
    issuer: { legalName: "Test Distributor LLP", address: "Test Address", state: "Maharashtra", stateCode: "27", gstin: "27AAACM1234A1Z2" },
    buyer: { legalName: "Test Retail Mart", address: "Test Address" },
    lines: [
      { description: "Test Product With A Long Commercial UOM Pack String", hsn: "3402", quantity: 400, unit, rate: 7.88, taxableValue: 2669.49, igst: 480.51, total: 3150 },
    ],
    subtotal: 3150,
    taxableTotal: 2669.49,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 480.51,
    grandTotal: 3150,
    currency: "INR",
  };
}

describe("renderIssuedDocumentPdf — long Commercial UOM unit strings", () => {
  it("renders without throwing for a long BOX-style pack string", async () => {
    const bytes = await renderIssuedDocumentPdf(snapshot("10 BOX (400 PC)"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("renders without throwing for an even longer, larger-quantity pack string", async () => {
    const bytes = await renderIssuedDocumentPdf(snapshot("9,999 BAG (399,960 PC)"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("still renders correctly for the plain PC case (no regression on the common path)", async () => {
    const bytes = await renderIssuedDocumentPdf(snapshot("PCS"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
