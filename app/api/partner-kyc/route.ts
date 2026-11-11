import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import {
  getKycSubject,
  KYC_DOC_TYPES,
  KYC_MAX_BYTES,
  listKycSubjects,
  removeKycDocument,
  saveKycDetails,
  uploadKycDocument,
} from "@/lib/sales-distribution/partner-kyc-service";

// Partner KYC documents. Mutations are POST only; middleware.ts already rejects a cross-origin
// POST to /api/*, and every service call re-checks the actor's scope for the subject itself.
const subject = { subjectType: z.enum(["PROSPECT", "PARTNER"]), subjectId: z.string().min(1).max(64) };
const jsonBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("subject"), ...subject }),
  z.object({ action: z.literal("remove"), documentId: z.string().min(1).max(64), reason: z.string().min(1).max(300) }),
  z.object({
    action: z.literal("details"),
    ...subject,
    details: z
      .object({
        gstin: z.string().max(20).optional(),
        pan: z.string().max(12).optional(),
        aadhaarLast4: z.string().max(6).optional(),
        bankAccountName: z.string().max(120).optional(),
        bankAccountNumber: z.string().max(24).optional(),
        ifsc: z.string().max(14).optional(),
        bankName: z.string().max(120).optional(),
      })
      .strict(),
  }),
]);

export async function POST(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      enforceRateLimit(`partner-kyc-upload:${user.id}`, 40, 60_000);
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > KYC_MAX_BYTES + 200_000) return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "File is larger than 10 MB" } }, { status: 413 });
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("A file is required");
      const meta = z
        .object({ ...subject, docType: z.enum(KYC_DOC_TYPES), note: z.string().max(500).optional() })
        .parse({
          subjectType: form.get("subjectType"),
          subjectId: form.get("subjectId"),
          docType: form.get("docType"),
          note: form.get("note") || undefined,
        });
      const saved = await uploadKycDocument(prisma, user.id, {
        ...meta,
        originalName: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return NextResponse.json(saved, { status: 201 });
    }
    enforceRateLimit(`partner-kyc:${user.id}`, 120, 60_000);
    const body = jsonBody.parse(await request.json());
    if (body.action === "list") return NextResponse.json({ subjects: await listKycSubjects(prisma, user.id) });
    if (body.action === "subject") return NextResponse.json(await getKycSubject(prisma, user.id, body.subjectType, body.subjectId));
    if (body.action === "remove") return NextResponse.json(await removeKycDocument(prisma, user.id, body.documentId, body.reason));
    await saveKycDetails(prisma, user.id, body.subjectType, body.subjectId, body.details);
    return NextResponse.json(await getKycSubject(prisma, user.id, body.subjectType, body.subjectId));
  } catch (error) {
    // P2021 = table missing: the KYC migration has not been applied to this database yet. Say so
    // plainly instead of a generic 500, so the rest of the app is unaffected and the fix is clear.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021")
      return NextResponse.json(
        { error: { code: "KYC_NOT_SET_UP", message: "Partner KYC storage is not set up on this server yet — ask the admin to apply the latest database migration." } },
        { status: 503 },
      );
    return apiFailure(error, request);
  }
}
