import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { finalizeFieldPhotoUpload } from "@/lib/sales-distribution/field-photo-cloudinary-service";

const requestSchema = z.object({
  visitId: z.string().min(1),
  photoType: z.enum(["SHOPFRONT", "COUNTER", "PRODUCT_DISPLAY", "BANNER_BRANDING", "MERCHANDISING", "OTHER"]),
  publicId: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`field-photo-finalize:${user.id}`, 20, 60_000);
    const input = requestSchema.parse(await request.json());
    const photo = await finalizeFieldPhotoUpload(prisma, user.id, input);
    return NextResponse.json({ id: photo.id, photoType: photo.photoType, capturedAt: photo.capturedAt.toISOString(), secureUrl: photo.secureUrl }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
