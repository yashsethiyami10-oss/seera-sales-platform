import { NextRequest, NextResponse } from "next/server";
import { listCustomerIntelligence } from "@/lib/growth/repository";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireAnyPermission(PERMISSIONS.INTELLIGENCE_VIEW_ALL, PERMISSIONS.INTELLIGENCE_VIEW_ASSIGNED, PERMISSIONS.INTELLIGENCE_VIEW_SUPPORT);
    const q = request.nextUrl.searchParams;
    const scope = principal.isFounder || principal.permissions.has(PERMISSIONS.INTELLIGENCE_VIEW_ALL) ? {}
      : { ownerUserId: principal.id, territoryId: principal.territoryId ?? undefined, institutionalOnly: principal.salesRole.name === "Institutional Sales Officer" };
    const result = await listCustomerIntelligence({
      search: q.get("search") ?? undefined, status: q.get("status") ?? undefined,
      segmentId: q.get("segment") ?? undefined, membershipLevelId: q.get("membership") ?? undefined,
      page: Number(q.get("page") ?? 1), take: Number(q.get("take") ?? 25),
      sort: (q.get("sort") as never) ?? undefined, direction: q.get("direction") === "asc" ? "asc" : "desc",
    }, scope);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ error: status === 500 ? "Internal server error" : (error as Error).message }, { status });
  }
}
