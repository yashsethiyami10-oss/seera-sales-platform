"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createCategoryIntelligenceSchema, updateCategoryIntelligenceSchema, categoryIntelligenceStatusTransitionSchema,
  KNOWLEDGE_MODELING_ALLOWED_TRANSITIONS,
} from "@/lib/validations/knowledge-modeling";
import type { Prisma } from "@prisma/client";

/**
 * MUV Intelligence Factory V4 §2 — Category Intelligence. Extends Module 2
 * (Product Intelligence Foundation)'s exact conventions to Category scope —
 * requireStaff/requireAdmin, logic directly in this actions file, no
 * organizationKey (matching every Module 1-9 table, none of which are
 * org-scoped, unlike the separate Enterprise v3 track).
 */

async function nextVersionNumber(tx: Prisma.TransactionClient, categoryIntelligenceId: string) {
  const latest = await tx.categoryIntelligenceVersion.findFirst({ where: { categoryIntelligenceId }, orderBy: { versionNumber: "desc" } });
  return (latest?.versionNumber ?? 0) + 1;
}

export async function createCategoryIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createCategoryIntelligenceSchema.parse(input);
    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") throw new AppError("Only an admin can create Confidential-layer Category Intelligence", 403, "FORBIDDEN");

    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new NotFoundError("Category");
    const existing = await prisma.categoryIntelligence.findUnique({ where: { categoryId: data.categoryId } });
    if (existing) throw new ConflictError(`Category Intelligence already exists for "${category.name}" — add a new version instead`);

    const ci = await prisma.$transaction(async (tx) => {
      const created = await tx.categoryIntelligence.create({ data: { categoryId: data.categoryId, layer: data.layer } });
      await tx.categoryIntelligenceVersion.create({
        data: { categoryIntelligenceId: created.id, versionNumber: 1, sections: data.sections as Prisma.InputJsonValue, changeNote: data.changeNote, authorId: user.id },
      });
      return created;
    });

    revalidatePath("/admin/ai/category-intelligence");
    return { success: true as const, data: { id: ci.id, categoryId: ci.categoryId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateCategoryIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateCategoryIntelligenceSchema.parse(input);
    const version = await prisma.categoryIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { categoryIntelligence: true } });
    if (!version) throw new NotFoundError("Category Intelligence version");
    if (version.status !== "DRAFT" && version.status !== "REVIEW") throw new AppError(`Can't edit a ${version.status.toLowerCase()} version — create a new version instead`, 400, "VERSION_NOT_EDITABLE");
    if (version.categoryIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") throw new AppError("Only an admin can edit Confidential-layer Category Intelligence", 403, "FORBIDDEN");

    await prisma.categoryIntelligenceVersion.update({ where: { id: data.versionId }, data: { sections: data.sections as Prisma.InputJsonValue, changeNote: data.changeNote } });
    revalidatePath(`/admin/ai/category-intelligence/${version.categoryIntelligenceId}`);
    return { success: true as const, data: { id: data.versionId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Publish (PUBLISHED) and unpublish (ARCHIVED-from-PUBLISHED) are
 * admin-only, matching Module 2's own tiering exactly. Enforces the
 * partial-unique-index invariant from Sprint 1 at the application layer
 * too, giving a clean error instead of a raw constraint violation. */
export async function updateCategoryIntelligenceStatus(input: unknown) {
  try {
    const user = await requireStaff();
    const data = categoryIntelligenceStatusTransitionSchema.parse(input);
    const version = await prisma.categoryIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { categoryIntelligence: true } });
    if (!version) throw new NotFoundError("Category Intelligence version");

    const allowed = KNOWLEDGE_MODELING_ALLOWED_TRANSITIONS[version.status];
    if (!allowed.includes(data.status)) throw new AppError(`Cannot move from ${version.status} to ${data.status}`, 409, "INVALID_TRANSITION");

    if ((data.status === "PUBLISHED" || (version.status === "PUBLISHED" && data.status === "ARCHIVED"))) {
      await requireAdmin();
    }

    if (data.status === "PUBLISHED") {
      const existingPublished = await prisma.categoryIntelligenceVersion.findFirst({ where: { categoryIntelligenceId: version.categoryIntelligenceId, status: "PUBLISHED" } });
      if (existingPublished) throw new ConflictError("Another version is already PUBLISHED for this category — archive it first (the database also enforces this via a partial unique index)");
    }

    const now = new Date();
    const updated = await prisma.categoryIntelligenceVersion.update({
      where: { id: data.versionId },
      data: {
        status: data.status,
        submittedForReviewAt: data.status === "REVIEW" ? now : version.submittedForReviewAt,
        publishedAt: data.status === "PUBLISHED" ? now : version.publishedAt,
        archivedAt: data.status === "ARCHIVED" ? now : version.archivedAt,
      },
    });
    revalidatePath(`/admin/ai/category-intelligence/${version.categoryIntelligenceId}`);
    return { success: true as const, data: updated };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getCategoryIntelligence(id: string) {
  try {
    await requireStaff();
    const ci = await prisma.categoryIntelligence.findUnique({ where: { id }, include: { category: true, versions: { orderBy: { versionNumber: "desc" } } } });
    if (!ci) throw new NotFoundError("Category Intelligence");
    return { success: true as const, data: ci };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listCategoryIntelligence() {
  try {
    await requireStaff();
    const items = await prisma.categoryIntelligence.findMany({ include: { category: true, versions: { where: { status: "PUBLISHED" }, take: 1 } } });
    return { success: true as const, data: items };
  } catch (err) {
    return toErrorResponse(err);
  }
}
