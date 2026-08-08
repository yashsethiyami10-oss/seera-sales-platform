import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AppError, statusForError, toErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { routePublicInquiry } from "@/lib/sales-channel/routing";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listInquiries } from "@/lib/sales-channel/repository";

export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission(PERMISSIONS.INQUIRIES_VIEW_ALL, PERMISSIONS.INQUIRIES_VIEW_ASSIGNED);
    const q = request.nextUrl.searchParams;
    const result = await listInquiries({
      q: q.get("q") ?? undefined, page: Number(q.get("page")) || 1,
      channel: q.get("channel") ?? undefined, source: q.get("source") ?? undefined,
      status: q.get("status") ?? undefined, priority: q.get("priority") ?? undefined,
      queue: q.get("queue") ?? undefined, territory: q.get("territory") ?? undefined,
      owner: q.get("owner") ?? undefined, sort: q.get("sort") ?? undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) throw new AppError("Invalid request origin", 403, "FORBIDDEN");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`sales-inquiry:${ip}`, 10, 60 * 60 * 1000).allowed) {
      throw new AppError("Too many submissions. Please try again later.", 429, "RATE_LIMITED");
    }
    const session = await auth();
    const result = await routePublicInquiry(prisma, await request.json(), session?.user?.id);
    return NextResponse.json({
      success: true,
      data: {
        referenceNumber: result.inquiryNumber,
        message: "Thank you. Our team will review your request and contact you.",
        support: "support@muv.co.in",
      },
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(toErrorResponse(error), { status: statusForError(error) });
  }
}
