import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kycFileSignatureValid, normalizeKycDetails, KYC_REQUIRED } from "@/lib/sales-distribution/partner-kyc-service";
import { motivationLine } from "@/components/seera/product/Motivation";

const root = path.resolve(__dirname, "..", "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("partner KYC details validation", () => {
  it("accepts valid GSTIN / PAN / IFSC / account and normalises case and spaces", () => {
    const { value, errors } = normalizeKycDetails({ gstin: " 27abcde1234f1z5 ", pan: "abcde1234f", aadhaarLast4: "4321", ifsc: "sbin0001234", bankAccountNumber: "1234 5678 9012" });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F", ifsc: "SBIN0001234", bankAccountNumber: "123456789012", aadhaarLast4: "4321" });
  });
  it("rejects malformed values and a PAN that does not match the GSTIN", () => {
    expect(normalizeKycDetails({ gstin: "27ABCDE1234F1Z" }).errors.join()).toMatch(/GSTIN/);
    expect(normalizeKycDetails({ pan: "ABCD1234F" }).errors.join()).toMatch(/PAN/);
    expect(normalizeKycDetails({ ifsc: "SBIN1001234" }).errors.join()).toMatch(/IFSC/);
    expect(normalizeKycDetails({ bankAccountNumber: "12345" }).errors.join()).toMatch(/account/);
    expect(normalizeKycDetails({ gstin: "27ABCDE1234F1Z5", pan: "ZZZZZ9999Z" }).errors.join()).toMatch(/does not match/);
  });
  it("never stores a full Aadhaar number — only the last four digits are accepted", () => {
    expect(normalizeKycDetails({ aadhaarLast4: "123412341234" }).errors.join()).toMatch(/last 4/);
  });
  it("blank fields clear to null", () => {
    expect(normalizeKycDetails({ gstin: "", pan: "  " }).value).toMatchObject({ gstin: null, pan: null });
  });
  it("requires the five core onboarding documents", () => {
    expect([...KYC_REQUIRED].sort()).toEqual(["AADHAAR_CARD", "APPLICATION_FORM", "CANCELLED_CHEQUE", "GST_CERTIFICATE", "PAN_CARD"]);
  });
});

describe("partner KYC file signature check", () => {
  const pad = (b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("accepts real PDF / JPEG / PNG / WEBP headers", () => {
    expect(kycFileSignatureValid("application/pdf", pad([0x25, 0x50, 0x44, 0x46]))).toBe(true);
    expect(kycFileSignatureValid("image/jpeg", pad([0xff, 0xd8, 0xff]))).toBe(true);
    expect(kycFileSignatureValid("image/png", pad([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(kycFileSignatureValid("image/webp", pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe(true);
  });
  it("rejects HTML or anything renamed to look like a PDF / photo", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(kycFileSignatureValid("application/pdf", html)).toBe(false);
    expect(kycFileSignatureValid("image/jpeg", html)).toBe(false);
    expect(kycFileSignatureValid("text/html", html)).toBe(false);
  });
});

describe("motivation line", () => {
  const today = { visited: 0, planned: 10, orders: 0, bookedValue: 0 };
  it("nudges to start when nothing is done and there is no target", () => {
    expect(motivationLine({ language: "EN", target: null, today }).tone).toBe("start");
  });
  it("celebrates a hit target", () => {
    expect(motivationLine({ language: "EN", target: { value: 100, achieved: 120, achievementPct: 120, daysRemaining: 5, requiredDailyRunRate: 0 }, today }).tone).toBe("ahead");
  });
  it("asks for a push when behind month pace, in Hindi too", () => {
    const line = motivationLine({ language: "HI", target: { value: 100000, achieved: 5000, achievementPct: 5, daysRemaining: 10, requiredDailyRunRate: 9500 }, today });
    expect(line.tone).toBe("push");
    expect(line.text).toMatch(/₹9,500/);
  });
});

describe("guided visit contract (FieldJourney)", () => {
  const src = read("components/seera/product/FieldJourney.tsx");
  it("has no separate bottom-of-page checkout form any more", () => {
    expect(src).not.toContain('id="visit-checkout-section"');
  });
  it("closes a visit with the deterministic per-visit idempotency key", () => {
    expect(src).toContain("idempotencyKey: `checkout:${closingVisit.id}`");
  });
  it("auto-finishes after BOTH photo paths (browser input and native camera)", () => {
    expect(src.match(/finishAfterPhoto\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it("persists the chosen outcome per visit so an Android camera reload does not lose it", () => {
    expect(src).toContain("seera:field-visit:${visitId}:plan");
  });
});

describe("partner data protection contract", () => {
  it("partner customer lists and details render through ProtectedData", () => {
    expect(read("components/seera/product/OperationalWorkspace.tsx")).toMatch(/protectCustomerRows \? <ProtectedData/);
    expect(read("app/portal/[portal]/[section]/[id]/page.tsx")).toMatch(/<ProtectedData language=/);
  });
  it("ProtectedData blocks copy, cut, context menu and drag, and hides content when printing", () => {
    const tsx = read("components/seera/product/ProtectedData.tsx");
    for (const handler of ["onCopy", "onCut", "onContextMenu", "onDragStart"]) expect(tsx).toContain(handler);
    expect(read("components/seera/product/ProtectedData.module.css")).toMatch(/@media print/);
  });
  it("KYC files are served private + no-store + nosniff", () => {
    const route = read("app/api/partner-kyc/file/[id]/route.ts");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
  });
});
