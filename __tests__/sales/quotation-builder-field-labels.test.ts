import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * FR-004 — static source-structure regression guard.
 *
 * Honest limitation, stated up front: this repo's vitest setup runs in a
 * plain Node environment (no jsdom, no @testing-library/react — see
 * vitest.config.ts's own comment on this), so a real rendered-DOM
 * assertion ("the label text actually appears on screen") is not
 * achievable without adding a new test dependency, which is out of this
 * change's approved scope. This file instead asserts the *source
 * structure* that produces those labels — real regression coverage
 * against "someone deleted a <Field> wrapper" or "someone re-added
 * `required` to the now-optional Variant field" — but it is not a
 * substitute for an actual browser/DOM check of the rendered form.
 */

const source = fs.readFileSync(
  path.resolve(process.cwd(), "components/sales/quotation-builder.tsx"),
  "utf8",
);

describe("quotation-builder.tsx — field label structure (static, not DOM-rendered)", () => {
  it("wraps exactly 9 fields in the labeled <Field> component", () => {
    const matches = source.match(/<Field\s/g) ?? [];
    expect(matches.length).toBe(9);
  });

  const expectedFields: { name: string; required: boolean }[] = [
    { name: "opportunityId", required: true },
    { name: "policy", required: true },
    { name: "productId", required: true },
    { name: "variantId", required: false },
    { name: "quantity", required: true },
    { name: "unitPrice", required: false },
    { name: "discount", required: false },
    { name: "validUntil", required: true },
    { name: "terms", required: false },
  ];

  for (const { name, required } of expectedFields) {
    it(`"${name}" has a matching htmlFor/id pair and is marked ${required ? "required" : "optional"}`, () => {
      expect(source).toMatch(new RegExp(`htmlFor="${name}"`));
      expect(source).toMatch(new RegExp(`id="${name}"`));
      const fieldBlockMatch = source.match(new RegExp(`<Field[^>]*htmlFor="${name}"[^>]*>`));
      expect(fieldBlockMatch, `<Field> opening tag for ${name} not found`).toBeTruthy();
      const block = fieldBlockMatch![0];
      if (required) {
        expect(block).toMatch(/required(?!=\{false\})/);
      } else {
        expect(block).toMatch(/required=\{false\}/);
      }
    });
  }

  it("does not mark the native HTML Variant select as required (matches optional Zod schema)", () => {
    const variantSelectMatch = source.match(/<select id="variantId"[^>]*>/);
    expect(variantSelectMatch).toBeTruthy();
    expect(variantSelectMatch![0]).not.toMatch(/\brequired\b/);
  });

  it("marks the native HTML Quantity input as required (matches required Zod schema)", () => {
    const quantityInputMatch = source.match(/<input id="quantity"[^>]*>/);
    expect(quantityInputMatch).toBeTruthy();
    expect(quantityInputMatch![0]).toMatch(/\brequired\b/);
  });

  it("shows the ₹ unit on Unit Price and explains the catalogue-price fallback", () => {
    expect(source).toMatch(/Unit Price \(₹\)/);
    expect(source).toMatch(/catalogue price/i);
  });

  it("shows the % unit on Discount and explains it is percentage-based", () => {
    expect(source).toMatch(/Discount \(%\)/);
    expect(source).toMatch(/Percentage discount/i);
  });

  it("Variant disables until a Product is selected and resets on Product change", () => {
    expect(source).toMatch(/disabled=\{!productId\}/);
    expect(source).toMatch(/setVariantId\(""\)/);
  });

  it("Variant options are limited to the selected Product's variants, not every product's", () => {
    expect(source).not.toMatch(/products\.flatMap/);
    expect(source).toMatch(/availableVariants\.map/);
  });

  it("renders the exact required empty-opportunity message and both conditional actions", () => {
    expect(source).toMatch(/No eligible opportunities found\. Create or qualify an opportunity before creating a quotation\./);
    expect(source).toMatch(/href="\/sales\/opportunities\/new"/);
    expect(source).toMatch(/href="\/sales\/opportunities"/);
    expect(source).toMatch(/canCreateOpportunity &&/);
  });

  it("never fabricates a fallback opportunity option and keeps opportunityId a required select", () => {
    expect(source).not.toMatch(/dummy|placeholder-opportunity|fake.*opportunity/i);
    expect(source).toMatch(/<select id="opportunityId"[^>]*required/);
  });
});
