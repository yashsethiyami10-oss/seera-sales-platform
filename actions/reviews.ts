"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCustomer, requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError, ForbiddenError } from "@/lib/errors";
import { createReviewSchema, moderateReviewSchema } from "@/lib/validations/review";
import { sendAdminNewReviewAlert } from "@/lib/notify/send";
import { logger } from "@/lib/logger";

export async function createReview(input: unknown) {
  try {
    const user = await requireCustomer();
    const data = createReviewSchema.parse(input);

    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    // Verified-purchase gate: only customers who actually bought this
    // product may review it — checked against OrderItem, not trusted from
    // the client. Prevents review-bombing or fake reviews from any account.
    const hasPurchased = await prisma.orderItem.findFirst({
      where: {
        variant: { productId: data.productId },
        order: { customerId: customer.id, status: "DELIVERED" },
      },
    });
    if (!hasPurchased) {
      throw new ForbiddenError("You can review a product after it's been delivered to you");
    }

    const review = await prisma.review.upsert({
      where: { productId_customerId: { productId: data.productId, customerId: customer.id } },
      update: { rating: data.rating, title: data.title, body: data.body, status: "PENDING" },
      create: { ...data, customerId: customer.id, status: "PENDING" },
      include: { product: { select: { name: true } } },
    });

    sendAdminNewReviewAlert({ productName: review.product.name, customerName: customer.name, rating: review.rating }).catch((err) => logger.error("notify:admin-new-review:failed", { error: String(err) }));

    revalidatePath(`/products`);
    return { success: true as const, data: review };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function moderateReview(input: unknown) {
  try {
    await requireStaff();
    const data = moderateReviewSchema.parse(input);

    const review = await prisma.review.findUnique({ where: { id: data.reviewId } });
    if (!review) throw new NotFoundError("Review");

    const updated = await prisma.review.update({ where: { id: data.reviewId }, data: { status: data.status } });
    revalidatePath("/admin/reviews");
    revalidatePath("/products");
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteReview(id: string) {
  try {
    const user = await requireCustomer().catch(() => null);
    const staff = user ? null : await requireStaff().catch(() => null);
    if (!user && !staff) throw new ForbiddenError();

    const review = await prisma.review.findUnique({ where: { id }, include: { customer: true } });
    if (!review) throw new NotFoundError("Review");

    if (user && review.customer.userId !== user.id) throw new ForbiddenError();

    await prisma.review.delete({ where: { id } });
    revalidatePath("/products");
    revalidatePath("/admin/reviews");
    return { success: true as const, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
