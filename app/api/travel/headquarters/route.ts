import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { configureEmployeeHeadquarters } from "@/lib/sales-distribution/travel-claim-service";

const body = z.object({ employeeId: z.string(), headquartersName: z.string().min(1), geographyId: z.string().optional(), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional(), reason: z.string().min(1) });
export async function POST(request: Request) {
  try { const { user } = await resolveRequestIdentity(); return NextResponse.json(await configureEmployeeHeadquarters(prisma, user.id, body.parse(await request.json()))); }
  catch (error) { return apiFailure(error, request); }
}
