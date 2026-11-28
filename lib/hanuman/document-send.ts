/**
 * Hanuman "send_document" (Founder, 2026-11-28: "ye PDF / catalogue in Seera leads ko bhejo").
 * Sends a PDF/JPG/PNG to one person from SEERA's own WhatsApp number (never MUV's), the same way
 * document-service.ts sends a bill: upload the bytes to Meta's media endpoint, then a document (or
 * image) message referencing that media id.
 *
 * Hanuman passes either a public https URL (Drive "anyone with the link", website, CDN) or the file
 * as base64. URLs are fetched HERE, server to server, so a big catalogue never goes through
 * Hanuman's request body (the relay's 413 limit).
 *
 * Outside the 24-hour window Meta only delivers an approved template. With `template` set, the file
 * goes as that template's DOCUMENT/IMAGE header ({{1}} etc. as body params), which is the only way a
 * file reaches someone who has not written in the last 24 hours. Without it, a plain document message
 * is sent (works inside the window).
 *
 * Idempotent per requestId (audit trail), so a retried Hanuman call never sends twice.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "@/lib/prisma";
import { normalizeIndianMobile } from "@/lib/messaging/phone";
import { recordAudit } from "@/lib/foundation/audit-service";
import { founderActorId } from "@/lib/hanuman/bill-service";

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v19.0"}`;
export const DOC_MAX_BYTES = 100 * 1024 * 1024; // Meta: documents up to 100 MB
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // Meta: images up to 5 MB
const ALLOWED = new Map([["application/pdf", "pdf"], ["image/jpeg", "jpg"], ["image/png", "png"]]);

export class DocSendError extends Error { constructor(message: string, public status = 422) { super(message); } }

export type DocSendInput = {
  to: string;
  url?: string;
  base64?: string;
  filename?: string;
  mimeType?: string;
  caption?: string;
  requestId: string;
  template?: { name: string; languageCode?: string; params?: string[] };
};

/** Only public https URLs; no localhost / private ranges (the signed caller is Hanuman, but be strict). */
export function safeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new DocSendError("Bad document URL", 400); }
  if (u.protocol !== "https:") throw new DocSendError("Document URL must be https", 400);
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(\d+\.){3}\d+$/.test(h) || h.includes(":")) {
    throw new DocSendError("Document URL host not allowed", 400);
  }
  return u;
}

/** Drive share links -> direct download links. */
export function directUrl(raw: string): string {
  const m = raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([\w-]{10,})/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : raw;
}

export function sniffMime(bytes: Uint8Array, declared?: string | null): string | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const d = ((declared ?? "").split(";")[0] ?? "").trim().toLowerCase();
  return ALLOWED.has(d) ? d : null;
}

async function loadFile(input: DocSendInput, fetchImpl: typeof fetch): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  let bytes: Uint8Array;
  let declared = input.mimeType ?? null;
  let nameFromUrl: string | null = null;
  if (input.base64) {
    bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
  } else if (input.url) {
    const u = safeUrl(directUrl(input.url));
    const res = await fetchImpl(u.toString(), { redirect: "follow" });
    if (!res.ok) throw new DocSendError(`Could not download the document (${res.status}). Drive file must be shared as "Anyone with the link".`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > DOC_MAX_BYTES) throw new DocSendError("Document is larger than 100 MB");
    bytes = new Uint8Array(await res.arrayBuffer());
    declared = declared ?? res.headers.get("content-type");
    const cd = res.headers.get("content-disposition") ?? "";
    nameFromUrl = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? (decodeURIComponent(u.pathname.split("/").pop() || "") || null);
  } else {
    throw new DocSendError("Give url or base64", 400);
  }
  if (!bytes.length) throw new DocSendError("Document is empty");
  const mimeType = sniffMime(bytes, declared);
  if (!mimeType) throw new DocSendError("Only PDF, JPG or PNG can be sent (a Drive link that is not public returns a web page, not the file)");
  const max = mimeType === "application/pdf" ? DOC_MAX_BYTES : IMAGE_MAX_BYTES;
  if (bytes.length > max) throw new DocSendError(mimeType === "application/pdf" ? "PDF is larger than 100 MB" : "Image is larger than 5 MB");
  const ext = ALLOWED.get(mimeType)!;
  let filename = (input.filename || nameFromUrl || `Seera.${ext}`).replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120) || `Seera.${ext}`;
  if (!filename.toLowerCase().endsWith(`.${ext}`) && !(ext === "jpg" && /\.jpe?g$/i.test(filename))) filename += `.${ext}`;
  return { bytes, mimeType, filename };
}

