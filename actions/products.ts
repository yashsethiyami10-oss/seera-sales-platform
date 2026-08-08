"use server";

import { revalidatePath } from "next/cache";
import { invalidate, CACHE_TAGS } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, NotFoundError, AppError } from "@/lib/errors";
import { createProductSchema, updateProductSchema, updateVariantSchema, addVariantSchema, validateActiveProductRequirements } from "@/lib/validations/product";
import { logger } from "@/lib/logger";

// Server Actions return a discriminated `{success, data}` / `{success, error}`
// shape rather than throwing across the client/server boundary — this lets
// the calling component render inline field errors (from Zod) without a
// try/catch around every call site, and without a full page-level error
// boundary firing for an expected validation failure.

type ActionResult<T> = { success: true; data: T } | { success: false; error: { message: string; code: string; fieldErrors?: Record<string, string[]> } };

export async function createProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();
    const data = createProductSchema.parse(input);

    // Approved Requirements §4 — a new product being created directly as
    // ACTIVE must satisfy the same mandatory-field rule an existing DRAFT
    // does when it's flipped to ACTIVE. A brand-new DRAFT skips this
    // entirely, same as before.
    if (data.status === "ACTIVE") {
      const fieldErrors = validateActiveProductRequirements({
        name: data.name,
        categoryId: data.categoryId,
        images: data.images,
        shortDescription: data.content?.shortDescription,
        fullDescription: data.content?.longDescription,
        howToUse: data.content?.howToUse,
        safetyInformation: data.content?.safetyInformation,
        seoTitle: data.content?.seoTitle,
        seoDescription: data.content?.seoDescription,
        variants: data.variants ?? [],
      });
      if (Object.keys(fieldErrors).length > 0) {
        return { success: false, error: { message: "Fill in the fields required to activate this product, or save it as Draft instead.", code: "ACTIVE_REQUIREMENTS_NOT_MET", fieldErrors } };
      }
    }

    // Product + variants + their inventory rows are created atomically:
    // a product must never exist with zero sellable variants, and a variant
    // must never exist without a corresponding inventory row to track stock.
    // The Production Customer Content Layer row (ProductContent — the ONLY
    // table the customer-facing Product Detail Page and generateMetadata()
    // read customer-facing copy from) is created in the same transaction
    // whenever `content` is provided, so a new product's FAQ/benefits/
    // SEO copy is live on the storefront immediately, not just in the
    // legacy Product columns admin tooling still also writes for backward
    // compatibility.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          categoryId: data.categoryId!,
          brand: data.brand,
          shortDescription: data.shortDescription ?? "",
          fullDescription: data.fullDescription,
          weight: data.weight,
          fragranceNotes: data.fragranceNotes,
          ingredients: data.ingredients,
          directions: data.directions,
          benefits: data.benefits,
          safety: data.safety,
          hsnCode: data.hsnCode,
          gstRate: data.gstRate,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          images: data.images ?? [],
          videoUrls: data.videoUrls ?? [],
          isFeatured: data.isFeatured,
          status: data.status,
          variants: {
            create: data.variants!.map((v) => ({
              size: v.size,
              price: v.price,
              mrp: v.mrp,
              sku: v.sku,
            })),
          },
        },
        include: { variants: true, category: true },
      });

      await tx.inventory.createMany({
        data: created.variants.map((v) => {
          // Matched by SKU rather than array index — Prisma's nested
          // `create` doesn't contractually guarantee the returned order
          // mirrors the input order, so pairing by index would be fragile.
          const input = data.variants!.find((iv) => iv.sku === v.sku);
          return { variantId: v.id, quantity: input?.initialStock ?? 0, lowStockThreshold: input?.lowStockThreshold ?? 10 };
        }),
      });

      if (data.content) {
        await tx.productContent.create({ data: { productId: created.id, ...data.content } });
      }

      return created;
    });

    const response = { success: true as const, data: { id: product.id } };

    invalidate(CACHE_TAGS.products);
    revalidatePath("/admin/products");
    revalidatePath("/shop"); // storefront catalog must reflect the new product
    revalidatePath(`/collections/${product.category.slug}`);
    return response;
  } catch (err) {
    logger.error("product:create:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

export async function updateProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();
    const data = updateProductSchema.parse(input);
    // `variants` here is used ONLY to evaluate the ACTIVE-requirements check
    // below (the admin form's variant rows aren't necessarily saved yet at
    // the moment this call runs — see components/admin/product-form-modal.tsx,
    // which calls updateProductVariant/addProductVariant separately right
    // after this resolves). Variant rows themselves are never written from
    // here — that write path is intentionally unchanged.
    const { id, variants, content, ...rest } = data;

    const existing = await prisma.product.findUnique({ where: { id }, include: { content: true, category: true, variants: true } });
    if (!existing) throw new NotFoundError("Product");

    const effectiveStatus = data.status ?? existing.status;
    if (effectiveStatus === "ACTIVE") {
      const effectiveVariants = variants && variants.length > 0 ? variants : existing.variants.map((v) => ({ size: v.size, sku: v.sku, price: v.price, mrp: v.mrp }));
      const fieldErrors = validateActiveProductRequirements({
        name: data.name ?? existing.name,
        categoryId: data.categoryId ?? existing.categoryId,
        images: data.images ?? existing.images,
        shortDescription: content?.shortDescription ?? existing.content?.shortDescription,
        fullDescription: content?.longDescription ?? existing.content?.longDescription,
        howToUse: content?.howToUse ?? existing.content?.howToUse,
        safetyInformation: content?.safetyInformation ?? existing.content?.safetyInformation,
        seoTitle: content?.seoTitle ?? existing.content?.seoTitle,
        seoDescription: content?.seoDescription ?? existing.content?.seoDescription,
        variants: effectiveVariants,
      });
      if (Object.keys(fieldErrors).length > 0) {
        return { success: false, error: { message: "Fill in the fields required to activate this product, or save it as Draft instead.", code: "ACTIVE_REQUIREMENTS_NOT_MET", fieldErrors } };
      }
    }

    // `brand`/`fullDescription` previously were destructured out of `rest`
    // here and never merged back into the update payload — any edit to
    // either field was silently dropped. Only `categoryId` genuinely needs
    // special handling (a relation `connect`, not a scalar column), so
    // everything else — including brand/fullDescription and the new
    // metaTitle/metaDescription fields — now flows through `...productData`.
    const { categoryId, ...productData } = rest;
    await prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(categoryId
          ? {
              category: {
                connect: { id: categoryId },
              },
            }
          : {}),
      },
    });

    // Production Customer Content Layer — the ONLY table the customer-facing
    // Product Detail Page and generateMetadata() read customer-facing copy
    // from. Omitted `content` entirely (e.g. a pure image/variant edit)
    // leaves the existing content record untouched, same as every other
    // partial-update field here.
    if (content) {
      await prisma.productContent.upsert({
        where: { productId: id },
        update: content,
        create: { productId: id, ...content },
      });
    }

    const response = { success: true as const, data: { id } };

    invalidate(CACHE_TAGS.products, CACHE_TAGS.product(existing.slug));
    revalidatePath("/admin/products");
    revalidatePath(`/products/${existing.slug}`);
    revalidatePath("/shop");
    revalidatePath(`/collections/${existing.category.slug}`);
    if (categoryId && categoryId !== existing.categoryId) {
      const newCategory = await prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true } });
      if (newCategory) revalidatePath(`/collections/${newCategory.slug}`);
    }
    return response;
  } catch (err) {
    logger.error("product:update:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

/**
 * Edits an existing variant's size/price/MRP/SKU. Stock is deliberately
 * NOT editable here — that goes through actions/inventory.ts's
 * setStockQuantity, which logs a StockHistory row; changing quantity
 * silently from this form would break that audit trail.
 */
export async function updateProductVariant(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();
    const data = updateVariantSchema.parse(input);
    const { variantId, ...rest } = data;

    const existing = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
    if (!existing) throw new NotFoundError("Product variant");

    if (rest.price != null && rest.mrp == null && rest.price > existing.mrp) {
      throw new AppError("Price cannot exceed the existing MRP — update MRP too if intentional", 400, "PRICE_EXCEEDS_MRP");
    }
    if (rest.mrp != null && rest.mrp < (rest.price ?? existing.price)) {
      throw new AppError("MRP cannot be lower than the selling price", 400, "MRP_BELOW_PRICE");
    }

    await prisma.productVariant.update({ where: { id: variantId }, data: rest });

    invalidate(CACHE_TAGS.products, CACHE_TAGS.product(existing.product.slug));
    revalidatePath("/admin/products");
    revalidatePath(`/products/${existing.product.slug}`);
    return { success: true, data: { id: variantId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Adds a new size/SKU to a product that already exists — the admin form's
 * "+ Add another size" now works in edit mode too, not just at creation. */
export async function addProductVariant(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();
    const data = addVariantSchema.parse(input);
    const { productId, initialStock, lowStockThreshold, ...variantFields } = data;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError("Product");

    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({ data: { productId, ...variantFields } });
      await tx.inventory.create({ data: { variantId: created.id, quantity: initialStock, lowStockThreshold } });
      return created;
    });

    invalidate(CACHE_TAGS.products, CACHE_TAGS.product(product.slug));
    revalidatePath("/admin/products");
    revalidatePath(`/products/${product.slug}`);
    return { success: true, data: { id: variant.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteProduct(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();

    const existing = await prisma.product.findUnique({
      where: { id },
      include: { variants: { include: { orderItems: { take: 1 } } } },
    });
    if (!existing) throw new NotFoundError("Product");

    const hasOrderHistory = existing.variants.some((v) => v.orderItems.length > 0);
    if (hasOrderHistory) {
      // Never hard-delete a product that appears in past orders — order
      // history must remain intact for invoicing/accounting. Archive instead.
      await prisma.product.update({ where: { id }, data: { status: "ARCHIVED" } });
      invalidate(CACHE_TAGS.products, CACHE_TAGS.product(existing.slug));
      revalidatePath("/admin/products");
      return { success: true, data: { id } };
    }

    await prisma.product.delete({ where: { id } }); // cascades to variants/inventory
    invalidate(CACHE_TAGS.products, CACHE_TAGS.product(existing.slug));
    revalidatePath("/admin/products");
    revalidatePath("/shop");
    return { success: true, data: { id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}