import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { createFieldPhotoUploadSignature } from "@/lib/sales-distribution/field-photo-cloudinary-service";

const requestSchema = z.object({ visitId: z.string().min(1) }).strict();

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`field-photo-signature:${user.id}`, 20, 60_000);
    const { visitId } = requestSchema.parse(await request.json());
    return NextResponse.json(await createFieldPhotoUploadSignature(prisma, user.id, visitId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
