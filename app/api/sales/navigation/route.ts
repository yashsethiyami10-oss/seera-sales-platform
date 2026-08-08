import { NextResponse } from "next/server";
import { getSalesNavigation } from "@/lib/sales/navigation";

export async function GET() {
  try {
    const navigation = await getSalesNavigation();
    return NextResponse.json(navigation.map(({ href, label }) => ({ href, label })));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
