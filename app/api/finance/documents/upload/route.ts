import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { uploadFinanceDocument } from "@/lib/finance/document-service";

const metadata = z.object({
  entityType: z.enum(["SeeraExpense", "SeeraVendorBill", "SeeraLoan", "SeeraFixedAsset", "SeeraBankStatementImport", "SeeraPayrollEntry"]),
  entityId: z.string().min(1).max(160),
}).strict();

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    enforceRateLimit(`finance-documents-upload:${user.id}`, 30, 60_000);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 26_000_000) return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 25_000_000) throw new Error("Document file must be between 1 byte and 25 MB");
    const data = metadata.parse(JSON.parse(String(form.get("metadata") ?? "{}")));
    const result = await uploadFinanceDocument(prisma, user.id, { ...data, originalName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiFailure(error, request);
  }
}
