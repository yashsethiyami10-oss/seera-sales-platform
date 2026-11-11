import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { FoundationError } from "@/lib/foundation/errors";
import { readBuiltinLibraryDocument } from "@/lib/sales-distribution/company-library";
import { assertCanViewCompanyLibrary } from "@/lib/sales-distribution/company-library-service";

// Built-in SEERA templates (content/company-library/*.pdf), for signed-in staff only.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    await assertCanViewCompanyLibrary(prisma, user.id);
    const result = await readBuiltinLibraryDocument((await params).slug);
    if (!result) throw new FoundationError("DOCUMENT_NOT_FOUND", "Document not found", 404);
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
