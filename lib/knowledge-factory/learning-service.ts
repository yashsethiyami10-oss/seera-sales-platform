import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { recordEnterpriseMutation } from "@/lib/enterprise/governance";
import { requireKnowledgeFactoryPrincipal } from "./context";

/**
 * MUV Intelligence Factory V4 §9 — Learning System (EP Sprint 8). Closes the
 * loop the retrieval/orchestration layers (Sprints 6-7) opened: what
 * knowledge was actually used, what was reported wrong, and what change is
 * proposed in response.
 *
 * `targetType` values are the same six Foundation Version table names
 * SourceProvenance/KnowledgeEmbedding already use: "KnowledgeVersion" |
 * "ProductIntelligenceVersion" | "ProblemIntelligenceVersion" |
 * "CareIntelligenceVersion" | "CategoryIntelligenceVersion" |
 * "ProductVariantIntelligenceVersion".
 */

const TARGET_TYPE_MODEL: Record<string, keyof typeof prisma> = {
  KnowledgeVersion: "knowledgeVersion",
  ProductIntelligenceVersion: "productIntelligenceVersion",
  ProblemIntelligenceVersion: "problemIntelligenceVersion",
  CareIntelligenceVersion: "careIntelligenceVersion",
  CategoryIntelligenceVersion: "categoryIntelligenceVersion",
  ProductVariantIntelligenceVersion: "productVariantIntelligenceVersion",
};

/**
 * Usage telemetry — mirrors lib/retrieval/pipeline.ts's own logRetrieval():
 * best-effort, never throws, never blocks the caller, and deliberately NOT
 * gated by requireKnowledgeFactoryPrincipal. Retrieval/orchestration is
 * caller-agnostic (an anonymous storefront visitor can trigger it), so
 * usage telemetry about what was *retrieved* must be recordable for that
 * same caller — gating it to staff would silently stop tracking the vast
 * majority of real usage.
 */
export async function recordKnowledgeUsage(entries: { targetType: string; targetId: string; usedInAction: string; callerRole: string }[]) {
  if (entries.length === 0) return;
  try {
    await prisma.knowledgeUsageReference.createMany({
      data: entries.map((e) => ({ organizationKey: "MUV", ...e })),
    });
  } catch (err) {
    logger.error("learning:usage-write-failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function listUsageReferences(input: { targetType?: string; targetId?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.knowledgeUsageReference.findMany({ where, orderBy: { usedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.knowledgeUsageReference.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// --- Change Proposals ---

const proposeChangeInput = z.object({
  targetType: z.string().min(2).max(80),
  targetId: z.string().min(1),
  currentVersionId: z.string().optional(),
  proposedChange: z.record(z.unknown()),
  rationale: z.string().min(3).max(2000),
});

export async function proposeKnowledgeChange(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = proposeChangeInput.parse(input);
  const proposal = await prisma.knowledgeChangeProposal.create({
    data: { organizationKey: principal.organizationKey, ...data, proposedChange: data.proposedChange as Prisma.InputJsonValue, proposedById: principal.id },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "CHANGE_PROPOSED", entityType: "KnowledgeChangeProposal", entityId: proposal.id,
    description: `Change proposed for ${data.targetType}:${data.targetId} — ${data.rationale}`,
  }).catch(() => {});
  return proposal;
}

/** Deciding a proposal never mutates the target Foundation Version itself —
 * per V4's own "the decision remains a human one" discipline (already
 * established by conflict-service.ts's resolveConflict), ACCEPTED only
 * records that a human agreed a change should happen; a staff editor still
 * has to make the actual edit through that Foundation's own action file
 * (e.g. actions/product-intelligence.ts), the one place version content is
 * ever written. */
export async function decideKnowledgeChangeProposal(id: string, decision: "ACCEPTED" | "REJECTED" | "WITHDRAWN", resolutionNote: string) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const proposal = await prisma.knowledgeChangeProposal.findFirst({ where: { id, organizationKey: principal.organizationKey } });
  if (!proposal) throw new NotFoundError("Knowledge change proposal");
  if (proposal.status !== "PENDING") throw new ConflictError("Only a PENDING proposal can be decided");
  if (!resolutionNote || resolutionNote.trim().length < 3) throw new AppError("A resolution note is required — a proposal is never silently decided", 422, "VALIDATION_ERROR");
  const updated = await prisma.knowledgeChangeProposal.update({
    where: { id }, data: { status: decision, reviewedById: principal.id, reviewedAt: new Date(), resolutionNote },
  });
  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: `CHANGE_PROPOSAL_${decision}`, entityType: "KnowledgeChangeProposal", entityId: id,
    description: resolutionNote,
  }).catch(() => {});
  return updated;
}

export async function listChangeProposals(input: { status?: string; targetType?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.status ? { status: input.status } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.knowledgeChangeProposal.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.knowledgeChangeProposal.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

// --- Recall Events ---

const recallEventInput = z.object({
  targetType: z.string().min(2).max(80),
  targetId: z.string().min(1),
  outcome: z.enum(["HELPFUL", "UNHELPFUL", "INCORRECT", "FLAGGED"]),
  note: z.string().max(2000).optional(),
});

/**
 * INCORRECT/FLAGGED sets requiresRevalidation = true on the matching
 * Foundation Version row (the currently PUBLISHED one, if any) — the one
 * place that flag is ever set automatically rather than by direct staff
 * edit. Never unpublishes, never edits content — purely a "surface this for
 * re-review" signal, per V4 §9's "detect drift, do not silently correct it."
 */
export async function recordRecallEvent(input: unknown) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_MANAGE);
  const data = recallEventInput.parse(input);
  const event = await prisma.recallEvent.create({
    data: { organizationKey: principal.organizationKey, ...data, reportedById: principal.id },
  });

  if (data.outcome === "INCORRECT" || data.outcome === "FLAGGED") {
    const modelName = TARGET_TYPE_MODEL[data.targetType];
    if (modelName) {
      const delegate = prisma[modelName] as { updateMany: (args: unknown) => Promise<unknown> };
      await delegate
        .updateMany({ where: { id: data.targetId, status: "PUBLISHED" }, data: { requiresRevalidation: true } })
        .catch((err: unknown) => logger.error("learning:revalidation-flag-failed", { targetType: data.targetType, targetId: data.targetId, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  await recordEnterpriseMutation(prisma as never, principal, {
    module: "knowledge_factory", action: "RECALL_EVENT_RECORDED", entityType: "RecallEvent", entityId: event.id,
    description: `${data.outcome} reported for ${data.targetType}:${data.targetId}${data.note ? ` — ${data.note}` : ""}`,
  }).catch(() => {});
  return event;
}

export async function listRecallEvents(input: { outcome?: string; targetType?: string; page?: number; pageSize?: number }) {
  const principal = await requireKnowledgeFactoryPrincipal(PERMISSIONS.KNOWLEDGE_FACTORY_SOURCE_VIEW);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  const where = {
    organizationKey: principal.organizationKey,
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.recallEvent.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.recallEvent.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