async function graph(fetchImpl: typeof fetch, path: string, init: RequestInit, what: string) {
  const res = await fetchImpl(`${GRAPH}/${path}`, init);
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new DocSendError(`${what} failed ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : ""}`);
  return body;
}

export async function sendHanumanDocument(input: DocSendInput, db: PrismaClient = defaultDb, fetchImpl: typeof fetch = fetch) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) throw new DocSendError("Seera WhatsApp is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)", 503);
  const to = normalizeIndianMobile(input.to);
  if (!to) throw new DocSendError("Not a valid Indian mobile number", 400);
  const key = `hanuman-doc:${input.requestId}`;

  const prior = await db.auditLog.findFirst({
    where: { entityType: "HanumanDocumentSend", entityId: key, action: "hanuman.document_sent" },
    select: { details: true },
  });
  if (prior) return { sent: true, alreadySent: true, messageId: (prior.details as { messageId?: string } | null)?.messageId ?? null };

  const actorId = await founderActorId(db).catch(() => null);
  try {
    const file = await loadFile(input, fetchImpl);
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", file.mimeType);
    form.append("file", new Blob([Buffer.from(file.bytes)], { type: file.mimeType }), file.filename);
    const up = await graph(fetchImpl, `${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, "Media upload");
    if (!up.id) throw new DocSendError("Media upload returned no id");

    const kind = file.mimeType === "application/pdf" ? "document" : "image";
    const media: Record<string, string> = { id: up.id };
    if (kind === "document") media.filename = file.filename;
    const caption = input.caption?.slice(0, 1000);
    const payload = input.template
      ? {
          type: "template",
          template: {
            name: input.template.name,
            language: { code: input.template.languageCode || "hi" },
            components: [
              { type: "header", parameters: [{ type: kind, [kind]: media }] },
              ...(input.template.params?.length ? [{ type: "body", parameters: input.template.params.map((p) => ({ type: "text", text: String(p).replace(/\s*\n+\s*/g, " ").slice(0, 1000) })) }] : []),
            ],
          },
        }
      : { type: kind, [kind]: { ...media, ...(caption ? { caption } : {}) } };
    const sent = await graph(fetchImpl, `${phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    }, input.template ? `Template ${input.template.name}` : "Document send");
    const messageId: string = sent.messages?.[0]?.id ?? "";
    await recordAudit(db, { actorId, action: "hanuman.document_sent", entityType: "HanumanDocumentSend", entityId: key,
      details: { to: `…${to.slice(-4)}`, filename: file.filename, mimeType: file.mimeType, bytes: file.bytes.length, template: input.template?.name ?? null, messageId } });
    return { sent: true, alreadySent: false, messageId, filename: file.filename, mimeType: file.mimeType, bytes: file.bytes.length, via: input.template ? "TEMPLATE_HEADER" : kind.toUpperCase() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordAudit(db, { actorId, action: "hanuman.document_send_failed", entityType: "HanumanDocumentSend", entityId: key, outcome: "FAILURE",
      details: { to: `…${to.slice(-4)}`, template: input.template?.name ?? null, error: message.slice(0, 300) } }).catch(() => {});
    throw e;
  }
}
