import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { readKycFile } from "@/lib/sales-distribution/partner-kyc-service";

// Streams one KYC file to an authorised viewer only. private + no-store so no shared cache or
// proxy keeps identity documents; nosniff so the declared type is the only type the browser uses.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    const { id } = await params;
    const file = await readKycFile(prisma, user.id, id);
    const safeName = file.filename.replace(/[^\w.\- ]/g, "_");
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
