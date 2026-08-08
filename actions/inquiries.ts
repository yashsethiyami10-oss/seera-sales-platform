"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, AppError, NotFoundError } from "@/lib/errors";
import { businessInquirySchema, updateInquiryStatusSchema } from "@/lib/validations/inquiry";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireStaff } from "@/lib/rbac";
import { logger } from "@/lib/logger";
import { sendAdminNewInquiryAlert } from "@/lib/notify/send";

/**
 * Public, unauthenticated form (no requireX call — anyone reaching /contact
 * can submit one) — rate-limited by IP the same way signup() is, since it's
 * the same shape of risk (an anonymous form that could be spammed).
 */
export async function submitBusinessInquiry(input: unknown) {
  try {
    const data = businessInquirySchema.parse(input);

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`business-inquiry:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      throw new AppError("Too many submissions. Please try again later.", 429, "RATE_LIMITED");
    }

    const inquiry = await prisma.businessInquiry.create({ data });

    logger.info("inquiry:business:submitted", { inquiryId: inquiry.id, businessType: inquiry.businessType });
    sendAdminNewInquiryAlert({ name: inquiry.contactPerson, businessType: inquiry.businessType, email: inquiry.email }).catch((err) => logger.error("notify:admin-new-inquiry:failed", { error: String(err) }));

    return { success: true as const, data: { id: inquiry.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Phase 1C (GAP-006) — the admin-side counterpart to submitBusinessInquiry.
 * Calls requireStaff() itself, independently of any caller, per this
 * codebase's own rule (see CLAUDE.md / SECURITY.md): every exported
 * "use server" function is independently callable as its own RPC endpoint,
 * so it must never rely on the page/component that happens to call it
 * having already checked permissions.
 */
export async function updateInquiryStatus(input: unknown) {
  try {
    await requireStaff();
    const data = updateInquiryStatusSchema.parse(input);

    const inquiry = await prisma.businessInquiry.findUnique({ where: { id: data.id } });
    if (!inquiry) throw new NotFoundError("Inquiry");

    const updated = await prisma.businessInquiry.update({ where: { id: data.id }, data: { status: data.status } });

    logger.info("inquiry:business:status-updated", { inquiryId: updated.id, status: updated.status });
    revalidatePath("/admin/inquiries");
    return { success: true as const, data: { id: updated.id, status: updated.status } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
