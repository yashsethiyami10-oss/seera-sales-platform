import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { provisionPartnerLogin } from "@/lib/foundation/user-management-service";

// Founder/Admin UAT correction (P0, section 8-9): "Set Up Login" — provisions a brand-new human
// user, assigns the correct system role for their partner + access-role combination, and grants
// them SeeraPartyUser membership on the target partner, in one governed step. Returns a
// server-generated temporary password exactly once (see provisionPartnerLogin's own comment for
// why no invite-delivery/forced-rotation mechanism exists to build on instead).
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`partner-login-provision:${user.id}`, 20, 60_000);
    const result = await provisionPartnerLogin(prisma, user.id, await request.json());
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
