import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { recordGpsTrackPoints } from "@/lib/sales-distribution/field-travel-service";

const body = z.object({
  workSessionId: z.string().min(1).max(64),
  points: z.array(z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number().nullable().optional(),
    capturedAt: z.string().max(40),
  }).strict()).min(1).max(300),
}).strict();

// Route-tracking batches from the field app while a day is ACTIVE (owner-only; checked in the service).
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`gps-track:${user.id}`, 30, 60_000);
    const result = await recordGpsTrackPoints(prisma, user.id, body.parse(await request.json()));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
