import { describe, it, expect } from "vitest";
import { normalizeIndianMobile, isCanonicalIndianMobile } from "../../lib/messaging/phone";
import { sanitizeTemplateParam, WHATSAPP_TEMPLATES, templateFor, isTemplateSendable } from "../../lib/messaging/whatsapp-templates";
import { classifyWhatsAppError } from "../../lib/messaging/error-classification";

describe("normalizeIndianMobile", () => {
  it("normalizes a plain 10-digit mobile to canonical 91-prefixed form", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("919876543210");
  });
  it("strips dashes/spaces before normalizing", () => {
    expect(normalizeIndianMobile("98765-43210")).toBe("919876543210");
    expect(normalizeIndianMobile("98765 43210")).toBe("919876543210");
  });
  it("never double-prefixes an already-canonical 91XXXXXXXXXX number", () => {
    expect(normalizeIndianMobile("919876543210")).toBe("919876543210");
  });
  it("strips a leading + without adding a second country code", () => {
    expect(normalizeIndianMobile("+919876543210")).toBe("919876543210");
  });
  it("handles a leading trunk 0", () => {
    expect(normalizeIndianMobile("09876543210")).toBe("919876543210");
  });
  it("returns null for null/undefined/empty input", () => {
    expect(normalizeIndianMobile(null)).toBeNull();
    expect(normalizeIndianMobile(undefined)).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
  });
  it("returns null for a number that isn't a valid Indian mobile (wrong length or leading digit)", () => {
    expect(normalizeIndianMobile("12345")).toBeNull();
    expect(normalizeIndianMobile("1234567890")).toBeNull(); // must start 6-9
    expect(normalizeIndianMobile("98765432101234")).toBeNull(); // too long / garbage
  });
});

describe("isCanonicalIndianMobile", () => {
  it("accepts only the exact 91XXXXXXXXXX shape", () => {
    expect(isCanonicalIndianMobile("919876543210")).toBe(true);
    expect(isCanonicalIndianMobile("+919876543210")).toBe(false);
    expect(isCanonicalIndianMobile("9876543210")).toBe(false);
  });
});

describe("sanitizeTemplateParam", () => {
  it("never lets the literal string 'undefined' or 'null' through", () => {
    expect(sanitizeTemplateParam(undefined)).toBe("-");
    expect(sanitizeTemplateParam(null)).toBe("-");
    expect(sanitizeTemplateParam("undefined")).toBe("-");
    expect(sanitizeTemplateParam("null")).toBe("-");
  });
  it("never lets a blank/whitespace-only value through", () => {
    expect(sanitizeTemplateParam("   ")).toBe("-");
    expect(sanitizeTemplateParam("")).toBe("-");
  });
  it("respects a caller-supplied fallback", () => {
    expect(sanitizeTemplateParam(undefined, "Retailer")).toBe("Retailer");
  });
  it("collapses newlines/tabs/multi-space runs Meta template params reject", () => {
    expect(sanitizeTemplateParam("Line1\nLine2\tTabbed   Spaced")).toBe("Line1 Line2 Tabbed Spaced");
  });
  it("passes through a normal value unchanged", () => {
    expect(sanitizeTemplateParam("Sharma General Store")).toBe("Sharma General Store");
    expect(sanitizeTemplateParam(1234)).toBe("1234");
  });
});

describe("WHATSAPP_TEMPLATES governed registry", () => {
  it("defines a template for every business event this audit requires", () => {
    const requiredKeys = [
      "RETAILER_ORDER_PLACED",
      "RETAILER_NO_ORDER",
      "RETAILER_FOLLOW_UP",
      "RETAILER_ORDER_DELIVERED",
      "DISTRIBUTOR_VISIT_COMPLETED",
      "SUPER_STOCKIST_VISIT_COMPLETED",
    ] as const;
    for (const key of requiredKeys) {
      const def = templateFor(key);
      expect(def.metaTemplateName).toMatch(/^[a-z0-9_]+$/); // Meta template naming rules
      expect(def.paramLabels.length).toBeGreaterThan(0);
    }
  });
  it("never uses the same Meta template name for two different governed events", () => {
    const names = Object.values(WHATSAPP_TEMPLATES).map((t) => t.metaTemplateName);
    expect(new Set(names).size).toBe(names.length);
  });
});

