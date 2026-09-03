import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { partyLedgerStatement, assertKnownPartyType } from "@/lib/finance/party-ledger-service";
import { renderLedgerStatementPdf } from "@/lib/finance/statement-pdf";
import { getCompanyProfile, getBrandingAssetBytes } from "@/lib/finance/company-profile-service";
import type { DocumentBranding } from "@/lib/sales-distribution/document-pdf";

// Same UI-reads-the-same-service-the-PDF-reads pattern as /api/finance/statements/pdf — the PDF
// can never disagree with the on-screen ledger because both call partyLedgerStatement() directly,
// never a second, separately-maintained totals calculation.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-ledger-pdf:${user.id}`, 20, 60_000);
    const url = new URL(request.url);
    const partyType = assertKnownPartyType(url.searchParams.get("partyType"));
    const partyId = url.searchParams.get("partyId");
    if (!partyId) throw new FoundationError("PARTY_ID_REQUIRED", "partyId is required", 400);
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date("2000-01-01");
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();

    const statement = await partyLedgerStatement(prisma, user.id, { partyType, partyId, from, to });
    const companyProfile = await getCompanyProfile(prisma);
    const { formatAddress } = await import("@/lib/sales-distribution/document-lines");
    // GAP 2 (Final 100% Gap Closure) — same real signature/seal branding every other issued
    // document (Sales Invoice/Purchase Bill/Payment Receipt) already uses, wired the same way.
    const branding: DocumentBranding = { signatoryParty: "issuer" };
    if (companyProfile) {
      const [signatureImage, sealImage] = await Promise.all([
        getBrandingAssetBytes(prisma, companyProfile.signatureFileId),
        getBrandingAssetBytes(prisma, companyProfile.sealFileId),
      ]);
      branding.signatoryName = companyProfile.signatoryName ?? undefined;
      branding.signatoryDesignation = companyProfile.signatoryDesignation ?? undefined;
      branding.signatureImage = signatureImage ?? undefined;
      branding.sealImage = sealImage ?? undefined;
    }
    const bytes = await renderLedgerStatementPdf({
      companyName: companyProfile?.tradeName || companyProfile?.legalName || "SEERA",
      company: companyProfile
        ? { gstin: companyProfile.gstin, pan: companyProfile.pan, address: formatAddress(companyProfile.registeredAddress), phone: companyProfile.phone, email: companyProfile.email, website: companyProfile.website }
        : undefined,
      party: statement.party,
      period: statement.period,
      openingBalance: statement.openingBalance,
      rows: statement.rows,
      totals: statement.totals,
      normalSide: statement.normalSide,
      branding,
    });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Ledger-${statement.party.name.replace(/\s+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
