import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { FoundationError } from "@/lib/foundation/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await resolveRequestIdentity();
    const { id } = await params;
    const photo = await prisma.seeraVisitPhoto.findFirst({
      where: { id, deletedAt: null },
      include: { visit: { include: { workSession: true } } },
    });
    if (!photo || photo.visit.workSession.employeeId !== user.id)
      throw new FoundationError("PHOTO_SCOPE_DENIED", "Photo unavailable", 403);
    if (photo.storageProvider === "CLOUDINARY" && photo.secureUrl)
      return NextResponse.redirect(photo.secureUrl, 307);
    if (!photo.fileId)
      throw new FoundationError("PHOTO_CONTENT_UNAVAILABLE", "Photo content unavailable", 404);
    const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: photo.fileId } });
    if (!file.contentBytes)
      throw new FoundationError("PHOTO_CONTENT_UNAVAILABLE", "Photo content unavailable", 404);
    return new NextResponse(new Uint8Array(file.contentBytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