// Live Meta reconciliation (Founder-provided, read directly off the Seera WABA via
// /api/founder/whatsapp-diagnostics — not guessed) — the six templates the Founder has
// actually created and Meta reports APPROVED, each with 5 body parameters in a specific
// business order, all in Hindi.
describe("WHATSAPP_TEMPLATES live Meta reconciliation", () => {
  const liveTemplateKeys = [
    "RETAILER_ORDER_PLACED",
    "RETAILER_NO_ORDER",
    "RETAILER_FOLLOW_UP",
    "DISTRIBUTOR_VISIT_COMPLETED",
    "SUPER_STOCKIST_VISIT_COMPLETED",
    "RETAILER_ORDER_DELIVERED",
  ] as const;

  it("marks exactly the six live templates APPROVED with Meta's own hi/MARKETING and 5 ordered params", () => {
    for (const key of liveTemplateKeys) {
      const def = templateFor(key);
      expect(def.approvalStatus).toBe("APPROVED");
      expect(def.languageCode).toBe("hi");
      expect(def.category).toBe("MARKETING");
      expect(def.paramLabels).toHaveLength(5);
      expect(isTemplateSendable(def)).toBe(true);
    }
  });

  it("the delivery template points at the recreated seera_retailer_order_delivered_hi, not the deleted old name", () => {
    const delivered = templateFor("RETAILER_ORDER_DELIVERED");
    expect(delivered.metaTemplateName).toBe("seera_retailer_order_delivered_hi");
    expect(delivered.paramLabels).toEqual(["Retailer/contact name", "Outlet/shop name", "Order number", "Distributor firm name", "Delivery date"]);
  });

  it("keeps the three not-yet-created order-status templates unsendable (PENDING_META_APPROVAL, no language)", () => {
    for (const key of ["RETAILER_ORDER_ACCEPTED", "RETAILER_ORDER_PARTIAL", "RETAILER_OUT_FOR_DELIVERY"] as const) {
      const def = templateFor(key);
      expect(def.approvalStatus).toBe("PENDING_META_APPROVAL");
      expect(def.languageCode).toBeNull();
      expect(isTemplateSendable(def)).toBe(false);
    }
  });
});

describe("isTemplateSendable", () => {
  it("requires both APPROVED status and a real language code", () => {
    expect(isTemplateSendable({ key: "RETAILER_NO_ORDER", metaTemplateName: "x", languageCode: "hi", category: "MARKETING", paramLabels: ["a"], approvalStatus: "APPROVED" })).toBe(true);
    expect(isTemplateSendable({ key: "RETAILER_NO_ORDER", metaTemplateName: "x", languageCode: null, category: "MARKETING", paramLabels: ["a"], approvalStatus: "APPROVED" })).toBe(false);
    expect(isTemplateSendable({ key: "RETAILER_NO_ORDER", metaTemplateName: "x", languageCode: "hi", category: "MARKETING", paramLabels: ["a"], approvalStatus: "PENDING_META_APPROVAL" })).toBe(false);
    expect(isTemplateSendable({ key: "RETAILER_NO_ORDER", metaTemplateName: "x", languageCode: "hi", category: "MARKETING", paramLabels: ["a"], approvalStatus: "REJECTED" })).toBe(false);
  });
});

describe("classifyWhatsAppError", () => {
  it("classifies auth/permission/template/recipient failures as PERMANENT", () => {
    expect(classifyWhatsAppError({ status: 401 })).toBe("PERMANENT");
    expect(classifyWhatsAppError({ status: 403 })).toBe("PERMANENT");
    expect(classifyWhatsAppError({ status: 400, metaCode: 132001 })).toBe("PERMANENT"); // template does not exist
    expect(classifyWhatsAppError({ status: 400, metaCode: 131026 })).toBe("PERMANENT"); // undeliverable recipient
  });
  it("classifies rate limits and server errors as TRANSIENT", () => {
    expect(classifyWhatsAppError({ status: 429 })).toBe("TRANSIENT");
    expect(classifyWhatsAppError({ status: 500 })).toBe("TRANSIENT");
    expect(classifyWhatsAppError({ status: 503 })).toBe("TRANSIENT");
  });
  it("defaults to TRANSIENT for an unrecognized error shape (never assume permanent without a clear signal)", () => {
    expect(classifyWhatsAppError(new Error("network blip"))).toBe("TRANSIENT");
    expect(classifyWhatsAppError(undefined)).toBe("TRANSIENT");
  });
});
