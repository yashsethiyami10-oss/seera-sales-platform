import { NextRequest, NextResponse } from "next/server";
import { hanumanSignatureOk, readQuery } from "@/lib/hanuman/read-query";
import { catalog, draftBill, findParties, sendBill, type BillLine } from "@/lib/hanuman/bill-service";
import { RelayInputError, sendDocument, sendTemplateMessage, submitDocumentTemplate, templateStatus } from "@/lib/hanuman/wa-relay";

/**
 * Hanuman (the Founder's WhatsApp AI chief of staff, a separate Netlify site) reads Seera's numbers
 * here: collections, partners, orders, coverage. Server-to-server: authenticated by an HMAC of the raw
 * body with HANUMAN_FORWARD_SECRET (set on this site and, as SEERA_RELAY_SECRET, on Hanuman) and a
 * 5-minute timestamp in the body, not by browser origin. Read-only (lib/hanuman/read-query.ts).
 * 403 unless HANUMAN_FORWARD_SECRET is set.
 */
export const dynamic = "force-dynamic";
const MAX_AGE_MS = 5 * 60 * 1000;


export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!hanumanSignatureOk(raw, req.headers.get("x-hanuman-signature"), process.env.HANUMAN_FORWARD_SECRET?.trim())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { op?: string; sql?: string; ts?: number } & Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  if (typeof body.ts !== "number" || Math.abs(Date.now() - body.ts) > MAX_AGE_MS) return NextResponse.json({ error: "stale" }, { status: 403 });
  try {
    if (body.op === "query" && typeof body.sql === "string" && body.sql.length <= 8000) return NextResponse.json(await readQuery(body.sql));
    // Bills (lib/hanuman/bill-service.ts): the same contract as MUV's /api/hanuman/billing.
    const b = body as Record<string, unknown>;
    const lines = Array.isArray(b.lines) ? (b.lines as BillLine[]).slice(0, 50).map((l) => ({ variantId: String(l.variantId), quantity: Number(l.quantity), discountPercent: Math.min(Math.max(Number(l.discountPercent ?? 0), 0), 100) })) : [];
    const id = typeof b.customerId === "string" ? b.customerId.slice(0, 60) : "";
    if (body.op === "bill_parties" && typeof b.query === "string" && b.query.trim().length >= 2) return NextResponse.json(await findParties(b.query.slice(0, 80)));
    if (body.op === "bill_catalog") return NextResponse.json(await catalog());
    // WhatsApp from Seera's own number (lib/hanuman/wa-relay.ts).
    if (body.op === "wa_send_document") return NextResponse.json(await sendDocument(b as never));
    if (body.op === "wa_send_template") return NextResponse.json(await sendTemplateMessage(b as never));
    if (body.op === "wa_template_submit") return NextResponse.json(await submitDocumentTemplate(b as never));
    if (body.op === "wa_template_status") return NextResponse.json(await templateStatus(b.name));
    if (lines.some((l) => !l.variantId || !Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 100000)) return NextResponse.json({ error: "bad lines" }, { status: 400 });
    if (body.op === "bill_draft" && id && lines.length) return NextResponse.json(await draftBill(id, lines));
    if (body.op === "bill_send" && id && lines.length && typeof b.requestId === "string" && /^[A-Za-z0-9:_-]{8,64}$/.test(b.requestId)) return NextResponse.json(await sendBill(id, lines, b.requestId));
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (err) {
    if (err instanceof RelayInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hanuman-relay] failed", message.slice(0, 300));
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 422 });
  }
}
