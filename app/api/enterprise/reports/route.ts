import { NextRequest, NextResponse } from "next/server";
import { getOperationalDashboard } from "@/lib/enterprise/planning-reporting";
import { requireEnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REPORTING_EXPORT, "ENTERPRISE_REPORTING_ENABLED");
    const data = await getOperationalDashboard();
    const format = request.nextUrl.searchParams.get("format");
    await prisma.salesAuditLog.create({ data: { userId: principal.id, module: "enterprise_reporting", action: "REPORT_EXPORT", recordType: "EnterpriseOperations", newValue: { organizationKey: principal.organizationKey, format: format ?? "json" } } });
    if (format === "csv") {
      const csv = `metric,value\nvendors,${data.vendors.reduce((n, row) => n + row._count, 0)}\nrequisitions,${data.requisitions.reduce((n, row) => n + row._count, 0)}\nwarehouse_movements,${data.warehouseMovements}\nplanning_snapshots,${data.planningSnapshots}\n`;
      return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=enterprise-operations.csv" } });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) { return NextResponse.json(toErrorResponse(error), { status: statusForError(error) }); }
}

