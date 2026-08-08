"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createProductIntelligenceSchema,
  updateProductIntelligenceSchema,
  updateProductIntelligenceLayerSchema,
  productIntelligenceStatusTransitionSchema,
  duplicateProductIntelligenceDraftSchema,
  productIntelligenceQuerySchema,
  PRODUCT_INTELLIGENCE_ALLOWED_TRANSITIONS,
} from "@/lib/validations/product-intelligence";
import { paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * MUV AI — Product Intelligence Foundation (PIF Engine, Module 2). Every
 * exported function independently enforces its own RBAC, per this
 * project's established rule — none of them assume a caller elsewhere in
 * this file already checked.
 *
 * Deliberately no customer/AI-facing retrieval function exists in this
 * file — every action here is requireStaff()-gated. This module's own
 * scope explicitly excludes "AI retrieval"; a future retrieval module
 * builds the layer-respecting read path (mirroring
 * actions/knowledge.ts's getPublicKnowledge/getReasoningKnowledge split),
 * not this one.
 */

async function nextVersionNumber(tx: Prisma.TransactionClient, productIntelligenceId: string) {
  const latest = await tx.productIntelligenceVersion.findFirst({
    where: { productIntelligenceId },
    orderBy: { versionNumber: "desc" },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/** Creates the ProductIntelligence item and its v1 DRAFT version together —
 * one PIF per product (enforced by the schema's `@unique` on productId),
 * so this is a one-time call per product, not repeatable. */
export async function createProductIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createProductIntelligenceSchema.parse(input);

    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can create Confidential-layer Product Intelligence", 403, "FORBIDDEN");
    }

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new NotFoundError("Product");

    const existing = await prisma.productIntelligence.findUnique({ where: { productId: data.productId } });
    if (existing) throw new ConflictError(`Product Intelligence already exists for "${product.name}" — add a new version instead of creating a second PIF`);

    const pi = await prisma.$transaction(async (tx) => {
      const created = await tx.productIntelligence.create({
        data: { productId: data.productId, layer: data.layer },
      });
      await tx.productIntelligenceVersion.create({
        data: {
          productIntelligenceId: created.id,
          versionNumber: 1,
          sections: data.sections as Prisma.InputJsonValue,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
      return created;
    });

    revalidatePath("/admin/ai/product-intelligence");
    return { success: true as const, data: { id: pi.id, productId: pi.productId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Edits a version's sections in place — only while that version is DRAFT
 * or REVIEW. A PUBLISHED or ARCHIVED version is never editable here, by
 * design: use duplicateProductIntelligenceDraft to create a new version to
 * correct one instead. This is the enforcement point for "never overwrite
 * published knowledge," not a database constraint.
 */
export async function updateProductIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateProductIntelligenceSchema.parse(input);

    const version = await prisma.productIntelligenceVersion.findUnique({
      where: { id: data.versionId },
      include: { productIntelligence: true },
    });
    if (!version) throw new NotFoundError("Product Intelligence version");

    if (version.status !== "DRAFT" && version.status !== "REVIEW") {
      throw new AppError(
        `Can't edit a ${version.status.toLowerCase()} version — duplicate it as a new draft instead`,
        400,
        "VERSION_NOT_EDITABLE"
      );
    }
    if (version.productIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can edit Confidential-layer Product Intelligence", 403, "FORBIDDEN");
    }

    await prisma.productIntelligenceVersion.update({
      where: { id: data.versionId },
      data: { sections: data.sections as Prisma.InputJsonValue, changeNote: data.changeNote },
    });

    revalidatePath(`/admin/ai/product-intelligence/${version.productIntelligenceId}`);
    return { success: true as const, data: { id: data.versionId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Handles every status transition (submit for review, send back to draft,
 * publish, archive) through one call, gated by
 * PRODUCT_INTELLIGENCE_ALLOWED_TRANSITIONS. Publishing (and archiving an
 * already-PUBLISHED version, i.e. unpublishing it) is admin-only, same
 * "business-sensitive action" tier as Module 1's publish gating — DRAFT/
 * REVIEW-only transitions (submit for review, send back, discard a draft)
 * stay staff-level since nothing live is affected.
 */
export async function updateProductIntelligenceStatus(input: unknown) {
  try {
    const user = await requireStaff();
    const data = productIntelligenceStatusTransitionSchema.parse(input);

    const version = await prisma.productIntelligenceVersion.findUnique({
      where: { id: data.versionId },
      include: { productIntelligence: true },
    });
    if (!version) throw new NotFoundError("Product Intelligence version");

    const allowed = PRODUCT_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status];
    if (!allowed.includes(data.status)) {
      throw new AppError(`Can't move a Product Intelligence version from ${version.status} to ${data.status}`, 400, "INVALID_TRANSITION");
    }

    const touchesLiveState = data.status === "PUBLISHED" || version.status === "PUBLISHED";
    if (touchesLiveState && user.role !== "ADMIN") {
      throw new AppError("Only an admin can publish or unpublish Product Intelligence", 403, "FORBIDDEN");
    }
    if (version.productIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can change Confidential-layer Product Intelligence", 403, "FORBIDDEN");
    }

    await prisma.$transaction(async (tx) => {
      if (data.status === "PUBLISHED") {
        const currentlyPublished = await tx.productIntelligenceVersion.findFirst({
          where: { productIntelligenceId: version.productIntelligenceId, status: "PUBLISHED" },
        });
        if (currentlyPublished) {
          await tx.productIntelligenceVersion.update({ where: { id: currentlyPublished.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
        }
        await tx.productIntelligenceVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      } else if (data.status === "REVIEW") {
        await tx.productIntelligenceVersion.update({ where: { id: version.id }, data: { status: "REVIEW", submittedForReviewAt: new Date() } });
      } else if (data.status === "ARCHIVED") {
        await tx.productIntelligenceVersion.update({ where: { id: version.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      } else {
        await tx.productIntelligenceVersion.update({ where: { id: version.id }, data: { status: data.status } });
      }
    });

    revalidatePath(`/admin/ai/product-intelligence/${version.productIntelligenceId}`);
    return { success: true as const, data: { status: data.status } };
  } catch (err) {
    logger.error("product-intelligence:update-status:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

/** Re-classifying the permission layer is always admin-only — a security-
 * boundary decision, not routine editing, same tier as Module 1's layer
 * changes. Unlike Module 1's KnowledgeItem, there's no separate "title"
 * metadata to bundle a lower-privilege path with — layer is the only
 * mutable item-level field on ProductIntelligence. */
export async function updateProductIntelligenceLayer(input: unknown) {
  try {
    await requireAdmin();
    const data = updateProductIntelligenceLayerSchema.parse(input);

    const pi = await prisma.productIntelligence.findUnique({ where: { id: data.productIntelligenceId } });
    if (!pi) throw new NotFoundError("Product Intelligence");

    await prisma.productIntelligence.update({ where: { id: data.productIntelligenceId }, data: { layer: data.layer } });

    revalidatePath(`/admin/ai/product-intelligence/${data.productIntelligenceId}`);
    return { success: true as const, data: { id: data.productIntelligenceId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * "Duplicate Draft" and "Restore" from the module spec, unified: creates a
 * new DRAFT version by copying another version's `sections` — the current
 * latest version if `sourceVersionId` is omitted, or a specific (often
 * ARCHIVED) historical version if provided. Never mutates the source row —
 * restoring old content is always additive, never a reopen of a
 * once-published row.
 */
export async function duplicateProductIntelligenceDraft(input: unknown) {
  try {
    const user = await requireStaff();
    const data = duplicateProductIntelligenceDraftSchema.parse(input);

    const pi = await prisma.productIntelligence.findUnique({ where: { id: data.productIntelligenceId } });
    if (!pi) throw new NotFoundError("Product Intelligence");
    if (pi.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can duplicate a Confidential-layer version", 403, "FORBIDDEN");
    }

    const source = data.sourceVersionId
      ? await prisma.productIntelligenceVersion.findUnique({ where: { id: data.sourceVersionId } })
      : await prisma.productIntelligenceVersion.findFirst({ where: { productIntelligenceId: data.productIntelligenceId }, orderBy: { versionNumber: "desc" } });
    if (!source || source.productIntelligenceId !== data.productIntelligenceId) throw new NotFoundError("Source version");

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.productIntelligenceId);
      return tx.productIntelligenceVersion.create({
        data: {
          productIntelligenceId: data.productIntelligenceId,
          versionNumber,
          sections: source.sections as Prisma.InputJsonValue,
          changeNote: data.changeNote ?? `Duplicated from version ${source.versionNumber}`,
          authorId: user.id,
        },
      });
    });

    revalidatePath(`/admin/ai/product-intelligence/${data.productIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Full detail: the item, its product, and every version (the version list
 * is this item's audit history, same idiom as Module 1). */
export async function getProductIntelligence(id: string) {
  try {
    await requireStaff();
    const pi = await prisma.productIntelligence.findUnique({
      where: { id },
      include: {
        product: { select: { name: true, slug: true } },
        versions: { orderBy: { versionNumber: "desc" }, include: { author: { select: { name: true, email: true } } } },
      },
    });
    if (!pi) throw new NotFoundError("Product Intelligence");
    return { success: true as const, data: pi };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listProductIntelligence(input: unknown) {
  try {
    await requireStaff();
    const query = productIntelligenceQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where: Prisma.ProductIntelligenceWhereInput = query.layer ? { layer: query.layer } : {};

    const [items, total] = await Promise.all([
      prisma.productIntelligence.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          product: { select: { name: true, slug: true } },
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
      }),
      prisma.productIntelligence.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** The ordered version list itself, without the rest of getProductIntelligence's
 * payload — for a dedicated "history" view. */
export async function getProductIntelligenceVersionHistory(productIntelligenceId: string) {
  try {
    await requireStaff();
    const pi = await prisma.productIntelligence.findUnique({ where: { id: productIntelligenceId } });
    if (!pi) throw new NotFoundError("Product Intelligence");

    const versions = await prisma.productIntelligenceVersion.findMany({
      where: { productIntelligenceId },
      orderBy: { versionNumber: "desc" },
      include: { author: { select: { name: true, email: true } } },
    });

    return { success: true as const, data: versions };
  } catch (err) {
    return toErrorResponse(err);
  }
}
