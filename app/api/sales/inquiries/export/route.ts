import { NextRequest, NextResponse } from "next/server";
import { statusForError, toErrorResponse } from "@/lib/errors";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listInquiries } from "@/lib/sales-channel/repository";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_CHANNELS);
    const q = request.nextUrl.searchParams;
    const result = await listInquiries({ q: q.get("q") ?? undefined, channel: q.get("channel") ?? undefined, status: q.get("status") ?? undefined, pageSize: 100 });
    const rows = [
      ["Reference", "Customer", "Channel", "Source", "Status", "Priority", "Owner", "Created"],
      ...result.items.map((i) => [i.inquiryNumber, i.customer?.businessName ?? i.customer?.name, i.salesChannel.name, i.leadSource.name, i.status.displayName, i.priority, i.assignedOwner?.name, i.createdAt.toISOString()]),
    ];
    return new NextResponse(rows.map((row) => row.map(csv).join(",")).join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="muv-inquiries.csv"' },
    });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
