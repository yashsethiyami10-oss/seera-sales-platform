"use server";

import { prisma } from "@/lib/prisma";
import { toErrorResponse, AppError } from "@/lib/errors";
import {
  retrieveKnowledgeSchema,
  searchKnowledgeSchema,
  resolveKnowledgeSchema,
  getKnowledgeHistorySchema,
  getPublishedKnowledgeSchema,
  getKnowledgeRelationshipsSchema,
  validateRetrievalScopeSchema,
  rankKnowledgeSchema,
} from "@/lib/validations/retrieval";
import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import { resolveCallerClearance, layerAllowed } from "@/lib/retrieval/permissions";
import { resolveRelationships } from "@/lib/retrieval/relationships";
import { rankResults } from "@/lib/retrieval/ranking";
import { ALL_SOURCE_TYPES } from "@/lib/retrieval/types";
import type { KnowledgeSourceType } from "@/lib/retrieval/types";

/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5). Read-only —
 * confirmed: no function below calls `.create`/`.update`/`.delete` on any
 * Knowledge/PIF/PrIF/CIF content model. `runRetrievalPipeline`'s telemetry
 * write is the one exception, to its own dedicated `KnowledgeRetrievalLog`
 * table, never to content (see the schema comment on that model).
 *
 * Unlike Modules 1–4, none of these 8 actions calls `requireStaff()`/
 * `requireAdmin()` — every one is callable by any caller, including a
 * fully anonymous one. Permission is enforced entirely by
 * `resolveCallerClearance()`'s server-derived layer/status filtering
 * applied to *results*, never by blocking the call itself. This is
 * deliberate: a future customer-facing AI must be able to call
 * `retrieveKnowledge()` directly as an anonymous visitor and safely get
 * back only Public, Published content — it cannot sit behind a
 * staff-only gate the way Modules 1–4's admin CRUD actions correctly do.
 */

