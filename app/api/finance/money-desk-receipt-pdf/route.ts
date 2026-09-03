import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { moneyDeskReceiptSnapshot } from "@/lib/finance/money-desk-service";
import { renderIssuedDocumentPdf, documentPdfFilename, type DocumentBranding } from "@/lib/sales-distribution/document-pdf";
import { getCompanyProfile, getBrandingAssetBytes } from "@/lib/finance/company-profile-service";

// Money Desk 2.0 (Part P0-3) — Payment Receipt PDF for a real, already-POSTED Money-In transaction.
// Same pattern as vendor-bill-pdf/ledger-pdf: reads from the SAME service the transaction detail
// screen itself would use (moneyDeskReceiptSnapshot -> moneyDeskTransactionDetail), so the document
// can never disagree with what's shown on screen, and reuses the SAME branded PDF renderer every
// other issued document already uses.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-money-desk-receipt-pdf:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const transactionId = url.searchParams.get("transactionId");
    if (!transactionId) throw new FoundationError("TRANSACTION_ID_REQUIRED", "transactionId is required", 400);

    const snapshot = await moneyDeskReceiptSnapshot(prisma, user.id, transactionId);
    const profile = await getCompanyProfile(prisma);
    const branding: DocumentBranding = { signatoryParty: "issuer" };
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
