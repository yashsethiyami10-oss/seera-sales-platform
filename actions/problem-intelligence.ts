"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError, ConflictError } from "@/lib/errors";
import {
  createProblemIntelligenceSchema,
  createProblemIntelligenceVersionSchema,
  updateProblemIntelligenceDraftSchema,
  submitProblemIntelligenceForReviewSchema,
  publishProblemIntelligenceSchema,
  archiveProblemIntelligenceSchema,
  restoreProblemIntelligenceSchema,
  duplicateProblemIntelligenceDraftSchema,
  changeProblemIntelligenceLayerSchema,
  problemIntelligenceQuerySchema,
  publishedProblemIntelligenceQuerySchema,
  addProblemSymptomSchema,
  addProblemCauseSchema,
  addProblemDiagnosticQuestionSchema,
  addProblemCommonMistakeSchema,
  addProblemProductRelationshipSchema,
  addProblemExclusionRuleSchema,
  addProblemUsageGuidanceSchema,
  addProblemExpectedOutcomeSchema,
  addProblemPreventionGuidanceSchema,
  addProblemSafetyRuleSchema,
  PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS,
} from "@/lib/validations/problem-intelligence";
import { paginationMeta, toSkipTake } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

/**
 * MUV AI — Problem Intelligence Foundation (PrIF Engine, Module 3). Every
 * exported function independently enforces its own RBAC, per this
 * project's established rule.
 *
 * No customer/AI-facing retrieval exists here beyond getPublishedProblemIntelligence
 * (Layer PUBLIC only, curated field selection — no internal notes, no
 * diagnostic questions, no evidence sources, ever). Everything else is
 * requireStaff()-gated, several functions further restricted to ADMIN.
 * This module does not implement semantic/AI retrieval, the Decision
 * Engine, or the Safety Engine — only the structured data they will
 * eventually read from.
 */

type SessionUser = { id: string; role: "ADMIN" | "STAFF" | "CUSTOMER" };

async function nextVersionNumber(tx: Prisma.TransactionClient, problemIntelligenceId: string) {
  const latest = await tx.problemIntelligenceVersion.findFirst({
    where: { problemIntelligenceId },
    orderBy: { versionNumber: "desc" },
  });
  return (latest?.versionNumber ?? 0) + 1;
}

/** Loads a version + its parent item, asserting it's still DRAFT/REVIEW
 * (editable) and that the caller is authorized for the item's layer
 * (ADMIN required for CONFIDENTIAL). Shared by updateProblemIntelligenceDraft
 * and every addProblem* child-section action, so the "published content is
 * immutable" and "Confidential needs admin" rules live in exactly one place. */
