"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createCareIntelligenceSchema,
  updateCareIntelligenceSchema,
  publishCareIntelligenceSchema,
  archiveCareIntelligenceSchema,
  restoreCareIntelligenceSchema,
  duplicateCareIntelligenceSchema,
  careIntelligenceQuerySchema,
  publishedCareIntelligenceQuerySchema,
  CARE_INTELLIGENCE_ALLOWED_TRANSITIONS,
} from "@/lib/validations/care-intelligence";
import { paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { Prisma, type CareIntelligenceVersion } from "@prisma/client";

/**
 * MUV AI — Care Intelligence Foundation (CIF Engine, Module 4). Every
 * exported function independently enforces its own RBAC.
 *
 * Only 10 actions exist here, per this module's own Server Actions list —
 * no per-child-section "add" actions like Module 3's PrIF Engine.
 * createCareIntelligence/updateCareIntelligence instead take the full
 * nested content (requiredInformation[], careActions[], evidenceSources[])
 * in one payload; updateCareIntelligence replaces a DRAFT/REVIEW version's
 * child-record set wholesale on each call (delete-and-recreate inside one
 * transaction). See the schema's file-level comment on
 * CareIntelligenceVersion for the full reasoning.
 *
 * No customer/AI-facing retrieval exists here beyond
 * getPublishedCareIntelligence (Layer PUBLIC only, curated field
 * selection — care actions, communication guidance, escalation detail,
 * and evidence sources are never exposed, since they're staff/future-CQ-
 * Engine procedure documentation, not customer content).
 */

type SessionUser = { id: string; role: "ADMIN" | "STAFF" | "CUSTOMER" };

async function nextVersionNumber(tx: Prisma.TransactionClient, careIntelligenceId: string) {
  const latest = await tx.careIntelligenceVersion.findFirst({
    where: { careIntelligenceId },
    orderBy: { versionNumber: "desc" },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/** Shared by updateCareIntelligence and (indirectly, via their own item-
 * level checks) duplicate/restore — loads a version + its parent item,
 * asserting it's still DRAFT/REVIEW and that the caller is authorized for
 * the item's layer (ADMIN required for CONFIDENTIAL). */
async function loadEditableVersion(versionId: string, user: SessionUser) {
  const version = await prisma.careIntelligenceVersion.findUnique({
    where: { id: versionId },
    include: { careIntelligence: true },
  });
  if (!version) throw new NotFoundError("Care Intelligence version");
  if (version.status !== "DRAFT" && version.status !== "REVIEW") {
    throw new AppError(`Can't edit a ${version.status.toLowerCase()} version — duplicate or restore it as a new draft instead`, 400, "VERSION_NOT_EDITABLE");
  }
  if (version.careIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
    throw new AppError("Only an admin can edit Confidential-layer Care Intelligence", 403, "FORBIDDEN");
  }
  return version;
}

const versionContentInclude = {
  requiredInformation: { orderBy: { displayOrder: "asc" as const } },
  careActions: { orderBy: { stepNumber: "asc" as const } },
  evidenceSources: true,
  relatedProducts: { select: { id: true, name: true, slug: true } },
  relatedProductIntelligence: { select: { id: true, productId: true } },
  relatedProblemIntelligence: { select: { id: true, slug: true } },
  relatedKnowledgeItems: { select: { id: true, slug: true, fileType: true } },
  author: { select: { name: true, email: true } },
  reviewedBy: { select: { name: true, email: true } },
  publishedBy: { select: { name: true, email: true } },
};

/** Deep-copies a version's scalar content, child rows, and relation
 * connections into a new version — the shared mechanism behind both
 * duplicateCareIntelligence and restoreCareIntelligence. */
async function deepCopyCareVersion(tx: Prisma.TransactionClient, sourceVersionId: string, newVersionId: string) {
  const source = await tx.careIntelligenceVersion.findUniqueOrThrow({
    where: { id: sourceVersionId },
    include: {
      requiredInformation: true,
      careActions: true,
      evidenceSources: true,
      relatedProducts: { select: { id: true } },
      relatedProductIntelligence: { select: { id: true } },
      relatedProblemIntelligence: { select: { id: true } },
      relatedKnowledgeItems: { select: { id: true } },
    },
  });

  const connections: Prisma.CareIntelligenceVersionUpdateInput = {};
  if (source.relatedProducts.length) connections.relatedProducts = { connect: source.relatedProducts.map((p) => ({ id: p.id })) };
  if (source.relatedProductIntelligence.length) connections.relatedProductIntelligence = { connect: source.relatedProductIntelligence.map((p) => ({ id: p.id })) };
  if (source.relatedProblemIntelligence.length) connections.relatedProblemIntelligence = { connect: source.relatedProblemIntelligence.map((p) => ({ id: p.id })) };
  if (source.relatedKnowledgeItems.length) connections.relatedKnowledgeItems = { connect: source.relatedKnowledgeItems.map((k) => ({ id: k.id })) };
  if (Object.keys(connections).length) {
    await tx.careIntelligenceVersion.update({ where: { id: newVersionId }, data: connections });
  }

  if (source.requiredInformation.length) {
    await tx.careRequiredInformation.createMany({
      data: source.requiredInformation.map((r) => ({ versionId: newVersionId, label: r.label, description: r.description, isRequired: r.isRequired, displayOrder: r.displayOrder })),
    });
  }
  if (source.careActions.length) {
    await tx.careAction.createMany({
      data: source.careActions.map((a) => ({ versionId: newVersionId, stepNumber: a.stepNumber, description: a.description, actor: a.actor, preconditions: a.preconditions, expectedOutcome: a.expectedOutcome, failureHandling: a.failureHandling })),
    });
  }
  if (source.evidenceSources.length) {
    await tx.careEvidenceSource.createMany({
      data: source.evidenceSources.map((e) => ({ versionId: newVersionId, source: e.source, approved: e.approved, confidence: e.confidence, reviewerId: e.reviewerId, reviewDate: e.reviewDate, internalNotes: e.internalNotes })),
    });
  }

  return source;
}

/** Picks exactly the scalar (non-relation, non-audit) content fields off a
 * real CareIntelligenceVersion row, for reuse when seeding a new version in
 * duplicateCareIntelligence/restoreCareIntelligence. Typed directly off
 * Prisma's generated model type rather than a hand-rolled interface, so
 * this can't silently drift out of sync with the schema. */
function scalarVersionFields(source: CareIntelligenceVersion) {
  const {
    title, category, summary, situationDescription, situationTags, careObjectives,
    escalationRequired, escalationReason, escalationTeam, escalationPriority, escalationSla, escalationInternalNotes,
    communicationTone, thingsToAvoid, mandatoryStatements, optionalGuidance, transparencyRules,
    applicableResolutionConditions, followUpGuidance, maxWaitingPeriod, reminderInterval, closureConditions,
    applicableCustomerSegments,
  } = source;
  return {
    title, category, summary, situationDescription, situationTags, careObjectives,
    escalationRequired, escalationReason, escalationTeam, escalationPriority, escalationSla, escalationInternalNotes,
    communicationTone, thingsToAvoid, mandatoryStatements, optionalGuidance, transparencyRules,
    applicableResolutionConditions, followUpGuidance, maxWaitingPeriod, reminderInterval, closureConditions,
    applicableCustomerSegments,
  };
}

// ---------------------------------------------------------------------------

export async function createCareIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createCareIntelligenceSchema.parse(input);

    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can create Confidential-layer Care Intelligence", 403, "FORBIDDEN");
    }

    const existing = await prisma.careIntelligence.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictError(`A Care Intelligence item with slug "${data.slug}" already exists`);

    const {
      requiredInformation, careActions, evidenceSources,
      relatedProductIds, relatedProductIntelligenceIds, relatedProblemIntelligenceIds, relatedKnowledgeItemIds,
      ...scalarContent
    } = data.content;

    const ci = await prisma.$transaction(async (tx) => {
      const created = await tx.careIntelligence.create({ data: { slug: data.slug, layer: data.layer } });
      await tx.careIntelligenceVersion.create({
        data: {
          careIntelligenceId: created.id,
          versionNumber: 1,
          ...scalarContent,
          relatedProducts: relatedProductIds.length ? { connect: relatedProductIds.map((id) => ({ id })) } : undefined,
          relatedProductIntelligence: relatedProductIntelligenceIds.length ? { connect: relatedProductIntelligenceIds.map((id) => ({ id })) } : undefined,
          relatedProblemIntelligence: relatedProblemIntelligenceIds.length ? { connect: relatedProblemIntelligenceIds.map((id) => ({ id })) } : undefined,
          relatedKnowledgeItems: relatedKnowledgeItemIds.length ? { connect: relatedKnowledgeItemIds.map((id) => ({ id })) } : undefined,
          requiredInformation: requiredInformation.length ? { create: requiredInformation } : undefined,
          careActions: careActions.length ? { create: careActions } : undefined,
          evidenceSources: evidenceSources.length ? { create: evidenceSources } : undefined,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
      return created;
    });

    revalidatePath("/admin/ai/care-intelligence");
    return { success: true as const, data: { id: ci.id, slug: ci.slug } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Full-replace semantics for scalar fields present in `content`, and for
 * requiredInformation/careActions/evidenceSources specifically *only* when
 * that array key is present in the payload (an omitted array means "leave
 * these rows alone," not "delete them"). `status`, if provided, is
 * validated against CARE_INTELLIGENCE_ALLOWED_TRANSITIONS; if omitted and
 * the version is currently REVIEW, editing its content silently returns it
 * to DRAFT — reviewed content that just changed is, by definition, no
 * longer what was reviewed.
 */
export async function updateCareIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateCareIntelligenceSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    let nextStatus: string = version.status;
    if (data.status) {
      if (!CARE_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes(data.status)) {
        throw new AppError(`Can't move a Care Intelligence version from ${version.status} to ${data.status}`, 400, "INVALID_TRANSITION");
      }
      nextStatus = data.status;
    } else if (version.status === "REVIEW") {
      nextStatus = "DRAFT";
    }

    if (data.layer && data.layer !== version.careIntelligence.layer) {
      if (user.role !== "ADMIN") throw new AppError("Only an admin can change a Care Intelligence item's permission layer", 403, "FORBIDDEN");
    }

    const {
      requiredInformation, careActions, evidenceSources,
      relatedProductIds, relatedProductIntelligenceIds, relatedProblemIntelligenceIds, relatedKnowledgeItemIds,
      ...scalarContent
    } = data.content;

    await prisma.$transaction(async (tx) => {
      if (data.layer && data.layer !== version.careIntelligence.layer) {
        await tx.careIntelligence.update({ where: { id: version.careIntelligenceId }, data: { layer: data.layer } });
      }

      await tx.careIntelligenceVersion.update({
        where: { id: data.versionId },
        data: {
          ...scalarContent,
          status: nextStatus as never,
          submittedForReviewAt: nextStatus === "REVIEW" ? new Date() : undefined,
          changeNote: data.changeNote,
          ...(relatedProductIds ? { relatedProducts: { set: relatedProductIds.map((id) => ({ id })) } } : {}),
          ...(relatedProductIntelligenceIds ? { relatedProductIntelligence: { set: relatedProductIntelligenceIds.map((id) => ({ id })) } } : {}),
          ...(relatedProblemIntelligenceIds ? { relatedProblemIntelligence: { set: relatedProblemIntelligenceIds.map((id) => ({ id })) } } : {}),
          ...(relatedKnowledgeItemIds ? { relatedKnowledgeItems: { set: relatedKnowledgeItemIds.map((id) => ({ id })) } } : {}),
        },
      });

      if (requiredInformation) {
        await tx.careRequiredInformation.deleteMany({ where: { versionId: data.versionId } });
        if (requiredInformation.length) await tx.careRequiredInformation.createMany({ data: requiredInformation.map((r) => ({ ...r, versionId: data.versionId })) });
      }
      if (careActions) {
        await tx.careAction.deleteMany({ where: { versionId: data.versionId } });
        if (careActions.length) await tx.careAction.createMany({ data: careActions.map((a) => ({ ...a, versionId: data.versionId })) });
      }
      if (evidenceSources) {
        await tx.careEvidenceSource.deleteMany({ where: { versionId: data.versionId } });
        if (evidenceSources.length) await tx.careEvidenceSource.createMany({ data: evidenceSources.map((e) => ({ ...e, versionId: data.versionId })) });
      }
    });

    revalidatePath(`/admin/ai/care-intelligence/${version.careIntelligenceId}`);
    return { success: true as const, data: { id: data.versionId, status: nextStatus } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Admin-only. Atomic: archives whatever is currently PUBLISHED for the
 * same item inside the same transaction as publishing the new one — same
 * pattern, and same disclosed limitation (transaction, not a DB
 * constraint), as Modules 1–3. */
export async function publishCareIntelligence(input: unknown) {
  try {
    const user = await requireAdmin();
    const data = publishCareIntelligenceSchema.parse(input);

    const version = await prisma.careIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { careIntelligence: true } });
    if (!version) throw new NotFoundError("Care Intelligence version");
    if (!CARE_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes("PUBLISHED")) {
      throw new AppError(`Can't publish a Care Intelligence version from ${version.status} — it must be in REVIEW first`, 400, "INVALID_TRANSITION");
    }

    await prisma.$transaction(async (tx) => {
      const currentlyPublished = await tx.careIntelligenceVersion.findFirst({
        where: { careIntelligenceId: version.careIntelligenceId, status: "PUBLISHED" },
      });
      if (currentlyPublished) {
        await tx.careIntelligenceVersion.update({ where: { id: currentlyPublished.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      }
      const now = new Date();
      await tx.careIntelligenceVersion.update({
        where: { id: version.id },
        data: { status: "PUBLISHED", publishedAt: now, publishedById: user.id, reviewedById: user.id, reviewedAt: now },
      });
    });

    revalidatePath(`/admin/ai/care-intelligence/${version.careIntelligenceId}`);
    return { success: true as const, data: { status: "PUBLISHED" as const } };
  } catch (err) {
    logger.error("care-intelligence:publish:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

export async function archiveCareIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = archiveCareIntelligenceSchema.parse(input);

    const version = await prisma.careIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { careIntelligence: true } });
    if (!version) throw new NotFoundError("Care Intelligence version");
    if (!CARE_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes("ARCHIVED")) {
      throw new AppError(`Can't archive a Care Intelligence version from ${version.status}`, 400, "INVALID_TRANSITION");
    }
    if (version.status === "PUBLISHED" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can unpublish (archive) a live Care Intelligence version", 403, "FORBIDDEN");
    }
    if (version.careIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can change Confidential-layer Care Intelligence", 403, "FORBIDDEN");
    }

    await prisma.careIntelligenceVersion.update({
      where: { id: data.versionId },
      data: { status: "ARCHIVED", archivedAt: new Date(), changeNote: data.reason ?? version.changeNote },
    });

    revalidatePath(`/admin/ai/care-intelligence/${version.careIntelligenceId}`);
    return { success: true as const, data: { status: "ARCHIVED" as const } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Revives specifically ARCHIVED content as a new DRAFT — never touches
 * whatever is currently PUBLISHED. */
export async function restoreCareIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = restoreCareIntelligenceSchema.parse(input);

    const ci = await prisma.careIntelligence.findUnique({ where: { id: data.careIntelligenceId } });
    if (!ci) throw new NotFoundError("Care Intelligence");
    if (ci.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can restore a Confidential-layer version", 403, "FORBIDDEN");
    }

    const source = await prisma.careIntelligenceVersion.findUnique({ where: { id: data.archivedVersionId } });
    if (!source || source.careIntelligenceId !== data.careIntelligenceId) throw new NotFoundError("Archived version");
    if (source.status !== "ARCHIVED") {
      throw new AppError("restoreCareIntelligence can only restore an ARCHIVED version — use duplicateCareIntelligence for the current version instead", 400, "NOT_ARCHIVED");
    }

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.careIntelligenceId);
      const created = await tx.careIntelligenceVersion.create({
        data: {
          careIntelligenceId: data.careIntelligenceId,
          versionNumber,
          status: "DRAFT",
          ...scalarVersionFields(source),
          changeNote: data.changeNote ?? `Restored from archived version ${source.versionNumber}`,
          authorId: user.id,
        },
      });
      await deepCopyCareVersion(tx, source.id, created.id);
      return created;
    });

    revalidatePath(`/admin/ai/care-intelligence/${data.careIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** General-purpose "start a new revision" — copies the current latest
 * version (any status) unless a specific sourceVersionId is given. */
export async function duplicateCareIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = duplicateCareIntelligenceSchema.parse(input);

    const ci = await prisma.careIntelligence.findUnique({ where: { id: data.careIntelligenceId } });
    if (!ci) throw new NotFoundError("Care Intelligence");
    if (ci.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can duplicate a Confidential-layer version", 403, "FORBIDDEN");
    }

    const source = data.sourceVersionId
      ? await prisma.careIntelligenceVersion.findUnique({ where: { id: data.sourceVersionId } })
      : await prisma.careIntelligenceVersion.findFirst({ where: { careIntelligenceId: data.careIntelligenceId }, orderBy: { versionNumber: "desc" } });
    if (!source || source.careIntelligenceId !== data.careIntelligenceId) throw new NotFoundError("Source version");

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.careIntelligenceId);
      const created = await tx.careIntelligenceVersion.create({
        data: {
          careIntelligenceId: data.careIntelligenceId,
          versionNumber,
          status: "DRAFT",
          ...scalarVersionFields(source),
          changeNote: data.changeNote ?? `Duplicated from version ${source.versionNumber}`,
          authorId: user.id,
        },
      });
      await deepCopyCareVersion(tx, source.id, created.id);
      return created;
    });

    revalidatePath(`/admin/ai/care-intelligence/${data.careIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export async function getCareIntelligence(id: string) {
  try {
    await requireStaff();
    const ci = await prisma.careIntelligence.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, include: versionContentInclude } },
    });
    if (!ci) throw new NotFoundError("Care Intelligence");
    return { success: true as const, data: ci };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listCareIntelligence(input: unknown) {
  try {
    await requireStaff();
    const query = careIntelligenceQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where: Prisma.CareIntelligenceWhereInput = {
      ...(query.layer ? { layer: query.layer } : {}),
      ...(query.status || query.category
        ? { versions: { some: { ...(query.status ? { status: query.status } : {}), ...(query.category ? { category: query.category } : {}) } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.careIntelligence.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.careIntelligence.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getCareVersionHistory(careIntelligenceId: string) {
  try {
    await requireStaff();
    const ci = await prisma.careIntelligence.findUnique({ where: { id: careIntelligenceId } });
    if (!ci) throw new NotFoundError("Care Intelligence");

    const versions = await prisma.careIntelligenceVersion.findMany({
      where: { careIntelligenceId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true, versionNumber: true, status: true, changeNote: true,
        authorId: true, reviewedById: true, publishedById: true,
        submittedForReviewAt: true, reviewedAt: true, publishedAt: true, archivedAt: true, createdAt: true,
        author: { select: { name: true, email: true } },
      },
    });

    return { success: true as const, data: versions };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Customer/website-safe retrieval — no auth. Hardcoded to layer: PUBLIC
 * and status: PUBLISHED. Excludes careActions, communication guidance,
 * escalation detail, and evidenceSources entirely — these are staff/
 * future-CQ-Engine procedure documentation, never customer content, per
 * "store guidance only, do not generate responses" and this module's own
 * "no confidential workflow may leak through public retrieval." Included:
 * identity, situation, care objectives, required information (useful to
 * tell a customer what to prepare), applicable resolution conditions, and
 * customer-relevant follow-up expectations (not the internal reminder
 * cadence).
 */
export async function getPublishedCareIntelligence(input: unknown) {
  try {
    const query = publishedCareIntelligenceQuerySchema.parse(input);

    const items = await prisma.careIntelligence.findMany({
      where: {
        layer: "PUBLIC",
        ...(query.slug ? { slug: query.slug } : {}),
        versions: {
          some: {
            status: "PUBLISHED",
            ...(query.category ? { category: query.category } : {}),
            ...(query.segment ? { applicableCustomerSegments: { has: query.segment } } : {}),
          },
        },
      },
      select: {
        id: true,
        slug: true,
        versions: {
          where: { status: "PUBLISHED" },
          take: 1,
          select: {
            title: true,
            category: true,
            summary: true,
            situationDescription: true,
            situationTags: true,
            careObjectives: true,
            applicableResolutionConditions: true,
            followUpGuidance: true,
            maxWaitingPeriod: true,
            applicableCustomerSegments: true,
            publishedAt: true,
            requiredInformation: {
              orderBy: { displayOrder: "asc" },
              select: { label: true, description: true, isRequired: true, displayOrder: true },
            },
          },
        },
      },
    });

    return {
      success: true as const,
      data: items.filter((i) => i.versions[0]).map((i) => ({ id: i.id, slug: i.slug, ...i.versions[0]! })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}
