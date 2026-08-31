import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const banner = readFileSync("components/seera/product/ErrorBanner.tsx", "utf8");

describe("Sales Executive bilingual error UX", () => {
  it("translates the live generic infrastructure and active-workday errors in Hindi", () => {
    expect(banner).toContain("एक अप्रत्याशित सिस्टम त्रुटि हुई।");
    expect(banner).toContain("आपका आज का फील्ड कार्य दिवस पहले से सक्रिय है।");
    expect(banner).toContain("नया दिन शुरू करने से पहले अपना वर्तमान कार्य दिवस समाप्त करें।");
  });

  it("keeps English as the canonical fallback", () => {
    expect(banner).toContain("An unexpected system error occurred.");
    expect(banner).toContain("You already have an active work day.");
    expect(banner).toContain("Action could not be completed");
  });
});
