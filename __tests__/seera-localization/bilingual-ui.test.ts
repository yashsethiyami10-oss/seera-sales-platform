import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localizedPortal, localizedStatus, normalizeLanguage, translate, UI_MESSAGES } from "@/lib/sales-distribution/localization";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Seera Phase 2-5 English and Hindi UI", () => {
  it("has exact EN/HI key parity", () => expect(Object.keys(UI_MESSAGES.HI).sort()).toEqual(Object.keys(UI_MESSAGES.EN).sort()));
  it("normalizes English preference", () => expect(normalizeLanguage("EN")).toBe("EN"));
  it("normalizes Hindi preference", () => expect(normalizeLanguage("HI")).toBe("HI"));
  it("falls back safely to English", () => expect(normalizeLanguage("UNKNOWN")).toBe("EN"));
  it("localizes Sales Executive portal", () => expect(localizedPortal("HI", "sales-executive").title).toContain("बिक्री कार्यकारी"));
  it("localizes Sales Manager portal", () => expect(localizedPortal("HI", "sales-manager").navigation).toContain("संयुक्त कार्य"));
  it("localizes Distributor portal", () => expect(localizedPortal("HI", "distributor").title).toContain("वितरक"));
  it("localizes Super Stockist portal", () => expect(localizedPortal("HI", "super-stockist").title).toContain("सुपर स्टॉकिस्ट"));
  it("contains Devanagari operational text", () => expect(Object.values(UI_MESSAGES.HI).join(" ")).toMatch(/[\u0900-\u097F]/));
  it("covers credit and grace terminology", () => expect([translate("HI", "creditLimit"), translate("HI", "creditDays"), translate("HI", "gracePeriod"), translate("HI", "promisedPaymentDate"), translate("HI", "originalDueDate")].join(" ")).toMatch(/क्रेडिट.*अनुग्रह.*भुगतान.*देय/));
  it("covers stock and reconciliation terminology", () => expect([translate("HI", "stock"), translate("HI", "stockAdjustment"), translate("HI", "stockReconciliation"), translate("HI", "physicalStock"), translate("HI", "systemStock"), translate("HI", "variance")]).not.toContain(undefined));
  it("covers order, delivery, buttons, validation, errors, and empty states", () => expect(["orderStatus", "deliveryStatus", "save", "cancel", "submit", "accept", "reject", "hold", "required", "invalidValue", "genericError", "emptyState"].every((key) => Boolean(UI_MESSAGES.HI[key as keyof typeof UI_MESSAGES.HI]))).toBe(true));
  it("keeps unknown canonical machine codes unchanged", () => expect(localizedStatus("HI", "CREDIT_OVERRIDE_REQUIRED")).toBe("CREDIT_OVERRIDE_REQUIRED"));
  it("persists preference on the User model", () => { const schema = read("prisma/schema.prisma"); expect(schema).toContain("preferredLanguage"); expect(schema).toContain("@default(EN)"); });
  it("supports EN to HI and HI to EN controls", () => { const selector = read("components/seera/LanguageSelector.tsx"); expect(selector).toContain('change("EN")'); expect(selector).toContain('change("HI")'); expect(selector).toContain("router.refresh()"); });
  it("persists switches through the authenticated language endpoint", () => { const route = read("app/api/foundation/language/route.ts"); expect(route).toContain("resolveRequestIdentity"); expect(route).toContain("preferredLanguage: language"); expect(route).toContain("user.language.updated"); });
  it("uses identical RBAC before selecting language presentation", () => { const portal = read("app/portal/[portal]/page.tsx"); expect(portal.indexOf("await authorize")).toBeLessThan(portal.indexOf("localizedPortal(language")); });
  it("does not translate partner or user-entered identity data", () => { const portal = read("app/portal/[portal]/page.tsx"); expect(portal).toContain("user.name ?? user.email"); expect(portal).not.toMatch(/translate\([^)]*user\.(name|email)/); });
  it("declares Hindi document language and Devanagari-capable fonts", () => { const portal = read("app/portal/[portal]/page.tsx"); expect(portal).toContain('language === "HI" ? "hi" : "en"'); expect(portal).toContain("Noto Sans Devanagari"); expect(portal).toContain("Mangal"); });
  it("does not duplicate canonical order, stock, credit, or delivery enums by language", () => { const schema = read("prisma/schema.prisma"); expect(schema).not.toMatch(/(_EN|_HI)\s*$/m); expect(schema.match(/enum SalesOrderStatus/g)).toHaveLength(1); });
});
