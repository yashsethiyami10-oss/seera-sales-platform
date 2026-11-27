import { NextRequest, NextResponse } from "next/server";
import { hanumanSignatureOk, readQuery } from "@/lib/hanuman/read-query";

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
  let body: { op?: string; sql?: string; ts?: number };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  if (typeof body.ts !== "number" || Math.abs(Date.now() - body.ts) > MAX_AGE_MS) return NextResponse.json({ error: "stale" }, { status: 403 });
  try {
    if (body.op === "query" && typeof body.sql === "string" && body.sql.length <= 8000) return NextResponse.json(await readQuery(body.sql));
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hanuman-relay] failed", message.slice(0, 300));
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 422 });
  }
}
