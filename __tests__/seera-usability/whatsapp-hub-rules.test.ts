import { describe, expect, it } from "vitest";
import { buildTemplatePayload, configProblems } from "@/lib/seera-whatsapp/meta";
import {
  decide,
  inboundKeyword,
  isQuietTime,
  nextRunAfter,
  nextSendableTime,
  parseTemplateComponents,
  renderPreview,
  variableValue,
  withinServiceWindow,
  type Recipient,
} from "@/lib/seera-whatsapp/rules";

const r: Recipient = { partyType: "RETAILER", partyId: "r1", phone: "919812345678", businessName: "Sharma Store", ownerName: null, city: null, distributorName: "Gupta Traders", code: "RT-1" };
const ist = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 13, h, m) - 330 * 60000);

describe("WhatsApp Hub rules", () => {
  it("parses positional and named template variables", () => {
    const p = parseTemplateComponents([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{2}} and {{1}}, {{1}} again" }, { type: "BUTTONS" }]);
    expect(p).toMatchObject({ headerFormat: "IMAGE", variableNames: ["1", "2"], named: false, hasButtons: true });
    const n = parseTemplateComponents([{ type: "BODY", text: "Namaste {{shop_name}} from {{ city }}" }]);
    expect(n.variableNames).toEqual(["shop_name", "city"]);
    expect(n.named).toBe(true);
    expect(parseTemplateComponents(null).bodyText).toBeNull();
  });

  it("never sends an empty variable", () => {
    expect(variableValue("CONTACT_NAME", r)).toBe("Sharma Store");
    expect(variableValue("CITY", r)).toBe("your area");
    expect(variableValue("CUSTOM", r, "  ")).toBe("-");
    expect(variableValue("CUSTOM", r, "10%\noff")).toBe("10% off");
    expect(renderPreview("Hi {{1}} {{2}}", { "1": "A" })).toBe("Hi A {{2}}");
  });

  it("respects IST quiet hours across midnight", () => {
    const q = { quietHoursEnabled: true, quietStartMinute: 21 * 60, quietEndMinute: 9 * 60 };
    expect(isQuietTime(ist(22), q)).toBe(true);
    expect(isQuietTime(ist(3), q)).toBe(true);
    expect(isQuietTime(ist(9), q)).toBe(false);
    expect(isQuietTime(ist(14), q)).toBe(false);
    expect(isQuietTime(ist(22), { ...q, quietHoursEnabled: false })).toBe(false);
    expect(nextSendableTime(ist(23), q).getTime()).toBe(ist(9).getTime() + 86_400_000);
  });

  it("applies opt-out and the marketing gap, not to utility", () => {
    const now = new Date("2026-11-13T10:00:00Z");
    const yesterday = new Date(now.getTime() - 86_400_000);
    expect(decide({ category: "UTILITY", optedOut: true, lastMarketingSentAt: null, marketingGapDays: 2, now })).toEqual({ send: false, reason: "OPTED_OUT" });
    expect(decide({ category: "MARKETING", optedOut: false, lastMarketingSentAt: yesterday, marketingGapDays: 2, now })).toEqual({ send: false, reason: "FREQUENCY_CAP" });
    expect(decide({ category: "UTILITY", optedOut: false, lastMarketingSentAt: yesterday, marketingGapDays: 2, now })).toEqual({ send: true });
    expect(decide({ category: "MARKETING", optedOut: false, lastMarketingSentAt: yesterday, marketingGapDays: 0, now })).toEqual({ send: true });
  });

  it("detects STOP / START in English and Hindi", () => {
    expect(inboundKeyword("STOP")).toBe("STOP");
    expect(inboundKeyword("Stop promotions")).toBe("STOP");
    expect(inboundKeyword(" बंद करो। ")).toBe("STOP");
    expect(inboundKeyword("Band karo")).toBe("STOP");
    expect(inboundKeyword("start")).toBe("START");
    expect(inboundKeyword("please stop sending me the old price list")).toBeNull();
    expect(inboundKeyword("ok")).toBeNull();
  });

  it("24h window and repeat schedule", () => {
    const now = new Date();
    expect(withinServiceWindow(new Date(now.getTime() - 3_600_000), now)).toBe(true);
    expect(withinServiceWindow(new Date(now.getTime() - 25 * 3_600_000), now)).toBe(false);
    expect(withinServiceWindow(null, now)).toBe(false);
    expect(nextRunAfter(now, null)).toBeNull();
    expect(nextRunAfter(now, 7)!.getTime() - now.getTime()).toBe(7 * 86_400_000);
  });

  it("builds Meta template payloads", () => {
    const pos = buildTemplatePayload({ to: "919812345678", name: "offer", language: "hi", named: false, variableNames: ["1"], values: ["Sharma"], headerFormat: "IMAGE", headerMediaUrl: "https://x/y.jpg" });
    expect(pos.template.components).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: "https://x/y.jpg" } }] },
      { type: "body", parameters: [{ type: "text", text: "Sharma" }] },
    ]);
    const doc = buildTemplatePayload({ to: "91", name: "c", language: "hi", named: false, variableNames: [], values: [], headerFormat: "DOCUMENT", headerMediaUrl: "https://x.in/whatsapp/Seera_MUV_Catalogue_2026.pdf" });
    expect(doc.template.components).toEqual([{ type: "header", parameters: [{ type: "document", document: { link: "https://x.in/whatsapp/Seera_MUV_Catalogue_2026.pdf", filename: "Seera_MUV_Catalogue_2026.pdf" } }] }]);
    const named = buildTemplatePayload({ to: "91", name: "n", language: "en", named: true, variableNames: ["shop"], values: ["A"] });
    expect(named.template.components).toEqual([{ type: "body", parameters: [{ type: "text", parameter_name: "shop", text: "A" }] }]);
    expect(buildTemplatePayload({ to: "91", name: "n", language: "en", named: false, variableNames: [], values: [] }).template).not.toHaveProperty("components");
  });

  it("reports missing configuration", () => {
    expect(configProblems({} as NodeJS.ProcessEnv).length).toBe(6);
    expect(configProblems({ WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_BUSINESS_ACCOUNT_ID: "w", WHATSAPP_WEBHOOK_VERIFY_TOKEN: "v", WHATSAPP_APP_SECRET: "s", SEERA_OUTBOX_DISPATCH_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
});
