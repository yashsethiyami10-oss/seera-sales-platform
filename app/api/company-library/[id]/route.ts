import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { archiveCompanyLibraryDocument, downloadCompanyLibraryDocument } from "@/lib/sales-distribution/company-library-service";

const safeName = (name: string) => name.replace(/["\r\n]/g, "_");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    const result = await downloadCompanyLibraryDocument(prisma, user.id, (await params).id);
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${safeName(result.filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}

const body = z.object({ action: z.literal("archive") }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`company-library-archive:${user.id}`, 30, 60_000);
    body.parse(await request.json());
    await archiveCompanyLibraryDocument(prisma, user.id, (await params).id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
