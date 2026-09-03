import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { getCompanyProfileForSettings, getBrandingAssetBytes } from "@/lib/finance/company-profile-service";

// Part I (Final 100% Completion Execution Contract) — serves the real uploaded logo/signature/seal
// bytes as a viewable image, closing the "preview uploaded logo/signature/seal" gap (previously
// the Settings screen only showed a "(configured)" text label, never the actual image). Reuses the
// SAME governed read (getCompanyProfileForSettings, settings:manage — Founder/COMPANY_ADMIN only,
// the same gate every other Company Profile read/write already uses) and the SAME asset-bytes
// helper every PDF route already calls — no new storage path, no new engine.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-company-branding-asset:${user.id}`, 60, 60_000);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    if (kind !== "LOGO" && kind !== "SIGNATURE" && kind !== "SEAL") throw new FoundationError("INVALID_BRANDING_KIND", "kind must be LOGO, SIGNATURE, or SEAL", 400);

    const profile = await getCompanyProfileForSettings(prisma, user.id);
    const fileId = kind === "LOGO" ? profile?.logoFileId : kind === "SIGNATURE" ? profile?.signatureFileId : profile?.sealFileId;
    const asset = await getBrandingAssetBytes(prisma, fileId ?? null);
    if (!asset) throw new FoundationError("BRANDING_ASSET_NOT_FOUND", "No image has been uploaded for this yet", 404);

    // no-store, not a longer max-age: a re-upload must show immediately in the Settings preview,
    // not a stale cached image from before the change.
    return new NextResponse(Buffer.from(asset.bytes), {
      headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
