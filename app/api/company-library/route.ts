import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { uploadCompanyLibraryDocument } from "@/lib/sales-distribution/company-library-service";

// Founder/Admin upload of an extra Company document (settings:manage is checked in the service).
// Cross-origin POSTs are already refused by middleware.ts for every /api/ route.
export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`company-library-upload:${user.id}`, 20, 60_000);
    if (Number(request.headers.get("content-length") ?? 0) > 26_000_000)
      return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: { code: "FILE_REQUIRED", message: "Choose a file" } }, { status: 400 });
    const document = await uploadCompanyLibraryDocument(prisma, user.id, {
      title: String(form.get("title") ?? ""),
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      originalName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ id: document.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, request);
  }
}
