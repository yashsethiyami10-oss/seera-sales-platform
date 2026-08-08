import { NextRequest, NextResponse } from "next/server";
import { createPurchaseRequisition, listPurchaseRequisitions } from "@/lib/enterprise/procurement-service";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    return NextResponse.json({ success: true, data: await listPurchaseRequisitions({ q: q.get("q") ?? undefined, status: q.get("status") ?? undefined, page: Number(q.get("page") ?? 1), pageSize: Number(q.get("pageSize") ?? 20) }) });
  } catch (error) { return NextResponse.json(toErrorResponse(error), { status: statusForError(error) }); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json({ success: true, data: await createPurchaseRequisition(await request.json()) }, { status: 201 }); }
  catch (error) { return NextResponse.json(toErrorResponse(error), { status: statusForError(error) }); }
}

