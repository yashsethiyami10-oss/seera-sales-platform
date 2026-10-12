import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppBusinessProvider } from "@/lib/messaging/providers/whatsapp-business";

// Request shape sent to Meta, with fetch mocked: nothing leaves the machine and no credentials are real.
describe("WhatsApp Cloud API request body", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "unit-test-phone-id");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "unit-test-token");
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const sentTemplate = () => JSON.parse(fetchMock.mock.calls[0][1].body).template;

  it("a zero-variable template is sent with no body component", async () => {
    const result = await new WhatsAppBusinessProvider().sendWhatsApp("919876543210", "seera_example_no_variables", [], "hi");
    expect(result.id).toBe("wamid.TEST");
    expect(sentTemplate()).toEqual({ name: "seera_example_no_variables", language: { code: "hi" } });
  });

  it("templates with variables are unchanged: one body component with ordered text parameters", async () => {
    await new WhatsAppBusinessProvider().sendWhatsApp("919876543210", "seera_retailer_order_placed", ["A", "B"], "hi");
    expect(sentTemplate()).toEqual({ name: "seera_retailer_order_placed", language: { code: "hi" }, components: [{ type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }] });
  });
});

describe("survey thank-you request matches the live template contract", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "unit-test-phone-id");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "unit-test-token");
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.TEST" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends template seera_retailer_survey_thankyou, language hi, one body text parameter, no header/buttons", async () => {
    await new WhatsAppBusinessProvider().sendWhatsApp("919876543210", "seera_retailer_survey_thankyou", ["Ramesh"], "hi");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template" });
    expect(body.template).toEqual({ name: "seera_retailer_survey_thankyou", language: { code: "hi" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ramesh" }] }] });
  });

  it("a Meta error is surfaced as a failure, never a success id", async () => {
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ error: { code: 132000, message: "Number of parameters does not match" } }), { status: 400 }));
    await expect(new WhatsAppBusinessProvider().sendWhatsApp("919876543210", "seera_retailer_survey_thankyou", [], "hi")).rejects.toThrow();
  });
});
