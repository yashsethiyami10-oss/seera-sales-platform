import { NextRequest, NextResponse } from "next/server";
import { enterpriseSearch } from "@/lib/enterprise/search";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const entity = q.get("entity");
    if (!entity) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "entity is required" } }, { status: 422 });
    const data = await enterpriseSearch({ q: q.get("q") ?? "", entity: entity as Parameters<typeof enterpriseSearch>[0]["entity"], page: Number(q.get("page") ?? 1), pageSize: Number(q.get("pageSize") ?? 20) });
    return NextResponse.json({ success: true, data });
  } catch (error) { return NextResponse.json(toErrorResponse(error), { status: statusForError(error) }); }
}

