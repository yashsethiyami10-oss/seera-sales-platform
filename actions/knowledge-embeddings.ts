"use server";

import { requireStaff } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { storeEmbedding, searchSimilar, deleteEmbedding } from "@/lib/retrieval/embedding-service";

/**
 * MUV Intelligence Factory V4 Gap 1 — Semantic Retrieval Layer. Staff-gated
 * admin/ops surface for Sprint 6 (generate/inspect embeddings). Deliberately
 * separate from actions/retrieval.ts (Module 5), which is intentionally
 * caller-agnostic for real customer-facing retrieval — that real wiring is
 * Sprint 7's scope, not this one.
 */

export async function reindexKnowledgeEmbedding(targetType: string, targetId: string, text: string) {
  try {
    await requireStaff();
    const result = await storeEmbedding(targetType, targetId, text);
    return { success: true as const, data: result };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function searchKnowledgeEmbeddings(queryText: string, targetTypes?: string[], limit?: number) {
  try {
    await requireStaff();
    const matches = await searchSimilar(queryText, { targetTypes, limit });
    return { success: true as const, data: matches };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function removeKnowledgeEmbedding(targetType: string, targetId: string) {
  try {
    await requireStaff();
    const result = await deleteEmbedding(targetType, targetId);
    return { success: true as const, data: result };
  } catch (err) {
    return toErrorResponse(err);
  }
}
