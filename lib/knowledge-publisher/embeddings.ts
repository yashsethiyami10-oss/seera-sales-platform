import { storeEmbedding } from "@/lib/retrieval/embedding-service";
import { logger } from "@/lib/logger";

/**
 * MUV Knowledge Publisher™ — embedding hook (Stage 6).
 *
 * Reuses `lib/retrieval/embedding-service.ts` unchanged — the existing,
 * real `knowledge_embeddings` pgvector table already supports this. This
 * is the 7th `targetType` value added to that table's established (plain
 * String, not DB-enforced) vocabulary — see the schema's own comment on
 * `KnowledgeEmbedding` for why this is additive, not a change to it.
 *
 * `storeEmbedding()` itself already resolves the ACTIVE `AiProvider` row
 * and falls back to a deterministic MOCK embedding whenever no real
 * provider is configured — this hook adds no separate "which provider"
 * decision of its own, satisfying "keep embedding generation provider-
 * agnostic" and "do not activate an expensive live provider unless
 * configured" by construction, not by a flag this file would need to
 * check itself.
 *
 * Never throws — an embedding failure must never fail (or roll back) the
 * record publish it was generated for; the caller counts a `false`
 * return as "skipped," not as a publish failure.
 */
export const PUBLISHED_KNOWLEDGE_EMBEDDING_TARGET_TYPE = "PublishedKnowledgeRecord";

export async function embedPublishedRecord(sourceId: string, title: string, content: string): Promise<boolean> {
  try {
    await storeEmbedding(PUBLISHED_KNOWLEDGE_EMBEDDING_TARGET_TYPE, sourceId, `${title}\n\n${content}`);
    return true;
  } catch (err) {
    logger.error("knowledge-publisher:embedding-failed", { sourceId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
