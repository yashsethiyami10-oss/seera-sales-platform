import { NextRequest, NextResponse } from "next/server";
import { getOpportunity } from "@/lib/opportunity/repository";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { NotFoundError, statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission(PERMISSIONS.OPPORTUNITIES_VIEW_ALL, PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED);
    const opportunity = await getOpportunity((await context.params).id);
    if (!opportunity) throw new NotFoundError("Opportunity");
    return NextResponse.json({ success: true, data: opportunity });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
