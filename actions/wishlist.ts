"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, ForbiddenError } from "@/lib/errors";

const toggleSchema = z.object({ productId: z.string().cuid(), variantId: z.string().cuid().optional() });

export async function addToWishlist(input: unknown) {
  try {
    const user = await requireCustomer();
    const data = toggleSchema.parse(input);

    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    // Upsert on the unique (customerId, productId) pair — calling this twice
    // for the same product is a no-op, not a duplicate-row error, so the
    // client doesn't need to check "is this already wishlisted" before calling.
    const entry = await prisma.wishlist.upsert({
      where: { customerId_productId: { customerId: customer.id, productId: data.productId } },
      update: {},
      create: { customerId: customer.id, productId: data.productId, variantId: data.variantId },
    });

    revalidatePath("/account/wishlist");
    return { success: true as const, data: entry };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function removeFromWishlist(productId: string) {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    const entry = await prisma.wishlist.findUnique({ where: { customerId_productId: { customerId: customer.id, productId } } });
    if (!entry) return { success: true as const, data: { productId } }; // already not there — same end state, not an error

    await prisma.wishlist.delete({ where: { id: entry.id } });
    revalidatePath("/account/wishlist");
    return { success: true as const, data: { productId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Full wishlist read — the one read this file was missing (add/remove/
 * isWishlisted already existed; nothing previously listed every item). */
export async function getWishlist() {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return { success: true as const, data: [] };

    const items = await prisma.wishlist.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            category: { select: { name: true, slug: true } },
            variants: { orderBy: { price: "asc" }, include: { inventory: true } },
            reviews: { where: { status: "APPROVED" }, select: { rating: true } },
            content: { select: { keyBenefits: true } },
          },
        },
      },
    });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Used by product cards/detail pages to show the filled-heart state
 * without the client needing to fetch and diff the entire wishlist. */
export async function isProductWishlisted(productId: string) {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return { success: true as const, data: { wishlisted: false } };

    const entry = await prisma.wishlist.findUnique({ where: { customerId_productId: { customerId: customer.id, productId } } });
    return { success: true as const, data: { wishlisted: !!entry } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
