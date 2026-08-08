import { NextRequest, NextResponse } from "next/server";
import { authorizeIntelligenceExport } from "@/actions/growth";
import { listCustomerIntelligence } from "@/lib/growth/repository";
import { AppError } from "@/lib/errors";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET(request: NextRequest) {
  try {
    const principal = await authorizeIntelligenceExport();
    const scope = principal.isFounder || principal.permissions.has("intelligence.view_all") ? {} : { ownerUserId: principal.id };
    const result = await listCustomerIntelligence({ search: request.nextUrl.searchParams.get("search") ?? undefined, take: 100 }, scope);
    const lines = [["Customer","Status","Revenue","Orders","AOV","Outstanding","Collection Rate"].map(csv).join(","),
      ...result.rows.map(({ customer, profile }) => [customer.businessName ?? customer.name, profile.statusCode, profile.netRevenue, profile.totalOrders, profile.averageOrderValue, profile.outstandingAmount, profile.collectionRate].map(csv).join(","))];
    return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=customer-intelligence.csv" } });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ error: status === 500 ? "Internal server error" : (error as Error).message }, { status });
  }
}
