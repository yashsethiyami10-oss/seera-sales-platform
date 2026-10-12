import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { findRetailerMatches, submitMarketSurvey } from "@/lib/sales-distribution/market-survey-service";

const noStore = { "Cache-Control": "no-store" };

/** Staff submit a market survey. Auth, RBAC, validation and idempotency are enforced in the service. */
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`market-survey:submit:${user.id}`, 30, 60_000);
    const { survey, replayed } = await submitMarketSurvey(prisma, user.id, await request.json());
    return NextResponse.json({ id: survey.id, reference: survey.reference, whatsappState: survey.whatsappState, replayed }, { status: replayed ? 200 : 201, headers: noStore });
  } catch (error) {
    return apiFailure(error, request);
  }
}

/** Existing retailers with this mobile that the caller may link the survey to. */
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`market-survey:lookup:${user.id}`, 60, 60_000);
    const mobile = new URL(request.url).searchParams.get("mobile") ?? "";
    return NextResponse.json({ matches: await findRetailerMatches(prisma, user.id, mobile) }, { headers: noStore });
  } catch (error) {
    return apiFailure(error, request);
  }
}
