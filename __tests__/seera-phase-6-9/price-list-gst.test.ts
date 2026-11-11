import { describe, expect, it } from "vitest";
import { inclusiveOfGst } from "@/lib/sales-distribution/company-library-service";

describe("live price list shows GST-inclusive rates", () => {
  it("adds GST to basic (non-MUV) rates", () => {
    expect(inclusiveOfGst(150, 18, "GST_EXCLUSIVE")).toBe(177);
    expect(inclusiveOfGst(159, 18, "GST_EXCLUSIVE")).toBe(187.62);
  });
  it("keeps MUV rates as they are (already GST-inclusive)", () => {
    expect(inclusiveOfGst(85, 18, "GST_INCLUSIVE")).toBe(85);
  });
  it("never guesses GST when the SKU has no GST rate", () => {
    expect(inclusiveOfGst(150, null, "GST_EXCLUSIVE")).toBeNull();
    expect(inclusiveOfGst(null, 18, "GST_EXCLUSIVE")).toBeNull();
  });
});
