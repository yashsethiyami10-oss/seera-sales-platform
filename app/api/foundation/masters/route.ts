import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  createPriceVersion,
  createSku,
  supersedePriceVersion,
} from "@/lib/sales-distribution/workflow-service";

const requestBody = z.object({
  action: z.enum(["create-sku", "create-price", "supersede-price"]),
  payload: z.record(z.unknown()),
});

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`foundation-masters:${user.id}`, 30, 60_000);
    const { action, payload } = requestBody.parse(await request.json());
    const result =
      action === "supersede-price"
        ? await supersedePriceVersion(
            prisma,
            user.id,
            z
              .object({
                skuId: z.string().min(1),
                tier: z.enum(["COMPANY_TO_SS", "SS_TO_DISTRIBUTOR", "DISTRIBUTOR_TO_RETAILER"]),
                amount: z.number().positive(),
                effectiveFrom: z.coerce.date(),
                marginType: z.enum(["FIXED", "PERCENTAGE"]).optional(),
                marginValue: z.number().optional(),
                reason: z.string().trim().min(3),
              })
              .parse(payload),
          )
        : action === "create-sku"
        ? await createSku(
            prisma,
            user.id,
            z
              .object({
                code: z.string().trim().min(2).max(40),
                productName: z.string().trim().min(2).max(160),
                category: z.string().trim().min(2).max(80),
                packSize: z.number().positive(),
                unitType: z.string().trim().min(1).max(30),
                unitsPerCase: z.number().int().positive(),
                mrp: z.number().positive(),
                hsn: z.string().trim().max(20).optional(),
                taxRate: z.number().min(0).max(100).optional(),
              })
              .parse(payload),
          )
        : await createPriceVersion(
            prisma,
            user.id,
            z
              .object({
                skuId: z.string().min(1),
                tier: z.enum([
                  "COMPANY_TO_SS",
                  "SS_TO_DISTRIBUTOR",
                  "DISTRIBUTOR_TO_RETAILER",
                ]),
                amount: z.number().positive(),
                effectiveFrom: z.coerce.date(),
                effectiveTo: z.coerce.date().optional(),
              })
              .parse(payload),
          );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
