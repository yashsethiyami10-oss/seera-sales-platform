import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { FoundationError } from "@/lib/foundation/errors";
import { partyLedgerStatement, assertKnownPartyType } from "@/lib/finance/party-ledger-service";
import { renderLedgerStatementPdf } from "@/lib/finance/statement-pdf";
import { getCompanyProfile } from "@/lib/finance/company-profile-service";

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
    const bytes = await renderLedgerStatementPdf({
      companyName: companyProfile?.tradeName || companyProfile?.legalName || "SEERA",
      company: companyProfile
        ? { gstin: companyProfile.gstin, address: formatAddress(companyProfile.registeredAddress), phone: companyProfile.phone, email: companyProfile.email }
        : undefined,
      party: statement.party,
      period: statement.period,
      openingBalance: statement.openingBalance,
      rows: statement.rows,
      totals: statement.totals,
      normalSide: statement.normalSide,
    });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Ledger-${statement.party.name.replace(/\s+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