async function loadEditableVersion(versionId: string, user: SessionUser) {
  const version = await prisma.problemIntelligenceVersion.findUnique({
    where: { id: versionId },
    include: { problemIntelligence: true },
  });
  if (!version) throw new NotFoundError("Problem Intelligence version");
  if (version.status !== "DRAFT" && version.status !== "REVIEW") {
    throw new AppError(`Can't edit a ${version.status.toLowerCase()} version — duplicate or restore it as a new draft instead`, 400, "VERSION_NOT_EDITABLE");
  }
  if (version.problemIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
    throw new AppError("Only an admin can edit Confidential-layer Problem Intelligence", 403, "FORBIDDEN");
  }
  return version;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

/**
 * Deep-copies every structured child section from one version into another
 * — the real mechanism behind both duplicateProblemIntelligenceDraft and
 * restoreProblemIntelligence. Diagnostic questions are copied first so
 * causes can reconnect their confirmingQuestions relation to the *new*
 * question ids, not the source version's — otherwise a duplicated cause
 * would silently point at another version's questions.
 */
async function deepCopyVersionChildren(tx: Prisma.TransactionClient, sourceVersionId: string, newVersionId: string) {
  const source = await tx.problemIntelligenceVersion.findUniqueOrThrow({
    where: { id: sourceVersionId },
    include: {
      applicableCategories: { select: { id: true } },
      symptoms: true,
      causes: { include: { confirmingQuestions: { select: { id: true } } } },
      diagnosticQuestions: { include: { options: true } },
      commonMistakes: true,
      productRelationships: true,
      exclusionRules: true,
      usageGuidance: true,
      expectedOutcomes: true,
      preventionGuidance: true,
      safetyRules: true,
      evidenceSources: true,
    },
  });

  if (source.applicableCategories.length) {
    await tx.problemIntelligenceVersion.update({
      where: { id: newVersionId },
      data: { applicableCategories: { connect: source.applicableCategories.map((c) => ({ id: c.id })) } },
    });
  }

  const questionIdMap = new Map<string, string>();
  for (const q of source.diagnosticQuestions) {
    const created = await tx.problemDiagnosticQuestion.create({
      data: {
        versionId: newVersionId,
        questionText: q.questionText,
        purpose: q.purpose,
        answerType: q.answerType,
        isRequired: q.isRequired,
        validationRules: toJsonInput(q.validationRules),
        followUpConditions: toJsonInput(q.followUpConditions),
        displayOrder: q.displayOrder,
        audience: q.audience,
        options: { create: q.options.map((o) => ({ label: o.label, value: o.value, displayOrder: o.displayOrder })) },
      },
    });
    questionIdMap.set(q.id, created.id);
  }

  for (const c of source.causes) {
    await tx.problemCause.create({
      data: {
        versionId: newVersionId,
        title: c.title,
        explanation: c.explanation,
        likelihood: c.likelihood,
        evidenceIndicators: c.evidenceIndicators,
        internalNotes: c.internalNotes,
        displayOrder: c.displayOrder,
        confirmingQuestions: { connect: c.confirmingQuestions.map((q) => ({ id: questionIdMap.get(q.id)! })) },
      },
    });
  }

  if (source.symptoms.length) {
    await tx.problemSymptom.createMany({
      data: source.symptoms.map((s) => ({
        versionId: newVersionId, title: s.title, description: s.description, severity: s.severity,
        isRequired: s.isRequired, displayOrder: s.displayOrder,
        customerLanguageVariations: s.customerLanguageVariations, internalNotes: s.internalNotes,
      })),
    });
  }
  if (source.commonMistakes.length) {
    await tx.problemCommonMistake.createMany({
      data: source.commonMistakes.map((m) => ({
        versionId: newVersionId, title: m.title, explanation: m.explanation, consequence: m.consequence,
        correction: m.correction, severity: m.severity, displayOrder: m.displayOrder,
      })),
    });
  }
  if (source.productRelationships.length) {
    await tx.problemProductRelationship.createMany({
      data: source.productRelationships.map((r) => ({
        versionId: newVersionId, productId: r.productId, productIntelligenceId: r.productIntelligenceId,
        suitability: r.suitability, reason: r.reason, conditionsRequired: r.conditionsRequired,
        usageNotes: r.usageNotes, priority: r.priority, confidence: r.confidence,
        customerFacingExplanation: r.customerFacingExplanation, internalRationale: r.internalRationale,
        overrideJustification: r.overrideJustification,
      })),
    });
  }
  if (source.exclusionRules.length) {
    await tx.problemExclusionRule.createMany({
      data: source.exclusionRules.map((e) => ({
        versionId: newVersionId, productId: e.productId, categoryId: e.categoryId, reason: e.reason,
        condition: e.condition, severity: e.severity, customerFacingWarning: e.customerFacingWarning,
        internalNotes: e.internalNotes, escalationRequired: e.escalationRequired,
      })),
    });
  }
  if (source.usageGuidance.length) {
    await tx.problemUsageGuidance.createMany({
      data: source.usageGuidance.map((u) => ({
        versionId: newVersionId, productId: u.productId, productIntelligenceId: u.productIntelligenceId,
        stepTitle: u.stepTitle, instructions: u.instructions, quantityOrDilution: u.quantityOrDilution,
        frequency: u.frequency, duration: u.duration, expectedTiming: u.expectedTiming,
        safetyNote: u.safetyNote, displayOrder: u.displayOrder,
      })),
    });
  }
  if (source.expectedOutcomes.length) {
    await tx.problemExpectedOutcome.createMany({
      data: source.expectedOutcomes.map((o) => ({
        versionId: newVersionId, description: o.description, expectedTimeframe: o.expectedTimeframe,
        conditions: o.conditions, limitations: o.limitations, confidenceLevel: o.confidenceLevel,
        customerFacingWording: o.customerFacingWording, internalEvidenceNotes: o.internalEvidenceNotes,
        displayOrder: o.displayOrder,
      })),
    });
  }
  if (source.preventionGuidance.length) {
    await tx.problemPreventionGuidance.createMany({
      data: source.preventionGuidance.map((p) => ({
        versionId: newVersionId, title: p.title, guidance: p.guidance, frequency: p.frequency,
        applicableContext: p.applicableContext, displayOrder: p.displayOrder,
      })),
    });
  }
  if (source.safetyRules.length) {
    await tx.problemSafetyRule.createMany({
      data: source.safetyRules.map((s) => ({
        versionId: newVersionId, title: s.title, condition: s.condition, riskLevel: s.riskLevel,
        escalationRequired: s.escalationRequired, disclaimerText: s.disclaimerText,
        internalNotes: s.internalNotes, displayOrder: s.displayOrder,
      })),
    });
  }
  if (source.evidenceSources.length) {
    await tx.problemEvidenceSource.createMany({
      data: source.evidenceSources.map((e) => ({
        versionId: newVersionId, sourceType: e.sourceType, sourceReference: e.sourceReference,
        evidenceNotes: e.evidenceNotes, reviewerId: e.reviewerId, reviewDate: e.reviewDate,
        confidenceClassification: e.confidenceClassification, internalOnly: e.internalOnly,
      })),
    });
  }

  return source;
}

// ---------------------------------------------------------------------------
// Core item / version lifecycle
// ---------------------------------------------------------------------------

export async function createProblemIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createProblemIntelligenceSchema.parse(input);

    if (data.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can create Confidential-layer Problem Intelligence", 403, "FORBIDDEN");
    }

    const existing = await prisma.problemIntelligence.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictError(`A Problem Intelligence item with slug "${data.slug}" already exists`);

    const { applicableCategoryIds, ...content } = data.content;

    const pi = await prisma.$transaction(async (tx) => {
      const created = await tx.problemIntelligence.create({ data: { slug: data.slug, layer: data.layer } });
      await tx.problemIntelligenceVersion.create({
        data: {
          problemIntelligenceId: created.id,
          versionNumber: 1,
          ...content,
          applicableCategories: applicableCategoryIds.length ? { connect: applicableCategoryIds.map((id) => ({ id })) } : undefined,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
      return created;
    });

    revalidatePath("/admin/ai/problem-intelligence");
    return { success: true as const, data: { id: pi.id, slug: pi.slug } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function createProblemIntelligenceVersion(input: unknown) {
  try {
    const user = await requireStaff();
    const data = createProblemIntelligenceVersionSchema.parse(input);

    const pi = await prisma.problemIntelligence.findUnique({ where: { id: data.problemIntelligenceId } });
    if (!pi) throw new NotFoundError("Problem Intelligence");
    if (pi.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can add a version to Confidential-layer Problem Intelligence", 403, "FORBIDDEN");
    }

    const { applicableCategoryIds, ...content } = data.content;

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.problemIntelligenceId);
      return tx.problemIntelligenceVersion.create({
        data: {
          problemIntelligenceId: data.problemIntelligenceId,
          versionNumber,
          ...content,
          applicableCategories: applicableCategoryIds.length ? { connect: applicableCategoryIds.map((id) => ({ id })) } : undefined,
          changeNote: data.changeNote,
          authorId: user.id,
        },
      });
    });

    revalidatePath(`/admin/ai/problem-intelligence/${data.problemIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Edits version-level content while DRAFT/REVIEW. Editing a REVIEW-status
 * version implicitly sends it back to DRAFT — there's no separately named
 * "send back for changes" action in this module's required Server Actions
 * list, and semantically, a version that's being edited again is no longer
 * in a reviewed-and-ready state. Documented here since it's a reasonable
 * assumption, not something the spec stated outright.
 */
export async function updateProblemIntelligenceDraft(input: unknown) {
  try {
    const user = await requireStaff();
    const data = updateProblemIntelligenceDraftSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const { applicableCategoryIds, ...content } = data.content;

    await prisma.problemIntelligenceVersion.update({
      where: { id: data.versionId },
      data: {
        ...content,
        ...(applicableCategoryIds ? { applicableCategories: { set: applicableCategoryIds.map((id) => ({ id })) } } : {}),
        changeNote: data.changeNote,
        status: version.status === "REVIEW" ? "DRAFT" : version.status,
      },
    });

    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: data.versionId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function submitProblemIntelligenceForReview(input: unknown) {
  try {
    const user = await requireStaff();
    const data = submitProblemIntelligenceForReviewSchema.parse(input);
    const version = await prisma.problemIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { problemIntelligence: true } });
    if (!version) throw new NotFoundError("Problem Intelligence version");
    if (!PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes("REVIEW")) {
      throw new AppError(`Can't move a Problem Intelligence version from ${version.status} to REVIEW`, 400, "INVALID_TRANSITION");
    }
    if (version.problemIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can submit Confidential-layer Problem Intelligence for review", 403, "FORBIDDEN");
    }

    await prisma.problemIntelligenceVersion.update({ where: { id: data.versionId }, data: { status: "REVIEW", submittedForReviewAt: new Date() } });

    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { status: "REVIEW" as const } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Admin-only — the one transition that makes content live. Atomic: any
 * currently-PUBLISHED version for the same item is archived in the same
 * transaction as the new one is published, so a concurrent second publish
 * call either fully succeeds after this one commits (and correctly
 * archives *this* version in turn) or fully fails — never two rows left
 * PUBLISHED at once. See the schema comment for why this is a transaction
 * and not a database constraint (Prisma's schema DSL has no partial-unique
 * index syntax, same limitation Module 1/2 carry).
 */
export async function publishProblemIntelligence(input: unknown) {
  try {
    const user = await requireAdmin();
    const data = publishProblemIntelligenceSchema.parse(input);

    const version = await prisma.problemIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { problemIntelligence: true } });
    if (!version) throw new NotFoundError("Problem Intelligence version");
    if (!PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes("PUBLISHED")) {
      throw new AppError(`Can't publish a Problem Intelligence version from ${version.status} — it must be in REVIEW first`, 400, "INVALID_TRANSITION");
    }

    await prisma.$transaction(async (tx) => {
      const currentlyPublished = await tx.problemIntelligenceVersion.findFirst({
        where: { problemIntelligenceId: version.problemIntelligenceId, status: "PUBLISHED" },
      });
      if (currentlyPublished) {
        await tx.problemIntelligenceVersion.update({ where: { id: currentlyPublished.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      }
      const now = new Date();
      await tx.problemIntelligenceVersion.update({
        where: { id: version.id },
        data: { status: "PUBLISHED", publishedAt: now, publishedById: user.id, reviewedById: user.id, reviewedAt: now },
      });
    });

    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { status: "PUBLISHED" as const } };
  } catch (err) {
    logger.error("problem-intelligence:publish:failed", { error: err instanceof Error ? err.message : String(err) });
    return toErrorResponse(err);
  }
}

/** Un-publishing (archiving a currently-PUBLISHED version) is admin-only,
 * same tier as publishing itself; archiving an unpublished DRAFT/REVIEW
 * version (discarding it) is staff-level since nothing live is affected. */
export async function archiveProblemIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = archiveProblemIntelligenceSchema.parse(input);

    const version = await prisma.problemIntelligenceVersion.findUnique({ where: { id: data.versionId }, include: { problemIntelligence: true } });
    if (!version) throw new NotFoundError("Problem Intelligence version");
    if (!PROBLEM_INTELLIGENCE_ALLOWED_TRANSITIONS[version.status].includes("ARCHIVED")) {
      throw new AppError(`Can't archive a Problem Intelligence version from ${version.status}`, 400, "INVALID_TRANSITION");
    }
    if (version.status === "PUBLISHED" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can unpublish (archive) a live Problem Intelligence version", 403, "FORBIDDEN");
    }
    if (version.problemIntelligence.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can change Confidential-layer Problem Intelligence", 403, "FORBIDDEN");
    }

    await prisma.problemIntelligenceVersion.update({
      where: { id: data.versionId },
      data: { status: "ARCHIVED", archivedAt: new Date(), changeNote: data.reason ?? version.changeNote },
    });

    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { status: "ARCHIVED" as const } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Revives specifically ARCHIVED content as a new DRAFT — distinct from
 * duplicateProblemIntelligenceDraft (which can copy *any* version,
 * typically the current one, to start a routine correction).
 * "Restoring archived content must not silently overwrite a current
 * published version" is satisfied structurally: this only ever creates a
 * new row, it never touches whatever is currently PUBLISHED.
 */
export async function restoreProblemIntelligence(input: unknown) {
  try {
    const user = await requireStaff();
    const data = restoreProblemIntelligenceSchema.parse(input);

    const pi = await prisma.problemIntelligence.findUnique({ where: { id: data.problemIntelligenceId } });
    if (!pi) throw new NotFoundError("Problem Intelligence");
    if (pi.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can restore a Confidential-layer version", 403, "FORBIDDEN");
    }

    const source = await prisma.problemIntelligenceVersion.findUnique({ where: { id: data.archivedVersionId } });
    if (!source || source.problemIntelligenceId !== data.problemIntelligenceId) throw new NotFoundError("Archived version");
    if (source.status !== "ARCHIVED") {
      throw new AppError("restoreProblemIntelligence can only restore an ARCHIVED version — use duplicateProblemIntelligenceDraft for the current version instead", 400, "NOT_ARCHIVED");
    }

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.problemIntelligenceId);
      const created = await tx.problemIntelligenceVersion.create({
        data: {
          problemIntelligenceId: data.problemIntelligenceId,
          versionNumber,
          status: "DRAFT",
          publicTitle: source.publicTitle,
          internalTitle: source.internalTitle,
          summary: source.summary,
          problemCategory: source.problemCategory,
          tags: source.tags,
          synonyms: source.synonyms,
          searchTerms: source.searchTerms,
          customerDescriptions: source.customerDescriptions,
          riskLevel: source.riskLevel,
          escalationRequired: source.escalationRequired,
          escalationReason: source.escalationReason,
          emergencyWarningText: source.emergencyWarningText,
          humanReviewRequired: source.humanReviewRequired,
          prohibitedRecommendation: source.prohibitedRecommendation,
          requiredDisclaimers: source.requiredDisclaimers,
          internalHandlingNotes: source.internalHandlingNotes,
          changeNote: data.changeNote ?? `Restored from archived version ${source.versionNumber}`,
          authorId: user.id,
        },
      });
      await deepCopyVersionChildren(tx, source.id, created.id);
      return created;
    });

    revalidatePath(`/admin/ai/problem-intelligence/${data.problemIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** General-purpose "start a new revision" — copies the current latest
 * version (any status) unless a specific sourceVersionId is given. */
export async function duplicateProblemIntelligenceDraft(input: unknown) {
  try {
    const user = await requireStaff();
    const data = duplicateProblemIntelligenceDraftSchema.parse(input);

    const pi = await prisma.problemIntelligence.findUnique({ where: { id: data.problemIntelligenceId } });
    if (!pi) throw new NotFoundError("Problem Intelligence");
    if (pi.layer === "CONFIDENTIAL" && user.role !== "ADMIN") {
      throw new AppError("Only an admin can duplicate a Confidential-layer version", 403, "FORBIDDEN");
    }

    const source = data.sourceVersionId
      ? await prisma.problemIntelligenceVersion.findUnique({ where: { id: data.sourceVersionId } })
      : await prisma.problemIntelligenceVersion.findFirst({ where: { problemIntelligenceId: data.problemIntelligenceId }, orderBy: { versionNumber: "desc" } });
    if (!source || source.problemIntelligenceId !== data.problemIntelligenceId) throw new NotFoundError("Source version");

    const version = await prisma.$transaction(async (tx) => {
      const versionNumber = await nextVersionNumber(tx, data.problemIntelligenceId);
      const created = await tx.problemIntelligenceVersion.create({
        data: {
          problemIntelligenceId: data.problemIntelligenceId,
          versionNumber,
          status: "DRAFT",
          publicTitle: source.publicTitle,
          internalTitle: source.internalTitle,
          summary: source.summary,
          problemCategory: source.problemCategory,
          tags: source.tags,
          synonyms: source.synonyms,
          searchTerms: source.searchTerms,
          customerDescriptions: source.customerDescriptions,
          riskLevel: source.riskLevel,
          escalationRequired: source.escalationRequired,
          escalationReason: source.escalationReason,
          emergencyWarningText: source.emergencyWarningText,
          humanReviewRequired: source.humanReviewRequired,
          prohibitedRecommendation: source.prohibitedRecommendation,
          requiredDisclaimers: source.requiredDisclaimers,
          internalHandlingNotes: source.internalHandlingNotes,
          changeNote: data.changeNote ?? `Duplicated from version ${source.versionNumber}`,
          authorId: user.id,
        },
      });
      await deepCopyVersionChildren(tx, source.id, created.id);
      return created;
    });

    revalidatePath(`/admin/ai/problem-intelligence/${data.problemIntelligenceId}`);
    return { success: true as const, data: { id: version.id, versionNumber: version.versionNumber } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function changeProblemIntelligenceLayer(input: unknown) {
  try {
    await requireAdmin();
    const data = changeProblemIntelligenceLayerSchema.parse(input);

    const pi = await prisma.problemIntelligence.findUnique({ where: { id: data.problemIntelligenceId } });
    if (!pi) throw new NotFoundError("Problem Intelligence");

    await prisma.problemIntelligence.update({ where: { id: data.problemIntelligenceId }, data: { layer: data.layer } });

    revalidatePath(`/admin/ai/problem-intelligence/${data.problemIntelligenceId}`);
    return { success: true as const, data: { id: data.problemIntelligenceId } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

const fullVersionInclude = {
  symptoms: { orderBy: { displayOrder: "asc" as const } },
  causes: { orderBy: { displayOrder: "asc" as const }, include: { confirmingQuestions: true } },
  diagnosticQuestions: { orderBy: { displayOrder: "asc" as const }, include: { options: { orderBy: { displayOrder: "asc" as const } } } },
  commonMistakes: { orderBy: { displayOrder: "asc" as const } },
  productRelationships: { orderBy: { priority: "desc" as const }, include: { product: { select: { name: true, slug: true } } } },
  exclusionRules: true,
  usageGuidance: { orderBy: { displayOrder: "asc" as const } },
  expectedOutcomes: { orderBy: { displayOrder: "asc" as const } },
  preventionGuidance: { orderBy: { displayOrder: "asc" as const } },
  safetyRules: { orderBy: { displayOrder: "asc" as const } },
  evidenceSources: true,
  applicableCategories: { select: { id: true, name: true, slug: true } },
  author: { select: { name: true, email: true } },
  reviewedBy: { select: { name: true, email: true } },
  publishedBy: { select: { name: true, email: true } },
};

export async function getProblemIntelligence(id: string) {
  try {
    await requireStaff();
    const pi = await prisma.problemIntelligence.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: "desc" }, include: fullVersionInclude } },
    });
    if (!pi) throw new NotFoundError("Problem Intelligence");
    return { success: true as const, data: pi };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function listProblemIntelligence(input: unknown) {
  try {
    await requireStaff();
    const query = problemIntelligenceQuerySchema.parse(input);
    const { skip, take } = toSkipTake(query);

    const where: Prisma.ProblemIntelligenceWhereInput = {
      ...(query.layer ? { layer: query.layer } : {}),
      ...(query.status ? { versions: { some: { status: query.status } } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.problemIntelligence.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      }),
      prisma.problemIntelligence.count({ where }),
    ]);

    return { success: true as const, data: items, pagination: paginationMeta(query, total) };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getProblemIntelligenceVersionHistory(problemIntelligenceId: string) {
  try {
    await requireStaff();
    const pi = await prisma.problemIntelligence.findUnique({ where: { id: problemIntelligenceId } });
    if (!pi) throw new NotFoundError("Problem Intelligence");

    const versions = await prisma.problemIntelligenceVersion.findMany({
      where: { problemIntelligenceId },
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
 * and status: PUBLISHED; nothing the caller passes can widen that. Field
 * selection additionally excludes every internal-marked field/table
 * (internalNotes, internalRationale, internalHandlingNotes, escalation
 * operational detail, diagnostic questions, evidence sources) even though
 * the item itself is Layer PUBLIC — "Public retrieval must never expose
 * Layer B or Layer C content" is about the *item* layer, but several
 * fields are internal regardless of the item's overall layer (see the
 * Permissions section of this module's own spec), so both boundaries are
 * enforced here, not just one.
 */
export async function getPublishedProblemIntelligence(input: unknown) {
  try {
    const query = publishedProblemIntelligenceQuerySchema.parse(input);

    const items = await prisma.problemIntelligence.findMany({
      where: {
        layer: "PUBLIC",
        ...(query.slug ? { slug: query.slug } : {}),
        versions: { some: { status: "PUBLISHED", ...(query.tag ? { tags: { has: query.tag } } : {}) } },
      },
      select: {
        id: true,
        slug: true,
        versions: {
          where: { status: "PUBLISHED" },
          take: 1,
          select: {
            publicTitle: true,
            summary: true,
            tags: true,
            customerDescriptions: true,
            emergencyWarningText: true,
            requiredDisclaimers: true,
            publishedAt: true,
            symptoms: {
              orderBy: { displayOrder: "asc" },
              select: { title: true, description: true, customerLanguageVariations: true, displayOrder: true },
            },
            causes: {
              orderBy: { displayOrder: "asc" },
              select: { title: true, explanation: true, likelihood: true, displayOrder: true },
            },
            commonMistakes: {
              orderBy: { displayOrder: "asc" },
              select: { title: true, explanation: true, consequence: true, correction: true, displayOrder: true },
            },
            productRelationships: {
              orderBy: { priority: "desc" },
              select: {
                suitability: true, customerFacingExplanation: true, priority: true,
                product: { select: { name: true, slug: true } },
              },
            },
            exclusionRules: {
              select: { customerFacingWarning: true, product: { select: { name: true, slug: true } }, category: { select: { name: true, slug: true } } },
            },
            usageGuidance: {
              orderBy: { displayOrder: "asc" },
              select: { stepTitle: true, instructions: true, quantityOrDilution: true, frequency: true, duration: true, expectedTiming: true, safetyNote: true, displayOrder: true },
            },
            expectedOutcomes: {
              orderBy: { displayOrder: "asc" },
              select: { customerFacingWording: true, expectedTimeframe: true, limitations: true, confidenceLevel: true, displayOrder: true },
            },
            preventionGuidance: {
              orderBy: { displayOrder: "asc" },
              select: { title: true, guidance: true, frequency: true, applicableContext: true, displayOrder: true },
            },
            safetyRules: {
              select: { title: true, disclaimerText: true, riskLevel: true },
            },
          },
        },
      },
    });

    return {
      success: true as const,
      data: items
        .filter((i) => i.versions[0])
        .map((i) => ({ id: i.id, slug: i.slug, ...i.versions[0]! })),
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Structured child sections — each requires an editable (DRAFT/REVIEW)
// version and independently re-derives RBAC via loadEditableVersion.
// ---------------------------------------------------------------------------

export async function addProblemSymptom(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemSymptomSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const symptom = await prisma.problemSymptom.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: symptom.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemCause(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemCauseSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const { confirmingQuestionIds, ...rest } = data;
    if (confirmingQuestionIds.length) {
      const validQuestions = await prisma.problemDiagnosticQuestion.count({ where: { id: { in: confirmingQuestionIds }, versionId: data.versionId } });
      if (validQuestions !== confirmingQuestionIds.length) {
        throw new AppError("One or more confirmingQuestionIds don't belong to this version", 400, "INVALID_REFERENCE");
      }
    }

    const cause = await prisma.problemCause.create({
      data: { ...rest, confirmingQuestions: { connect: confirmingQuestionIds.map((id) => ({ id })) } },
    });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: cause.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemDiagnosticQuestion(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemDiagnosticQuestionSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const question = await prisma.problemDiagnosticQuestion.create({
      data: {
        versionId: data.versionId,
        questionText: data.questionText,
        purpose: data.purpose,
        answerType: data.answerType,
        isRequired: data.isRequired,
        validationRules: toJsonInput(data.validationRules),
        followUpConditions: toJsonInput(data.followUpConditions),
        displayOrder: data.displayOrder,
        audience: data.audience,
        options: { create: data.options },
      },
    });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: question.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemCommonMistake(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemCommonMistakeSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const mistake = await prisma.problemCommonMistake.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: mistake.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Enforces "No contradictory recommendation and exclusion for the same
 * exact condition without an explicit documented override": if this
 * product (or its category) is already excluded somewhere in this same
 * version, and the relationship being added isn't itself NOT_RECOMMENDED,
 * an overrideJustification is required, or the call is rejected.
 */
export async function addProblemProductRelationship(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemProductRelationshipSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new NotFoundError("Product");

    if (data.suitability !== "NOT_RECOMMENDED") {
      const conflict = await prisma.problemExclusionRule.findFirst({
        where: { versionId: data.versionId, OR: [{ productId: data.productId }, { categoryId: product.categoryId }] },
      });
      if (conflict && !data.overrideJustification) {
        throw new AppError(
          "This product (or its category) is already excluded in this version — provide overrideJustification to add it as a recommendation anyway",
          409,
          "RECOMMENDATION_EXCLUSION_CONFLICT"
        );
      }
    }

    const relationship = await prisma.problemProductRelationship.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: relationship.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemExclusionRule(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemExclusionRuleSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    if (data.productId) {
      const product = await prisma.product.findUnique({ where: { id: data.productId } });
      if (!product) throw new NotFoundError("Product");
    }
    if (data.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new NotFoundError("Category");
    }

    const rule = await prisma.problemExclusionRule.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: rule.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemUsageGuidance(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemUsageGuidanceSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const guidance = await prisma.problemUsageGuidance.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: guidance.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemExpectedOutcome(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemExpectedOutcomeSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const outcome = await prisma.problemExpectedOutcome.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: outcome.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemPreventionGuidance(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemPreventionGuidanceSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const guidance = await prisma.problemPreventionGuidance.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: guidance.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function addProblemSafetyRule(input: unknown) {
  try {
    const user = await requireStaff();
    const data = addProblemSafetyRuleSchema.parse(input);
    const version = await loadEditableVersion(data.versionId, user);

    const rule = await prisma.problemSafetyRule.create({ data });
    revalidatePath(`/admin/ai/problem-intelligence/${version.problemIntelligenceId}`);
    return { success: true as const, data: { id: rule.id } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
