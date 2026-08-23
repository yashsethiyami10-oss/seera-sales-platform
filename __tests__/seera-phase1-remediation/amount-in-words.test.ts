import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/sales-distribution/document-pdf";

// Billing/Quotation Finalization (23-Aug): "Amount in words" is a real printed-invoice legal
// convention (Indian Lakh/Crore grouping, not Western thousand/million) — covers the grouping
// boundaries and the paise/whole-rupee split, since a wrong word amount on an issued Tax Invoice
// is exactly the kind of silent defect that only shows up when someone reads the PDF by eye.
describe("amountInWords — Indian Lakh/Crore numbering for the printed document", () => {
  it("renders zero", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });

  it("renders a whole-rupee amount with no paise", () => {
    expect(amountInWords(1180)).toBe("Rupees One Thousand One Hundred Eighty Only");
  });

  it("renders paise distinctly from whole rupees", () => {
    expect(amountInWords(31580.5)).toBe("Rupees Thirty One Thousand Five Hundred Eighty and Fifty Paise Only");
  });

  it("crosses the Lakh boundary correctly (Indian grouping, not Western)", () => {
    expect(amountInWords(100000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(126762)).toBe("Rupees One Lakh Twenty Six Thousand Seven Hundred Sixty Two Only");
  });

  it("crosses the Crore boundary correctly", () => {
    expect(amountInWords(10000000)).toBe("Rupees One Crore Only");
    expect(amountInWords(15012345)).toBe("Rupees One Crore Fifty Lakh Twelve Thousand Three Hundred Forty Five Only");
  });

  it("handles teens and tens without an off-by-one in the ONES/TENS tables", () => {
    expect(amountInWords(19)).toBe("Rupees Nineteen Only");
    expect(amountInWords(20)).toBe("Rupees Twenty Only");
    expect(amountInWords(21)).toBe("Rupees Twenty One Only");
  });
});
