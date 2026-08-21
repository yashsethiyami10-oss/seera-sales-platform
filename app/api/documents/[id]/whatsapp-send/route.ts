import { NextResponse } from "next/server"; import { z } from "zod";
import { prisma } from "@/lib/database/client"; import { apiFailure } from "@/lib/foundation/api-response"; import { resolveRequestIdentity } from "@/lib/foundation/request-auth"; import { enforceRateLimit } from "@/lib/foundation/rate-limit"; import { sendDocumentViaWhatsApp } from "@/lib/sales-distribution/document-service"; import { getMessagingProvider } from "@/lib/messaging"; import { DocumentSendUnsupportedError } from "@/lib/messaging/types";
const body = z.object({ recipientType: z.string().min(1).max(40), recipientId: z.string().min(1).max(160), idempotencyKey: z.string().min(1).max(160).optional() }).strict();
// Real WhatsApp document send (actual PDF file, not a link) — see
// lib/sales-distribution/document-service.ts's sendDocumentViaWhatsApp for the
// authorization/scope proof and lib/messaging/providers/whatsapp-business.ts for the
// real Meta Cloud API media-upload implementation. A 422 UNSUPPORTED response here is
// the UI's signal to fall back to the honestly-labeled "Share Link on WhatsApp" flow
// (see app/api/documents/[id]/share/route.ts) instead of claiming a PDF was sent when
// it wasn't.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`document-whatsapp-send:${user.id}`, 10, 60_000);
    const input = body.parse(await request.json());
    const result = await sendDocumentViaWhatsApp(prisma, user.id, (await params).id, { ...input, getProvider: getMessagingProvider });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DocumentSendUnsupportedError) {
      return NextResponse.json({ error: { code: "WHATSAPP_DOCUMENT_SEND_UNSUPPORTED", message: error.message } }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    return apiFailure(error, request);
  }
}
