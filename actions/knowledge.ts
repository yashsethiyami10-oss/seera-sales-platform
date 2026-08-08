"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createKnowledgeItemSchema,
  createKnowledgeVersionSchema,
  updateKnowledgeItemMetaSchema,
  knowledgeVersionTransitionSchema,
  knowledgeItemQuerySchema,
  publicKnowledgeQuerySchema,
  KNOWLEDGE_VERSION_ALLOWED_TRANSITIONS,
} from "@/lib/validations/knowledge";
import { paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

/**
 * MUV AI — Knowledge Foundation actions (Module 1 of the MUV Intelligence
 * Platform). Every exported function here independently enforces its own
 * RBAC — per this codebase's established rule (see CLAUDE.md), a caller
 * inside this same file does not inherit another function's auth check.
 *
 * Three deliberately separate retrieval functions instead of one
 * parameterized "get knowledge" call: each hardcodes its own layer boundary
 * server-side rather than accepting a caller-supplied layer to filter by —
 * a client can request loosely, never broadly. This is what makes the
 * Layer A/B/C model a real enforcement boundary instead of a label:
 *   - getPublicKnowledge      → PUBLIC only, no auth (customer/website-safe)
 *   - getReasoningKnowledge   → PUBLIC + INTERNAL, staff-gated for now (the
 *                               future AI Engine module is the intended
 *                               caller; kept staff-only until that module
 *                               exists rather than left open with no guard)
 *   - listKnowledgeItems / getKnowledgeItem → staff-gated, all layers
 *     including CONFIDENTIAL, since staff must be able to author/manage it
 *
 * No function returns CONFIDENTIAL-layer content outside the admin
 * management path — per the frozen architecture, Confidential is "used
 * only when explicitly authorized in future internal systems," and no such
 * system exists yet (see the audit's Founder Decision #4). Building that
 * authorization path is explicitly out of scope for this module.
 */

async function nextVersionNumber(tx: Prisma.TransactionClient, itemId: string) {
  const latest = await tx.knowledgeVersion.findFirst({ where: { itemId }, orderBy: { versionNumber: "desc" } });
  return (latest?.versionNumber ?? 0) + 1;
}

export async function createKnowledgeItem(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createKnowledgeItemSchema.parse(input);

    // Only an admin may originate CONFIDENTIAL-layer content — same
    // "business-sensitive action" tier as refunds/role changes in
    // lib/rbac.ts's own documented split between requireStaff/requireAdmin.
    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can create Confidential-layer knowledge", 403, "FORBIDDEN");
    }

    const existing = await prisma.knowledgeItem.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictError(`A knowledge item with slug "${data.slug}" already exists`);

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.knowledgeItem.create({
        data: {
          slug: data.slug,
          title: data.title,
          fileType: data.fileType,
          layer: data.layer,
          productId: data.productId,
        },
      });
      await tx.knowledgeVersion.create({
        data: {
          itemId: created.id,
          versionNumber: 1,
          content: data.content,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
      return created;
    });

    revalidatePath("/admin/ai/knowledge");
    return { success: true as const, data: { id: item.id, slug: item.slug } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Creates a new DRAFT version for an existing item. This is the only way
 * to change a knowledge item's content — there is no "edit version"
 * function, by design (see the schema comment on KnowledgeVersion).
 */
export async function createKnowledgeVersion(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createKnowledgeVersionSchema.parse(input);

    const item = await prisma.knowledgeItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new NotFoundError("Knowledge item");
    if (item.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can add a version to Confidential-layer knowledge", 403, "FORBIDDEN");
    }

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.itemId);
      return tx.knowledgeVersion.create({
        data: {
          itemId: data.itemId,
          versionNumber,
          content: data.content,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
    });

    revalidatePath(`/admin/ai/knowledge/${data.itemId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Publishing (and un-publishing, i.e. archiving a live version) is
 * admin-only — the same "business-sensitive" tier as createKnowledgeItem's
 * Confidential check above, since this is what actually flips what a
 * customer or the future AI Engine can retrieve. Discarding an unpublished
 * DRAFT (DRAFT -> ARCHIVED) stays staff-level since nothing live is
 * affected.
 *
 * Publishing a new version does not delete or edit the previously-
 * published version's row — it stays exactly as it was, now simply no
 * longer the highest-versionNumber row with status=PUBLISHED, which is how
 * "current version" is derived everywhere in this file. The prior
 * PUBLISHED version is separately archived by this same call so at most
 * one version per item is ever PUBLISHED at a time — its content remains
 * permanently queryable as version history, per "never overwrite
 * published knowledge."
 */
export async function updateKnowledgeVersionStatus(input: unknown) {
  try {
    const user = await requireStaff();
    const data = knowledgeVersionTransitionSchema.parse(input);

    const version = await prisma.knowledgeVersion.findUnique({ where: { id: data.versionId }, include: { item: true } });
    if (!version) throw new NotFoundError("Knowledge version");

    const allowed = KNOWLEDGE_VERSION_ALLOWED_TRANSITIONS[version.status];
    if (!allowed.includes(data.status)) {
      throw new AppError(`Can't move a knowledge version from ${version.status} to ${data.status}`, 400, "INVALID_TRANSITION");
    }

    const touchesLiveState = data.status === "PUBLISHED" || version.status === "PUBLISHED";
    if (touchesLiveState && user.role !== "ADMIN") {
      throw new AppError("Only an admin can publish or unpublish knowledge", 403, "FORBIDDEN");
    }
    if (version.item.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can change Confidential-layer knowledge", 403, "FORBIDDEN");
    }

    await prisma.$transaction(async (tx) => {
      if (data.status === "PUBLISHED") {
        const currentlyPublished = await tx.knowledgeVersion.findFirst({
          where: { itemId: version.itemId, status: "PUBLISHED" },
        });
        if (currentlyPublished) {
          await tx.knowledgeVersion.update({ where: { id: currentlyPublished.id }, data: { status: "ARCHIVED" } });
        }
        await tx.knowledgeVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      } else {
        await tx.knowledgeVersion.update({ where: { id: version.id }, data: { status: data.status } });
      }
    });

    revalidatePath(`/admin/ai/knowledge/${version.itemId}`);
    return { success: true as const, data: { status: data.status } };
  } catch (err) {
    logger.error("knowledge:update-version-status:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

/** Classification metadata only — title/layer/product association. Content
 * is never editable here; see createKnowledgeVersion. */
export async function updateKnowledgeItemMeta(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateKnowledgeItemMetaSchema.parse(input);

    const item = await prisma.knowledgeItem.findUnique({ where: { id: data.id } });
    if (!item) throw new NotFoundError("Knowledge item");

    // Re-classifying a permission layer (in either direction, and
    // especially anything touching CONFIDENTIAL) is a security-boundary
    // decision, not routine editing — admin-only, same tier as publishing.
    const changesLayer = data.layer !== undefined && data.layer !== item.layer;
    if (changesLayer && user.role !== "ADMIN") {
      throw new AppError("Only an admin can change a knowledge item's permission layer", 403, "FORBIDDEN");
    }
    if ((item.layer === "CONFIDENTIAL" || data.layer === "CONFIDENTIAL") && user.role !== "ADMIN") {
      throw new AppError("Only an admin can edit Confidential-layer knowledge", 403, "FORBIDDEN");
    }

    await prisma.knowledgeItem.update({
      where: { id: data.id },
      data: { title: data.title, layer: data.layer, productId: data.productId },
    });

    revalidatePath(`/admin/ai/knowledge/${data.id}`);
    revalidatePath("/admin/ai/knowledge");
    return { success: true as const, data: { id: data.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listKnowledgeItems(input: unknown) {
  try {
    await requireStaff();
    const query = knowledgeItemQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where: Prisma.KnowledgeItemWhereInput = {
      ...(query.fileType ? { fileType: query.fileType } : {}),
      ...(query.layer ? { layer: query.layer } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          product: { select: { name: true, slug: true } },
        },
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Full detail including every version — the version list *is* this
 * item's audit history (see the schema comment), so nothing is filtered
 * out here regardless of status. */
export async function getKnowledgeItem(id: string) {
  try {
    await requireStaff();
    const item = await prisma.knowledgeItem.findUnique({
      where: { id },
      include: {
        product: { select: { name: true, slug: true } },
        versions: { orderBy: { versionNumber: "desc" }, include: { author: { select: { name: true, email: true } } } },
      },
    });
    if (!item) throw new NotFoundError("Knowledge item");
    return { success: true as const, data: item };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Customer/website-safe retrieval — no auth required, and none of the
 * fields above (layer, status) are accepted from the caller. Hardcoded to
 * PUBLIC + PUBLISHED so this function's own signature makes it impossible
 * to accidentally widen later without editing this file directly.
 */
export async function getPublicKnowledge(input: unknown) {
  try {
    const query = publicKnowledgeQuerySchema.parse(input);

    const items = await prisma.knowledgeItem.findMany({
      where: {
        layer: "PUBLIC",
        ...(query.fileType ? { fileType: query.fileType } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        versions: { some: { status: "PUBLISHED" } },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        fileType: true,
        productId: true,
        versions: { where: { status: "PUBLISHED" }, take: 1, select: { content: true, publishedAt: true } },
      },
    });

    return {
      success: true as const,
      data: items.map((i) => ({
        id: i.id,
        slug: i.slug,
        title: i.title,
        fileType: i.fileType,
        productId: i.productId,
        content: i.versions[0]?.content ?? "",
        publishedAt: i.versions[0]?.publishedAt ?? null,
      })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Reasoning-only retrieval (Layer A + B) — per the frozen architecture,
 * Internal knowledge is "used only for reasoning, never directly exposed"
 * to a customer. Staff-gated for now: no AI Engine module exists yet to be
 * the legitimate caller, and an unguarded endpoint would defeat the "never
 * directly exposed" guarantee immediately. A future AI Engine module can
 * call this from trusted server-side code, or a dedicated internal-only
 * call path can be added then — deliberately not solved here.
 */
export async function getReasoningKnowledge(input: unknown) {
  try {
    await requireStaff();
    const query = publicKnowledgeQuerySchema.parse(input);

    const items = await prisma.knowledgeItem.findMany({
      where: {
        layer: { in: ["PUBLIC", "INTERNAL"] },
        ...(query.fileType ? { fileType: query.fileType } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        versions: { some: { status: "PUBLISHED" } },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        fileType: true,
        layer: true,
        productId: true,
        versions: { where: { status: "PUBLISHED" }, take: 1, select: { content: true, publishedAt: true } },
      },
    });

    return {
      success: true as const,
      data: items.map((i) => ({
        id: i.id,
        slug: i.slug,
        title: i.title,
        fileType: i.fileType,
        layer: i.layer,
        productId: i.productId,
        content: i.versions[0]?.content ?? "",
        publishedAt: i.versions[0]?.publishedAt ?? null,
      })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
