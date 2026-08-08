import { NextResponse } from "next/server";
import { getSalesPrincipal } from "@/lib/sales/authorization";

export async function GET() {
  try {
    const principal = await getSalesPrincipal();
    return NextResponse.json({
      role: principal.salesRole.name,
      permissions: principal.isFounder ? ["*"] : [...principal.permissions],
      territoryId: principal.territoryId,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
