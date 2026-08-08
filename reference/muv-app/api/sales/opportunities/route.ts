import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listOpportunities } from "@/lib/opportunity/repository";
import { createOpportunity } from "@/lib/opportunity/pipeline";
import { requireAnyPermission, requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission(PERMISSIONS.OPPORTUNITIES_VIEW_ALL, PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED);
    const q = request.nextUrl.searchParams;
    const result = await listOpportunities({
      q: q.get("q") ?? undefined, page: Number(q.get("page") ?? 1), pageSize: Number(q.get("pageSize") ?? 20),
      owner: q.get("owner") ?? undefined, stage: q.get("stage") ?? undefined, status: q.get("status") ?? undefined,
      priority: q.get("priority") ?? undefined, territory: q.get("territory") ?? undefined,
      customerType: q.get("customerType") ?? undefined, channel: q.get("channel") ?? undefined,
      sort: q.get("sort") ?? undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_CREATE);
    const data = z.object({ customerId: z.string().cuid(), sourceInquiryId: z.string().cuid().nullish(),
      ownerUserId: z.string().cuid(), territoryId: z.string().cuid().nullish(), salesChannelId: z.string().cuid().nullish(),
      customerTypeId: z.string().cuid().nullish(), leadSourceId: z.string().cuid().nullish(),
      estimatedValue: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/).default("INR"),
      expectedCloseDate: z.coerce.date().nullish(), priorityCode: z.string().default("NORMAL") }).parse(await request.json());
    if (!actor.isFounder && !actor.permissions.has(PERMISSIONS.OPPORTUNITIES_ASSIGN) && data.ownerUserId !== actor.id) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Assignment is not permitted" } }, { status: 403 });
    }
    const opportunity = await createOpportunity(actor, data);
    return NextResponse.json({ success: true, data: opportunity }, { status: 201 });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