export async function retrieveKnowledge(input: unknown) {
  try {
    const context = retrieveKnowledgeSchema.parse(input);
    const { results, clearance } = await runRetrievalPipeline("retrieveKnowledge", context, { resolveRelationshipsForTop: 5 });
    return { success: true as const, data: { results, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function searchKnowledge(input: unknown) {
  try {
    const context = searchKnowledgeSchema.parse(input);
    const { results, clearance } = await runRetrievalPipeline("searchKnowledge", context, { resolveRelationshipsForTop: 0 });
    return { success: true as const, data: { results, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Direct lookup by (sourceType, recordId|slug) — reuses the same source
 * fetchers as the search pipeline (scoped to one sourceType, exact
 * id/slug filter), just without ranking, since there's at most one
 * definite target. */
export async function resolveKnowledge(input: unknown) {
  try {
    const data = resolveKnowledgeSchema.parse(input);
    const context = {
      knowledgeId: data.recordId,
      slug: data.slug,
      sourceTypes: [data.sourceType] as KnowledgeSourceType[],
      versionSelector: data.versionSelector,
      limit: 1,
    };
    const { results, clearance } = await runRetrievalPipeline("resolveKnowledge", context, { resolveRelationshipsForTop: 1 });
    return { success: true as const, data: { result: results[0] ?? null, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Full version history for one record. Not function-gated — a caller
 * without `canAccessNonPublished` simply never sees a DRAFT/REVIEW/
 * ARCHIVED row, so an anonymous caller's "history" is, correctly, just
 * the single current published version (never more, never less).
 */
const KNOWLEDGE_HISTORY_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
const FOUR_STATE_HISTORY_STATUSES = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

export async function getKnowledgeHistory(input: unknown) {
  try {
    const data = getKnowledgeHistorySchema.parse(input);
    const clearance = await resolveCallerClearance();
    const wantsAll = clearance.canAccessNonPublished;

    let versions: { id: string; versionNumber: number; status: string; createdAt: Date; publishedAt: Date | null; archivedAt: Date | null }[] = [];

    if (data.sourceType === "KNOWLEDGE") {
      const item = await prisma.knowledgeItem.findUnique({ where: { id: data.recordId }, select: { layer: true } });
      const statuses = wantsAll ? KNOWLEDGE_HISTORY_STATUSES : (["PUBLISHED"] as const);
      if (item && layerAllowed(item.layer, clearance)) {
        // Module 1's KnowledgeVersion has no archivedAt column at all (a
        // pre-existing difference from Modules 2–4's four-state lifecycle,
        // not something Module 5 changes) — synthesized as null here so
        // the returned shape stays uniform across all four source types.
        const rows = await prisma.knowledgeVersion.findMany({ where: { itemId: data.recordId, status: { in: [...statuses] } }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true } });
        versions = rows.map((r) => ({ ...r, archivedAt: null }));
      }
    } else if (data.sourceType === "PRODUCT_INTELLIGENCE") {
      const item = await prisma.productIntelligence.findUnique({ where: { id: data.recordId }, select: { layer: true } });
      const statuses = wantsAll ? FOUR_STATE_HISTORY_STATUSES : (["PUBLISHED"] as const);
      if (item && layerAllowed(item.layer, clearance)) {
        versions = await prisma.productIntelligenceVersion.findMany({ where: { productIntelligenceId: data.recordId, status: { in: [...statuses] } }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true, archivedAt: true } });
      }
    } else if (data.sourceType === "PROBLEM_INTELLIGENCE") {
      const item = await prisma.problemIntelligence.findUnique({ where: { id: data.recordId }, select: { layer: true } });
      const statuses = wantsAll ? FOUR_STATE_HISTORY_STATUSES : (["PUBLISHED"] as const);
      if (item && layerAllowed(item.layer, clearance)) {
        versions = await prisma.problemIntelligenceVersion.findMany({ where: { problemIntelligenceId: data.recordId, status: { in: [...statuses] } }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true, archivedAt: true } });
      }
    } else if (data.sourceType === "CARE_INTELLIGENCE") {
      const item = await prisma.careIntelligence.findUnique({ where: { id: data.recordId }, select: { layer: true } });
      const statuses = wantsAll ? FOUR_STATE_HISTORY_STATUSES : (["PUBLISHED"] as const);
      if (item && layerAllowed(item.layer, clearance)) {
        versions = await prisma.careIntelligenceVersion.findMany({ where: { careIntelligenceId: data.recordId, status: { in: [...statuses] } }, orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, status: true, createdAt: true, publishedAt: true, archivedAt: true } });
      }
    }

    return { success: true as const, data: { versions, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Convenience wrapper — forces versionSelector to "published" server-side
 * regardless of what (if anything) the caller passes for it. */
export async function getPublishedKnowledge(input: unknown) {
  try {
    const context = getPublishedKnowledgeSchema.parse(input);
    const publishedContext = { ...context, versionSelector: { mode: "published" as const } };
    const { results, clearance } = await runRetrievalPipeline("getPublishedKnowledge", publishedContext, { resolveRelationshipsForTop: 5 });
    return { success: true as const, data: { results, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getKnowledgeRelationships(input: unknown) {
  try {
    const data = getKnowledgeRelationshipsSchema.parse(input);
    const clearance = await resolveCallerClearance();
    const references = await resolveRelationships(data.sourceType, data.recordId, clearance);
    return { success: true as const, data: { references, clearance: clearance.maxLayer } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Pre-flight check — validates a proposed retrieval scope against the
 * caller's real clearance without executing any retrieval. Useful for a
 * future caller (e.g. a Decision Intelligence module) that wants to know
 * what it's actually allowed to ask for before committing to a full call.
 */
export async function validateRetrievalScope(input: unknown) {
  try {
    const data = validateRetrievalScopeSchema.parse(input);
    const clearance = await resolveCallerClearance();

    const requestedModes = ["draft", "review", "archived", "history"];
    const requestsNonPublished = data.versionSelector && requestedModes.includes(data.versionSelector.mode);
    if (requestsNonPublished && !clearance.canAccessNonPublished) {
      return {
        success: true as const,
        data: {
          valid: false,
          reason: `A ${clearance.role} caller cannot request version mode "${data.versionSelector!.mode}" — only published content is available`,
          effectiveClearance: clearance,
          effectiveSourceTypes: data.sourceTypes ?? ALL_SOURCE_TYPES,
          effectiveVersionSelector: { mode: "published" as const },
        },
      };
    }

    return {
      success: true as const,
      data: {
        valid: true,
        effectiveClearance: clearance,
        effectiveSourceTypes: data.sourceTypes ?? ALL_SOURCE_TYPES,
        effectiveVersionSelector: data.versionSelector ?? { mode: "published" as const },
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Re-ranks an already-fetched result set consistently, without
 * re-fetching anything — pure, read-only, doesn't touch Prisma at all. */
export async function rankKnowledge(input: unknown) {
  try {
    const data = rankKnowledgeSchema.parse(input);
    if (data.results.length === 0) throw new AppError("No results provided to rank", 400, "EMPTY_INPUT");
    const ranked = rankResults(data.results, data.context ?? {});
    return { success: true as const, data: { results: ranked } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
