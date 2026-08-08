import { NextResponse } from "next/server";
import { getOpportunityDashboard } from "@/lib/opportunity/reporting";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.REPORTS_OPPORTUNITIES);
    return NextResponse.json({ success: true, data: await getOpportunityDashboard() });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
