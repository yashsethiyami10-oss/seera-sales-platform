import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { decideApproval } from "@/lib/foundation/approval-service";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";

const body = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await resolveRequestIdentity();
    const { id } = await context.params;
    return NextResponse.json(
      await decideApproval(
        prisma,
        user.id,
        id,
        body.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiFailure(error, request);
  }
}
