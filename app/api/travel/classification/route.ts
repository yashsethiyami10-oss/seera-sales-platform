import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { classifyDailyTravelDuty, classifyDailyAllowanceDayType } from "@/lib/sales-distribution/travel-claim-service";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duty"), claimId: z.string(), dutyType: z.enum(["LOCAL_HQ", "OUTSTATION"]), reason: z.string().min(1), reference: z.string().optional() }),
  z.object({ kind: z.literal("day"), claimId: z.string(), dayClassification: z.enum(["HALF_DAY", "FULL_DAY"]), reason: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`travel-classification:${user.id}`, 30, 60_000);
    const input = body.parse(await request.json());
    const result =
      input.kind === "duty"
        ? await classifyDailyTravelDuty(prisma, user.id, input.claimId, { dutyType: input.dutyType, reason: input.reason, reference: input.reference })
        : await classifyDailyAllowanceDayType(prisma, user.id, input.claimId, { dayClassification: input.dayClassification, reason: input.reason });
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(error, request);
  }
}
