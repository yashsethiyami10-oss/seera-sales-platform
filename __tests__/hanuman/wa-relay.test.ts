import { afterEach, describe, expect, it, vi } from "vitest";

/** Hanuman sends documents and templates from Seera's own number (2026-11-28). */
describe("Seera WhatsApp relay for Hanuman", async () => {
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "555");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "seera-token");
  vi.stubEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", "777");
  vi.stubEnv("META_APP_ID", "999");
  const { sendDocument, sendTemplateMessage, submitDocumentTemplate, cleanPhone } = await import("@/lib/hanuman/wa-relay");
  const calls: { url: string; body: any }[] = [];
  const stub = () => vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const body = init?.body instanceof Uint8Array ? "<bytes>" : init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url.endsWith(".pdf")) return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
    if (url.includes("/999/uploads")) return Response.json({ id: "upload:1" });
    if (url.includes("upload:1")) return Response.json({ h: "HANDLE" });
    if (url.includes("/message_templates")) return Response.json({ id: "t1", status: "PENDING" });
    return Response.json({ messages: [{ id: "wamid.1" }] });
  }));
  afterEach(() => { calls.length = 0; vi.unstubAllGlobals(); });

  it("sends a PDF as a document by link from Seera's number, with its file name", async () => {
    stub();
    expect(await sendDocument({ phone: "9829546263", link: "https://www.seeradetergent.in/whatsapp/seera_muv_catalogue_2026.pdf", caption: "Catalogue" })).toEqual({ sent: true, messageId: "wamid.1" });
    const c = calls[0]!;
    expect(c.url).toContain("/555/messages");
    expect(c.body).toMatchObject({ to: "919829546263", type: "document", document: { filename: "seera_muv_catalogue_2026.pdf", caption: "Catalogue" } });
  });

  it("sends an approved template with the PDF as its header for people outside the 24-hour window", async () => {
    stub();
    await sendTemplateMessage({ phone: "919829546263", name: "seera_distributor_intro", values: ["Bhandari ji", "Bhilwara"], documentLink: "https://www.seeradetergent.in/whatsapp/seera_muv_catalogue_2026.pdf" });
    const t = calls[0]!.body.template;
    expect(t.name).toBe("seera_distributor_intro");
    expect(t.components[0]).toMatchObject({ type: "header", parameters: [{ type: "document" }] });
    expect(t.components[1].parameters.map((p: any) => p.text)).toEqual(["Bhandari ji", "Bhilwara"]);
  });

  it("submits a template with a PDF header (sample uploaded first) to Seera's WABA", async () => {
    stub();
    const r = await submitDocumentTemplate({ name: "seera_distributor_intro", body: "Namaste {{1}} ji", example: ["Ramesh"], sampleLink: "https://www.seeradetergent.in/x.pdf", buttons: ["Haan, details bhejiye", "STOP"] });
    expect(r).toMatchObject({ submitted: true });
    const tpl = calls.find((c) => c.url.includes("/777/message_templates"))!.body;
    expect(tpl.components[0]).toEqual({ type: "HEADER", format: "DOCUMENT", example: { header_handle: ["HANDLE"] } });
    expect(tpl.components[2].buttons).toHaveLength(2);
  });

  it("refuses bad input before calling Meta", async () => {
    stub();
    expect(() => cleanPhone("123")).toThrow();
    await expect(sendDocument({ phone: "9829546263", link: "http://insecure.example/x.pdf" })).rejects.toThrow(/https/);
    await expect(sendTemplateMessage({ phone: "9829546263", name: "Bad Name!" })).rejects.toThrow(/template/);
    expect(calls).toHaveLength(0);
  });
});
