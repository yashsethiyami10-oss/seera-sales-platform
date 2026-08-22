import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { changeOwnPassword } from "@/lib/foundation/auth-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";

const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(256) });

// Self-service only — operates on the caller's own identity from the session, never a client-
// supplied user id, unlike the admin PATCH /api/foundation/users/[id] (action=reset_password).
export async function PATCH(request: Request) {
  try {
    const { session, user } = await resolveRequestIdentity();
    enforceRateLimit(`password-change:${user.id}`, 5, 300_000);
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) throw new FoundationError("VALIDATION_ERROR", "Current and new password are required", 400);
    const result = await changeOwnPassword(prisma, user.id, session.id, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
