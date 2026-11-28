/**
 * Hanuman sends WhatsApp documents from SEERA's own number (Founder, 2026-11-28: "document ke taur
 * pe bhejo, link nahi; Seera ka kaam Seera ke number se"). Reached only through the signed
 * /api/hanuman relay. Uses this deployment's WHATSAPP_* settings (lib/seera-whatsapp/meta.ts); the
 * token never leaves this server.
 *  - wa_send_document: a document by public https link (Meta fetches it, so large PDFs work). Only
 *    inside the 24-hour window after the person last wrote to Seera's number.
 *  - wa_send_template: an approved template, optionally with a DOCUMENT header (the PDF), for people
 *    outside that window.
 *  - wa_template_submit / wa_template_status: submit a template with a PDF header to Seera's WABA
 *    (the sample PDF is uploaded with Meta's resumable upload API) and read its status.
 */
import { sendMedia, sendTemplate, waConfig } from "@/lib/seera-whatsapp/meta";

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v19.0"}`;

export class RelayInputError extends Error {}

export function cleanPhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
  if (d.length < 11 || d.length > 15) throw new RelayInputError("bad phone");
  return d;
}

export function httpsLink(u: unknown): string {
  const s = String(u ?? "").trim();
  let url: URL;
  try { url = new URL(s); } catch { throw new RelayInputError("bad link"); }
  if (url.protocol !== "https:") throw new RelayInputError("link must be https");
  return url.toString();
}

const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;

export async function sendDocument(input: { phone: unknown; link: unknown; caption?: unknown }) {
  const id = await sendMedia(cleanPhone(input.phone), "document", httpsLink(input.link), String(input.caption ?? "").slice(0, 1024));
  return { sent: true, messageId: id };
}

export async function sendTemplateMessage(input: { phone: unknown; name: unknown; language?: unknown; values?: unknown; documentLink?: unknown }) {
  const name = String(input.name ?? "");
  if (!TEMPLATE_NAME.test(name)) throw new RelayInputError("bad template name");
  const values = Array.isArray(input.values) ? input.values.slice(0, 10).map((v) => String(v).replace(/\s*\n+\s*/g, " • ").slice(0, 900)) : [];
  const id = await sendTemplate({
    to: cleanPhone(input.phone), name, language: String(input.language ?? "hi"), named: false, variableNames: [], values,
    headerFormat: input.documentLink ? "DOCUMENT" : null, headerMediaUrl: input.documentLink ? httpsLink(input.documentLink) : null,
  });
  return { sent: true, messageId: id };
}

async function graphJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { ok: res.ok, status: res.status, body };
}

/** Uploads a sample file with Meta's resumable upload API and returns the header handle. */
async function uploadSample(link: string, token: string): Promise<string> {
  const file = await fetch(link, { signal: AbortSignal.timeout(30_000) });
  if (!file.ok) throw new RelayInputError(`sample not reachable (${file.status})`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const app = process.env.META_APP_ID?.trim() || (await graphJson(`${GRAPH()}/app?access_token=${encodeURIComponent(token)}`)).body.id;
  if (!app) throw new RelayInputError("could not read the Meta app id (set META_APP_ID)");
  const name = decodeURIComponent(link.split("?")[0]!.split("/").pop() || "sample.pdf");
  const start = await graphJson(`${GRAPH()}/${app}/uploads?file_name=${encodeURIComponent(name)}&file_length=${bytes.length}&file_type=application/pdf&access_token=${encodeURIComponent(token)}`, { method: "POST" });
  if (!start.body.id) throw new RelayInputError(`upload session failed: ${start.body.error?.message ?? start.status}`);
  const up = await graphJson(`${GRAPH()}/${start.body.id}`, { method: "POST", headers: { authorization: `OAuth ${token}`, file_offset: "0" }, body: bytes });
  if (!up.body.h) throw new RelayInputError(`upload failed: ${up.body.error?.message ?? up.status}`);
  return up.body.h as string;
}

export async function submitDocumentTemplate(input: { name: unknown; language?: unknown; category?: unknown; body: unknown; example?: unknown; sampleLink: unknown; buttons?: unknown }) {
  const { wabaId, accessToken } = waConfig();
  if (!wabaId || !accessToken) throw new RelayInputError("Seera's WhatsApp account (WABA id / token) is not configured");
  const name = String(input.name ?? "");
  if (!TEMPLATE_NAME.test(name)) throw new RelayInputError("bad template name");
  const body = String(input.body ?? "");
  if (!body.trim() || body.length > 1024) throw new RelayInputError("body required (max 1024)");
  const category = String(input.category ?? "MARKETING").toUpperCase();
  if (!["MARKETING", "UTILITY"].includes(category)) throw new RelayInputError("category must be MARKETING or UTILITY");
  const example = Array.isArray(input.example) ? input.example.map(String) : [];
  const buttons = Array.isArray(input.buttons) ? input.buttons.map((b) => String(b).slice(0, 25)).slice(0, 3) : [];
  const handle = await uploadSample(httpsLink(input.sampleLink), accessToken);
  const components: Record<string, unknown>[] = [
    { type: "HEADER", format: "DOCUMENT", example: { header_handle: [handle] } },
    { type: "BODY", text: body, ...(example.length ? { example: { body_text: [example] } } : {}) },
    ...(buttons.length ? [{ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) }] : []),
  ];
  const r = await graphJson(`${GRAPH()}/${wabaId}/message_templates`, {
    method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name, language: String(input.language ?? "hi"), category, components }),
  });
  return r.ok ? { submitted: true, id: r.body.id, status: r.body.status ?? "PENDING" } : { submitted: false, error: r.body.error?.error_user_msg ?? r.body.error?.message ?? String(r.status) };
}

export async function templateStatus(name: unknown) {
  const { wabaId, accessToken } = waConfig();
  if (!wabaId || !accessToken) throw new RelayInputError("Seera's WhatsApp account is not configured");
  const n = String(name ?? "");
  if (!TEMPLATE_NAME.test(n)) throw new RelayInputError("bad template name");
  const r = await graphJson(`${GRAPH()}/${wabaId}/message_templates?name=${encodeURIComponent(n)}&fields=name,status,language,category,rejected_reason`, { headers: { authorization: `Bearer ${accessToken}` } });
  return { templates: (r.body.data ?? []) as unknown[] };
}
