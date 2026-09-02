import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { vendorBillSnapshot } from "@/lib/finance/vendor-service";
import { renderIssuedDocumentPdf, documentPdfFilename, type DocumentBranding } from "@/lib/sales-distribution/document-pdf";
import { getCompanyProfile, getBrandingAssetBytes } from "@/lib/finance/company-profile-service";

// Money Desk 2.0 (Part 16) — Purchase Bill PDF. Same pattern as /api/finance/statements/ledger-pdf:
// the UI and the PDF both read from the SAME service (vendorBillSnapshot), so the document can
// never disagree with what's shown on screen. Company branding (signature/seal) is fetched fresh
// at render time, same as document-service.ts's companyBrandingFor for Sales Invoices.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-vendor-bill-pdf:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const billId = url.searchParams.get("billId");
    if (!billId) throw new FoundationError("BILL_ID_REQUIRED", "billId is required", 400);

    const snapshot = await vendorBillSnapshot(prisma, user.id, billId);
    const profile = await getCompanyProfile(prisma);
    // signatoryParty: "buyer" — for a Purchase Bill, `issuer` in the snapshot is the VENDOR (they
    // issued the original bill to us, correctly shown in the ISSUED BY box); the signatory
    // authorizing OUR OWN internal record of the purchase is the Company (the buyer), never the
    // vendor. Set unconditionally, independent of whether a Company Profile/branding assets exist.
    const branding: DocumentBranding = { signatoryParty: "buyer" };
    if (profile) {
      const [signatureImage, sealImage] = await Promise.all([
        getBrandingAssetBytes(prisma, profile.signatureFileId),
        getBrandingAssetBytes(prisma, profile.sealFileId),
      ]);
      branding.signatoryName = profile.signatoryName ?? undefined;
      branding.signatoryDesignation = profile.signatoryDesignation ?? undefined;
      branding.signatureImage = signatureImage ?? undefined;
      branding.sealImage = sealImage ?? undefined;
    }
    const bytes = await renderIssuedDocumentPdf(snapshot, branding);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${documentPdfFilename({ type: snapshot.type, documentNumber: snapshot.documentNumber })}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
