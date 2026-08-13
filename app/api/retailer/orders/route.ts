import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { placeRetailerOrder } from "@/lib/sales-distribution/workflow-service";

const inputSchema = z.object({
  retailerId: z.string().min(1),
  requestedDeliveryAt: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(12).max(160),
  lines: z
    .array(
      z.object({
        skuId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    // HARDENING A: per-actor rate limit, matching the pattern already used on comparable
    // authenticated mutation routes (/api/foundation/users, /api/offline/sync) — this route was
    // previously unlimited.
    enforceRateLimit(`retailer-orders:${user.id}`, 60, 60_000);
    const input = inputSchema.parse(await request.json());
    const assignment = await prisma.seeraAssignment.findFirst({
      where: {
        assignmentType: "RETAILER_USER",
        subjectType: "USER",
        subjectId: user.id,
        targetType: "RETAILER",
        targetId: input.retailerId,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { targetId: true },
    });
    if (!assignment)
      throw new FoundationError(
        "RETAILER_SCOPE_DENIED",
        "Retailer account is not assigned to this business",
        403,
      );
    const retailer = await prisma.seeraRetailer.findUnique({
      where: { id: assignment.targetId },
      select: { distributorId: true },
    });
    if (!retailer?.distributorId)
      throw new FoundationError(
        "RETAILER_DISTRIBUTOR_REQUIRED",
        "Retailer has no active distributor",
        409,
      );
    const order = await placeRetailerOrder(
      prisma,
      {
        actorId: user.id,
        sourcePortal: "retailer",
        commercialPartyType: "DISTRIBUTOR",
        commercialPartyId: retailer.distributorId,
      },
      input,
    );
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
