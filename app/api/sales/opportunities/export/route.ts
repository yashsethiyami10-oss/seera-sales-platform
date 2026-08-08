import { NextRequest, NextResponse } from "next/server";
import { listOpportunities } from "@/lib/opportunity/repository";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { statusForError, toErrorResponse } from "@/lib/errors";

function csv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.OPPORTUNITIES_EXPORT);
    const q = request.nextUrl.searchParams;
    const result = await listOpportunities({ q: q.get("q") ?? undefined, stage: q.get("stage") ?? undefined,
      status: q.get("status") ?? undefined, pageSize: 100 });
    const header = ["Opportunity Number", "Customer", "Owner", "Stage", "Status", "Estimated Value", "Probability", "Expected Close"];
    const rows = result.items.map((item) => [item.opportunityNumber, item.customer.businessName ?? item.customer.name,
      item.owner.name, item.currentStage.name, item.status, item.estimatedValue, item.probability,
      item.expectedCloseDate?.toISOString() ?? ""].map(csv).join(","));
    await prisma.salesAuditLog.create({ data: { userId: actor.id, module: "opportunities", action: "SEARCH_EXPORT",
      recordType: "Opportunity", newValue: { query: q.get("q"), stage: q.get("stage"), status: q.get("status"), count: result.items.length } } });
    return new NextResponse([header.map(csv).join(","), ...rows].join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=opportunities.csv" },
    });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
