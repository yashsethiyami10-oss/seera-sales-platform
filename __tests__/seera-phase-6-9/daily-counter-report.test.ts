import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { retailerAddressText, type DailyCounterReport } from "@/lib/sales-distribution/daily-counter-report";
import { dailyCounterReportFilename, renderDailyCounterReportPdf } from "@/lib/sales-distribution/daily-counter-report-pdf";

const base: DailyCounterReport = {
  reportNumber: "SEERA/DCR/20261115/ABC123",
  businessDate: "2026-11-14T18:30:00.000Z",
  generatedAt: "2026-11-15T12:00:00.000Z",
  executive: { name: "Vikram Singh", mobile: "9876543210", code: "ABC123" },
  distributor: { name: "Sahu Kirana", code: "D-14", town: "Koshiyhal", mobile: null },
  day: { startedAt: "2026-11-15T04:00:00.000Z", endedAt: null, workingType: "RETAILING" },
  counters: [],
  productSummary: [],
  totals: { counters: 0, ordered: 0, noOrder: 0, newCounters: 0, orders: 0, value: 0, pieces: 0, freePieces: 0 },
};

describe("Daily Counter Report PDF", () => {
  it("builds a readable shop address without repeats", () => {
    expect(retailerAddressText({ area: "Sadar Bazar", city: "Koshiyhal", district: "Koshiyhal" }, "313001")).toBe("Sadar Bazar, Koshiyhal – 313001");
    expect(retailerAddressText(null, null)).toBeNull();
  });

  it("names the file by date, distributor and executive", () => {
    expect(dailyCounterReportFilename(base)).toBe("Seera-Daily-Counter-Report-2026-11-15-Sahu-Kirana-Vikram-Singh.pdf");
  });

  it("renders an empty day and a multi-page day with Hindi shop names", async () => {
    const empty = await PDFDocument.load(await renderDailyCounterReportPdf(base));
    expect(empty.getPageCount()).toBe(1);
    const line = { skuCode: "SDP-1KG", product: "Seera Detergent Powder 1 kg", pack: "1 kg", quantityText: "24 PC", baseQuantity: 24, freeBaseQuantity: 0, rate: 62, amount: 1488 };
    const counters: DailyCounterReport["counters"] = Array.from({ length: 30 }, (_, i) => ({
      sequence: i + 1, shopName: i % 2 ? "श्री राम किराना स्टोर" : `Shop ${i + 1}`, shopCode: `R-${i}`, ownerName: null, mobile: "9800000000",
      address: "Station Road, Koshiyhal", checkedInAt: "2026-11-15T05:00:00.000Z", checkedOutAt: null, outcome: "ORDER", reason: null,
      isNewCounter: false, source: "VISIT", orders: [{ orderNumber: `SO-${i}`, status: "SUBMITTED", total: 1488, distributorName: null, notes: null, lines: [line] }],
    }));
    const full = await PDFDocument.load(await renderDailyCounterReportPdf({ ...base, counters, productSummary: [{ skuCode: "SDP-1KG", product: line.product, baseQuantity: 720, freeBaseQuantity: 0, amount: 44640, counters: 30 }], totals: { ...base.totals, counters: 30, ordered: 30, orders: 30, value: 44640, pieces: 720 } }));
    expect(full.getPageCount()).toBeGreaterThan(2);
  });
});
