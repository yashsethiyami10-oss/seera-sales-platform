import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  createMarketSurveyCatalogueLink,
  linkMarketSurveyRetailer,
  recordMarketSurveyOptOut,
  retryMarketSurveyWhatsApp,
  revokeMarketSurveyLink,
  updateMarketSurveyFollowUp,
} from "@/lib/sales-distribution/market-survey-service";

const noStore = { "Cache-Control": "no-store" };
const body = z.object({ action: z.enum(["update-follow-up", "opt-out", "retry-whatsapp", "link-retailer", "create-link", "revoke-link"]), data: z.unknown().optional() });

/** Founder/Admin follow-up actions on one survey. Every action requires market_survey:manage (checked in the service). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`market-survey:manage:${user.id}`, 60, 60_000);
    const { id } = await params;
    const { action, data } = body.parse(await request.json());
    switch (action) {
      case "update-follow-up":
        await updateMarketSurveyFollowUp(prisma, user.id, id, data);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "opt-out":
        await recordMarketSurveyOptOut(prisma, user.id, id, data);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "retry-whatsapp":
        return NextResponse.json(await retryMarketSurveyWhatsApp(prisma, user.id, id), { headers: noStore });
      case "link-retailer":
        await linkMarketSurveyRetailer(prisma, user.id, id, data);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "create-link": {
        const link = await createMarketSurveyCatalogueLink(prisma, user.id, id, data);
        // The raw link exists only in this response; the QR encodes exactly that HTTPS URL.
        const qrSvg = await QRCode.toString(link.url, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 220 });
        return NextResponse.json({ url: link.url, expiresAt: link.expiresAt, whatsappState: link.whatsappState, qrSvg }, { headers: noStore });
      }
      case "revoke-link": {
        const { linkId } = z.object({ linkId: z.string().trim().min(1).max(40) }).parse(data);
        await revokeMarketSurveyLink(prisma, user.id, id, linkId);
        return NextResponse.json({ ok: true }, { headers: noStore });
      }
    }
  } catch (error) {
    return apiFailure(error, request);
  }
}
