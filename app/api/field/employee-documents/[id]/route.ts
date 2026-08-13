import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { downloadEmployeeDocument } from "@/lib/sales-distribution/employee-document-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await resolveRequestIdentity();
    const result = await downloadEmployeeDocument(prisma, user.id, (await params).id);
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
