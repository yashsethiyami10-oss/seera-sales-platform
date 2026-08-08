"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createProductVariantIntelligenceSchema, updateProductVariantIntelligenceSchema, productVariantIntelligenceStatusTransitionSchema,
  KNOWLEDGE_MODELING_ALLOWED_TRANSITIONS,
} from "@/lib/validations/knowledge-modeling";
import type { Prisma } from "@prisma/client";

/**
 * MUV Intelligence Factory V4 §2 — Product Variant Intelligence. Same
 * conventions as actions/category-intelligence.ts and Module 2 itself.
 * Sparse by design — most variants never get a row here at all; one only
 * exists where a genuine override is needed.
 */

export async function createProductVariantIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createProductVariantIntelligenceSchema.parse(input);
    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") throw new AppError("Only an admin can create Confidential-layer Variant Intelligence", 403, "FORBIDDEN");

    const variant = await prisma.productVariant.findUnique({ where: { id: data.variantId } });
    if (!variant) throw new NotFoundError("Product variant");
    const existing = await prisma.productVariantIntelligence.findUnique({ where: { variantId: data.variantId } });
    if (existing) throw new ConflictError(`Variant Intelligence already exists for this variant (${variant.sku}) — add a new version instead`);

    const vi = await prisma.$transaction(async (tx) => {
      const created = await tx.productVariantIntelligence.create({ data: { variantId: data.variantId, layer: data.layer } });
      await tx.productVariantIntelligenceVersion.create({
        data: { productVariantIntelligenceId: created.id, versionNumber: 1, sections: data.sections as Prisma.InputJsonValue, changeNote: data.changeNote, authorId: user.id },
      });
      return created;
    });

    revalidatePath("/admin/ai/variant-intelligence");
    return { success: true as const, data: { id: vi.id, variantId: vi.variantId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateProductVariantIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateProductVariantIntelligenceSchema.parse(input);
    const version = await prisma.productVariantIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { productVariantIntelligence: true } });
    if (!version) throw new NotFoundError("Variant Intelligence version");
    if (version.status !== "DRAFT" && version.status !== "REVIEW") throw new AppError(`Can't edit a ${version.status.toLowerCase()} version — create a new version instead`, 400, "VERSION_NOT_EDITABLE");
    if (version.productVariantIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") throw new AppError("Only an admin can edit Confidential-layer Variant Intelligence", 403, "FORBIDDEN");

    await prisma.productVariantIntelligenceVersion.update({ where: { id: data.versionId }, data: { sections: data.sections as Prisma.InputJsonValue, changeNote: data.changeNote } });
    revalidatePath(`/admin/ai/variant-intelligence/${version.productVariantIntelligenceId}`);
    return { success: true as const, data: { id: data.versionId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateProductVariantIntelligenceStatus(input: unknown) {
  try {
    const user = await requireStaff();
    const data = productVariantIntelligenceStatusTransitionSchema.parse(input);
    const version = await prisma.productVariantIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { productVariantIntelligence: true } });
    if (!version) throw new NotFoundError("Variant Intelligence version");

    const allowed = KNOWLEDGE_MODELING_ALLOWED_TRANSITIONS[version.status];
    if (!allowed.includes(data.status)) throw new AppError(`Cannot move from ${version.status} to ${data.status}`, 409, "INVALID_TRANSITION");

    if (data.status === "PUBLISHED" || (version.status === "PUBLISHED" && data.status === "ARCHIVED")) {
      await requireAdmin();
    }

    if (data.status === "PUBLISHED") {
      const existingPublished = await prisma.productVariantIntelligenceVersion.findFirst({ where: { productVariantIntelligenceId: version.productVariantIntelligenceId, status: "PUBLISHED" } });
      if (existingPublished) throw new ConflictError("Another version is already PUBLISHED for this variant — archive it first (the database also enforces this via a partial unique index)");
    }

    const now = new Date();
    const updated = await prisma.productVariantIntelligenceVersion.update({
      where: { id: data.versionId },
      data: {
        status: data.status,
        submittedForReviewAt: data.status === "REVIEW" ? now : version.submittedForReviewAt,
        publishedAt: data.status === "PUBLISHED" ? now : version.publishedAt,
        archivedAt: data.status === "ARCHIVED" ? now : version.archivedAt,
      },
    });
    revalidatePath(`/admin/ai/variant-intelligence/${version.productVariantIntelligenceId}`);
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getProductVariantIntelligence(id: string) {
  try {
    await requireStaff();
    const vi = await prisma.productVariantIntelligence.findUnique({ where: { id }, include: { variant: true, versions: { orderBy: { versionNumber: "desc" } } } });
    if (!vi) throw new NotFoundError("Variant Intelligence");
    return { success: true as const, data: vi };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listProductVariantIntelligence() {
  try {
    await requireStaff();
    const items = await prisma.productVariantIntelligence.findMany({ include: { variant: true, versions: { where: { status: "PUBLISHED" }, take: 1 } } });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
