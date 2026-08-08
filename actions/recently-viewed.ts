"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/rbac";
import { toErrorResponse, NotFoundError } from "@/lib/errors";

const MAX_ITEMS = 8;

/** Trims a customer's history back down to MAX_ITEMS after an upsert, oldest
 * `viewedAt` first — same cap the guest localStorage version already
 * enforces (components/storefront/recently-viewed.tsx), kept in sync here
 * rather than duplicated with a different number. */
async function trimHistory(customerId: string) {
  const excess = await prisma.recentlyViewedItem.findMany({
    where: { customerId },
    orderBy: { viewedAt: "desc" },
    skip: MAX_ITEMS,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.recentlyViewedItem.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }
}

/** Fire-and-forget from the client — silently fails for guests (no Customer
 * row) rather than surfacing an error, since the localStorage widget is the
 * real, working display for them regardless of whether this DB write
 * succeeds. */
export async function recordProductView(productId: string) {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return { success: true as const, data: null };

    await prisma.recentlyViewedItem.upsert({
      where: { customerId_productId: { customerId: customer.id, productId } },
      update: { viewedAt: new Date() },
      create: { customerId: customer.id, productId },
    });
    await trimHistory(customer.id);

    return { success: true as const, data: null };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getRecentlyViewed(limit = MAX_ITEMS) {
  try {
    const user = await requireCustomer();
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) return { success: true as const, data: [] };

    const items = await prisma.recentlyViewedItem.findMany({
      where: { customerId: customer.id },
      orderBy: { viewedAt: "desc" },
      take: limit,
      include: {
        product: {
          include: {
            category: true,
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

const mergeSchema = z.object({ slugs: z.array(z.string()).max(20) });

/** Called once, client-side, right after a guest with localStorage history
 * logs in — resolves their locally-tracked slugs to real products and
 * upserts them into the DB history, so "recently viewed" survives the
 * guest-to-logged-in transition instead of resetting to empty. */
export async function mergeGuestRecentlyViewed(input: unknown) {
  try {
    const user = await requireCustomer();
    const data = mergeSchema.parse(input);
    const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
    if (!customer) throw new NotFoundError("Customer profile");

    if (data.slugs.length === 0) return { success: true as const, data: null };

    const products = await prisma.product.findMany({ where: { slug: { in: data.slugs } }, select: { id: true, slug: true } });
    const bySlug = new Map(products.map((p) => [p.slug, p.id]));

    // Oldest-first so the final upsert order leaves the guest's most-recent
    // view as the most-recent `viewedAt` in the merged DB history too.
    for (const slug of [...data.slugs].reverse()) {
      const productId = bySlug.get(slug);
      if (!productId) continue;
      await prisma.recentlyViewedItem.upsert({
        where: { customerId_productId: { customerId: customer.id, productId } },
        update: { viewedAt: new Date() },
        create: { customerId: customer.id, productId },
      });
    }
    await trimHistory(customer.id);

    return { success: true as const, data: null };
  } catch (err) {
    return toErrorResponse(err);
  }
}
