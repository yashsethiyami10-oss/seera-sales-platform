import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { classifyDailyTravelDuty } from "@/lib/sales-distribution/travel-claim-service";

const body = z.object({ claimId: z.string(), dutyType: z.enum(["LOCAL_HQ", "OUTSTATION"]), reason: z.string().min(1), reference: z.string().optional() });

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`travel-classification:${user.id}`, 30, 60_000);
    const input = body.parse(await request.json());
    return NextResponse.json(await classifyDailyTravelDuty(prisma, user.id, input.claimId, input));
  } catch (error) {
    return apiFailure(error, request);
  }
}
